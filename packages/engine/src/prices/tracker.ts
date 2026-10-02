import { client, clientCompetitor, competitor, type Db, type PriceQualifier, pricePoint, trackedPage } from '@cs/db';
import { and, asc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';

const DAY_MS = 86_400_000;

export interface PriceNow {
  amount: number;
  unit: string;
  qualifier: PriceQualifier;
  promo: boolean;
  since: Date;
  pageUrl: string;
}

export interface PriceMatrixRow {
  competitorId: string;
  name: string;
  /** Service id → prices shown now, lowest first. */
  cells: Record<string, PriceNow[]>;
}

export interface PriceMatrix {
  clientId: string;
  verticalId: string;
  /** Services with at least one current price, in vertical-pack order. */
  services: { id: string; name: string }[];
  rows: PriceMatrixRow[];
}

/** Spec §5.2 module 4 "service × business price matrix": every tracked competitor's current prices per service. */
export async function priceMatrix(deps: { db: Db; packs: PackLoader }, clientId: string): Promise<PriceMatrix> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const pack = await deps.packs(c.verticalId);
  const tracked = await deps.db
    .select({ id: competitor.id, name: competitor.name })
    .from(clientCompetitor)
    .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(eq(clientCompetitor.clientId, clientId))
    .orderBy(asc(competitor.name));
  const result: PriceMatrix = { clientId, verticalId: c.verticalId, services: [], rows: [] };
  if (tracked.length === 0) return result;
  const open = await deps.db
    .select({ p: pricePoint, url: trackedPage.url })
    .from(pricePoint)
    .innerJoin(trackedPage, eq(trackedPage.id, pricePoint.trackedPageId))
    .where(and(inArray(pricePoint.competitorId, tracked.map((t) => t.id)), eq(pricePoint.verticalId, c.verticalId), isNull(pricePoint.endedAt)))
    .orderBy(asc(pricePoint.amount));
  const priced = new Set(open.map((o) => o.p.serviceId));
  result.services = pack.services.filter((s) => priced.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
  result.rows = tracked.map((t) => {
    const cells: Record<string, PriceNow[]> = {};
    for (const { p, url } of open.filter((o) => o.p.competitorId === t.id)) {
      (cells[p.serviceId] ??= []).push({ amount: p.amount, unit: p.unit, qualifier: p.qualifier, promo: p.promo, since: p.firstSeenAt, pageUrl: url });
    }
    return { competitorId: t.id, name: t.name, cells };
  });
  return result;
}

export interface PriceSpan {
  amount: number;
  unit: string;
  qualifier: PriceQualifier;
  promo: boolean;
  from: Date;
  /** First capture that no longer showed the price; null while it is still shown. */
  to: Date | null;
  lastSeenAt: Date;
}

/** Spans of one competitor's prices for one service that were shown at any time since `since`. */
export async function priceHistory(db: Db, q: { competitorId: string; verticalId: string; serviceId: string; since: Date }): Promise<PriceSpan[]> {
  const rows = await db
    .select()
    .from(pricePoint)
    .where(
      and(
        eq(pricePoint.competitorId, q.competitorId), eq(pricePoint.verticalId, q.verticalId), eq(pricePoint.serviceId, q.serviceId),
        or(isNull(pricePoint.endedAt), gte(pricePoint.endedAt, q.since)),
      ),
    )
    .orderBy(asc(pricePoint.firstSeenAt), asc(pricePoint.amount));
  return rows.map((p) => ({ amount: p.amount, unit: p.unit, qualifier: p.qualifier, promo: p.promo, from: p.firstSeenAt, to: p.endedAt, lastSeenAt: p.lastSeenAt }));
}

/** Daily (UTC) min/max of the prices shown in `unit`, from `from`'s day to `to`'s day inclusive — the pricing-tracker history chart. */
export function dailySeries(spans: PriceSpan[], from: Date, to: Date, unit = 'USD'): { date: string; min: number | null; max: number | null }[] {
  const out: { date: string; min: number | null; max: number | null }[] = [];
  const first = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let start = first; start <= to.getTime(); start += DAY_MS) {
    const end = start + DAY_MS;
    const shown = spans.filter((s) => s.unit === unit && s.from.getTime() < end && (s.to === null || s.to.getTime() > start)).map((s) => s.amount);
    out.push({ date: new Date(start).toISOString().slice(0, 10), min: shown.length > 0 ? Math.min(...shown) : null, max: shown.length > 0 ? Math.max(...shown) : null });
  }
  return out;
}
