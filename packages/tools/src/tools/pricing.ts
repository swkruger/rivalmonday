import { ToolError, toolkit } from '@cs/core';
import { type Db, pricePoint } from '@cs/db';
import { dailySeries, priceHistory, priceMatrix } from '@cs/engine';
import { and, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { workspaceBusinesses } from '../workspace/business';
import { workspaceClient } from '../workspace/scope';
import { requireTracked } from './pages';
import { PriceHistoryView, PriceMatrixView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;
const cellKey = (competitorId: string, serviceId: string) => `${competitorId}|${serviceId}`;

const lowestUsd = (prices: { amount: number; unit: string }[]): number | null => {
  const usd = prices.filter((p) => p.unit === 'USD').map((p) => p.amount);
  return usd.length ? Math.min(...usd) : null;
};

/** Lowest USD price shown at `at` per (competitor, service) — decision 3's "90 days ago" side. */
async function lowestUsdAt(db: Db, competitorIds: string[], verticalId: string, at: Date): Promise<Map<string, number>> {
  if (competitorIds.length === 0) return new Map();
  const rows = await db.select({ competitorId: pricePoint.competitorId, serviceId: pricePoint.serviceId, amount: sql<number>`min(${pricePoint.amount})` })
    .from(pricePoint)
    .where(and(
      inArray(pricePoint.competitorId, competitorIds), eq(pricePoint.verticalId, verticalId), eq(pricePoint.unit, 'USD'),
      lte(pricePoint.firstSeenAt, at), or(isNull(pricePoint.endedAt), gt(pricePoint.endedAt, at)),
    ))
    .groupBy(pricePoint.competitorId, pricePoint.serviceId);
  return new Map(rows.map((r) => [cellKey(r.competitorId, r.serviceId), Number(r.amount)]));
}

export const getPriceMatrix = defineTool({
  name: 'get_price_matrix',
  description: 'Current prices per service for each tracked competitor, with the change against 90 days ago.',
  input: z.object({ clientId: uuid, competitorId: uuid.optional() }),
  output: PriceMatrixView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    if (input.competitorId) await requireTracked(deps.app, ctx, c.id, input.competitorId);
    // priceMatrix reads client_competitor and the global price_point with the service Db — the client was proved through RLS above.
    const m = await priceMatrix({ db: deps.service, packs: packsOf(deps) }, c.id);
    const rows = input.competitorId ? m.rows.filter((r) => r.competitorId === input.competitorId) : m.rows;
    const then = await lowestUsdAt(deps.service, rows.map((r) => r.competitorId), c.verticalId, new Date(Date.now() - 90 * DAY));
    const shown = new Set(rows.flatMap((r) => Object.keys(r.cells)));
    const services = m.services.filter((s) => shown.has(s.id));
    return {
      services: services.map((s) => ({ ...s, offered: c.services.includes(s.id) })),
      rows: rows.map((r) => ({
        competitorId: r.competitorId,
        name: r.name,
        cells: services.filter((s) => r.cells[s.id]?.length).map((s) => {
          const prices = r.cells[s.id]!;
          const now = lowestUsd(prices);
          const before = then.get(cellKey(r.competitorId, s.id)) ?? null;
          return {
            serviceId: s.id,
            prices: prices.map((p) => ({ amount: p.amount, unit: p.unit, qualifier: p.qualifier, promo: p.promo, since: p.since.toISOString() })),
            change: now !== null && before !== null && now !== before ? { before, after: now } : null,
          };
        }),
      })),
    };
  },
});

/** Every 7th index counting back from the last (today), oldest first. */
const weeklyIndexes = (n: number): number[] => {
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= 7) out.unshift(i);
  return out;
};

export const getPriceHistory = defineTool({
  name: 'get_price_history',
  description: 'Weekly lowest price of one service for each tracked competitor; empty (null) before a price was seen.',
  input: z.object({
    clientId: uuid,
    serviceId: z.string().regex(/^[a-z0-9_]{1,64}$/),
    competitorId: uuid.optional(),
    days: z.union([z.literal(90), z.literal(180), z.literal(365)]).default(90),
  }),
  output: PriceHistoryView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const service = pack.services.find((s) => s.id === input.serviceId);
    if (!service) throw new ToolError('invalid_input', 'Unknown service');
    if (input.competitorId) await requireTracked(deps.app, ctx, c.id, input.competitorId);
    const tracked = (await workspaceBusinesses(deps, ctx, c)).filter((b) => !b.self && (!input.competitorId || b.key === input.competitorId));
    const now = new Date();
    const since = new Date(now.getTime() - input.days * DAY);
    const days = dailySeries([], since, now);
    const idx = weeklyIndexes(days.length);
    const series: PriceHistoryView['series'] = [];
    for (const b of tracked) {
      // Global price_point rows � visibility proved by workspaceBusinesses (RLS).
      const spans = await priceHistory(deps.service, { competitorId: b.competitorId!, verticalId: c.verticalId, serviceId: service.id, since });
      const daily = dailySeries(spans, since, now);
      const points = idx.map((i) => daily[i]!.min);
      if (points.some((p) => p !== null)) series.push({ competitorId: b.competitorId!, name: b.name, points });
    }
    return { serviceId: service.id, serviceName: service.name, labels: idx.map((i) => days[i]!.date), series };
  },
});

export const pricingTools = [getPriceMatrix, getPriceHistory];
