import { toolkit } from '@cs/core';
import { alert, brief, client, eventScore, recommendation, withTenant } from '@cs/db';
import { and, asc, count, desc, eq, gte, inArray, max, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { combinePressure, pressureByClient } from '../pressure';
import { monthStart, spendByClient } from '../usage';
import { PortfolioRow } from './schemas';
import { spendView } from './usage';

const { defineTool } = toolkit<ToolDeps>();
/** Drizzle's `max()` over a timestamp can come back as a string depending on driver/dialect; normalise before comparing. */
const asDate = (d: Date | string | null | undefined): Date | null => (d == null ? null : d instanceof Date ? d : new Date(d));
const latest = (...ds: (Date | string | null | undefined)[]) =>
  ds.map(asDate).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

export const getPortfolio = defineTool({
  name: 'get_portfolio',
  description: 'Every client this agency user can see, with alerts waiting, a brief to approve, competitive pressure and last activity.',
  input: z.object({}),
  output: z.object({ items: z.array(PortfolioRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const since = monthStart(now);
    return withTenant(deps.app, ctx, async (tx) => {
      const clients = await tx.select({ id: client.id, name: client.name, verticalId: client.verticalId, cap: client.monthlyCapUsd }).from(client).where(eq(client.status, 'active')).orderBy(asc(client.name));
      const ids = clients.map((c) => c.id);
      if (ids.length === 0) return { items: [] };
      const [pending, delivered, ready, recs, lastScore, lastAlert, lastSent, pressure, spend] = await Promise.all([
        tx.select({ id: alert.clientId, n: count() }).from(alert).where(and(inArray(alert.clientId, ids), eq(alert.status, 'pending_review'))).groupBy(alert.clientId),
        tx.select({ id: alert.clientId, n: count() }).from(alert).where(and(inArray(alert.clientId, ids), eq(alert.status, 'delivered'), gte(alert.deliveredAt, weekAgo))).groupBy(alert.clientId),
        tx.select({ id: brief.id, clientId: brief.clientId, deliveryDate: brief.deliveryDate }).from(brief).where(and(inArray(brief.clientId, ids), eq(brief.status, 'ready'))).orderBy(desc(brief.deliveryDate)),
        tx.select({ id: recommendation.clientId, n: count() }).from(recommendation).where(and(inArray(recommendation.clientId, ids), inArray(recommendation.status, ['todo', 'in_progress']))).groupBy(recommendation.clientId),
        tx.select({ id: eventScore.clientId, at: max(eventScore.scoredAt) }).from(eventScore).where(and(inArray(eventScore.clientId, ids), ne(eventScore.route, 'archive'))).groupBy(eventScore.clientId),
        tx.select({ id: alert.clientId, at: max(alert.createdAt) }).from(alert).where(inArray(alert.clientId, ids)).groupBy(alert.clientId),
        tx.select({ id: brief.clientId, at: max(brief.sentAt) }).from(brief).where(inArray(brief.clientId, ids)).groupBy(brief.clientId),
        pressureByClient(tx, ids, now),
        spendByClient(deps.service, ids, since),
      ]);
      const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
      const [p, d, r, ls, la, lb] = [byId(pending), byId(delivered), byId(recs), byId(lastScore), byId(lastAlert), byId(lastSent)];
      return {
        items: clients.map((c) => {
          const comps = pressure.get(c.id) ?? [];
          const readyBrief = ready.find((b) => b.clientId === c.id);
          const last = latest(ls.get(c.id)?.at, la.get(c.id)?.at, lb.get(c.id)?.at);
          return {
            clientId: c.id, name: c.name, verticalId: c.verticalId,
            pressure: comps[0]?.pressure ?? combinePressure([]), topCompetitor: comps[0] && comps[0].pressure.score > 0 ? comps[0].name : null,
            alertsPending: p.get(c.id)?.n ?? 0, alertsDelivered7d: d.get(c.id)?.n ?? 0,
            briefToApprove: readyBrief ? { id: readyBrief.id, deliveryDate: readyBrief.deliveryDate } : null,
            openRecommendations: r.get(c.id)?.n ?? 0, lastActivityAt: last ? last.toISOString() : null,
            spend: spendView(spend.get(c.id) ?? 0, c.cap),
          };
        }),
      };
    });
  },
});

export const portfolioTools = [getPortfolio];
