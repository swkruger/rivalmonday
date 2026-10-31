import { toolkit } from '@cs/core';
import { alert, brief, client, clientSetup, effectiveLimitUsd, eventScore, readSpendGuardSettings, recommendation, withTenant } from '@cs/db';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, max, ne, or, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pickingOwnerFirstName } from '../setup/owner-contact';
import { getSetupState, isSettledStep } from '../setup/state';
import { combinePressure, pressureByClient } from '../pressure';
import { monthStart, spendByClient } from '../usage';
import { PortfolioRow } from './schemas';
import { creditsView } from './usage';

const { defineTool } = toolkit<ToolDeps>();
/** Drizzle's `max()` over a timestamp can come back as a string depending on driver/dialect; normalise before comparing. */
const asDate = (d: Date | string | null | undefined): Date | null => (d == null ? null : d instanceof Date ? d : new Date(d));
const latest = (...ds: (Date | string | null | undefined)[]) =>
  ds.map(asDate).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

const TREND_WEEKS = 8;
const WEEK = 7 * 86_400_000;

export const getPortfolio = defineTool({
  name: 'get_portfolio',
  access: 'read',
  description: 'Every client this agency user can see, with alerts waiting, a brief to approve, competitive pressure and last activity.',
  input: z.object({}),
  output: z.object({
    items: z.array(PortfolioRow),
    /** Oldest first, 8 rolling 7-day windows ending now: today's clients by start date (not past headcount), alerts raised and briefs produced. Only these clients. */
    trends: z.object({ clients: z.array(z.number().int()), alerts: z.array(z.number().int()), briefs: z.array(z.number().int()) }).optional(),
  }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const since = monthStart(now);
    return withTenant(deps.app, ctx, async (tx) => {
      const clients = await tx.select({ id: client.id, createdAt: client.createdAt, name: client.name, verticalId: client.verticalId, cap: client.spendLimitUsd, spendPausedAt: client.spendPausedAt }).from(client).where(eq(client.status, 'active')).orderBy(asc(client.name));
      const ids = clients.map((c) => c.id);
      if (ids.length === 0) return { items: [] };
      const settings = await readSpendGuardSettings(deps.service);
      const trendSince = new Date(now.getTime() - TREND_WEEKS * WEEK);
      const [alertTimes, briefTimes] = await Promise.all([
        tx.select({ at: alert.createdAt }).from(alert).where(and(inArray(alert.clientId, ids), gte(alert.createdAt, trendSince), notInArray(alert.status, ['drafting', 'withdrawn']))),
        tx.select({ at: brief.createdAt }).from(brief).where(and(inArray(brief.clientId, ids), gte(brief.createdAt, trendSince), notInArray(brief.status, ['generating', 'failed']))),
      ]);
      const weekly = (rows: { at: Date }[]) => {
        const out = Array<number>(TREND_WEEKS).fill(0);
        for (const { at } of rows) {
          // A row stamped after `now` (database clock, or written mid-request) belongs in the latest window.
          const i = Math.min(TREND_WEEKS - 1, TREND_WEEKS - 1 - Math.floor((now.getTime() - at.getTime()) / WEEK));
          if (i >= 0) out[i]! += 1;
        }
        return out;
      };
      const trends = {
        clients: Array.from({ length: TREND_WEEKS }, (_, i) => clients.filter((c) => c.createdAt.getTime() <= now.getTime() - (TREND_WEEKS - 1 - i) * WEEK).length),
        alerts: weekly(alertTimes),
        briefs: weekly(briefTimes),
      };
      const [pending, delivered, ready, recs, lastScore, lastAlert, lastSent, pressure, spend, openSetups] = await Promise.all([
        tx.select({ id: alert.clientId, n: count() }).from(alert).where(and(inArray(alert.clientId, ids), eq(alert.status, 'pending_review'))).groupBy(alert.clientId),
        tx.select({ id: alert.clientId, n: count() }).from(alert).where(and(inArray(alert.clientId, ids), eq(alert.status, 'delivered'), gte(alert.deliveredAt, weekAgo))).groupBy(alert.clientId),
        tx.select({ id: brief.id, clientId: brief.clientId, deliveryDate: brief.deliveryDate }).from(brief).where(and(inArray(brief.clientId, ids), eq(brief.status, 'ready'))).orderBy(desc(brief.deliveryDate)),
        tx.select({ id: recommendation.clientId, n: count() }).from(recommendation).where(and(inArray(recommendation.clientId, ids), inArray(recommendation.status, ['todo', 'in_progress']))).groupBy(recommendation.clientId),
        tx.select({ id: eventScore.clientId, at: max(eventScore.scoredAt) }).from(eventScore).where(and(inArray(eventScore.clientId, ids), ne(eventScore.route, 'archive'))).groupBy(eventScore.clientId),
        tx.select({ id: alert.clientId, at: max(alert.createdAt) }).from(alert).where(inArray(alert.clientId, ids)).groupBy(alert.clientId),
        tx.select({ id: brief.clientId, at: max(brief.sentAt) }).from(brief).where(inArray(brief.clientId, ids)).groupBy(brief.clientId),
        pressureByClient(tx, ids, now),
        spendByClient(deps.service, ids, since),
        // Open setups, plus completed ones still waiting on the owner's pick (O12); never dismissed ones.
        tx.select({ id: clientSetup.clientId }).from(clientSetup).where(and(
          inArray(clientSetup.clientId, ids), isNull(clientSetup.dismissedAt),
          or(isNull(clientSetup.completedAt), and(isNotNull(clientSetup.ownerPickRequestedAt), isNull(clientSetup.competitorsDoneAt))),
        )),
      ]);
      // Only clients with an open (or owner-pick) setup row need the derived step states (a handful at most). Tenant-visible
      // ids; the state's contact/invite/billing reads need the service connection.
      const setupBy = new Map((await Promise.all(openSetups.map(async ({ id }) => {
        const s = await getSetupState(deps.service, id);
        const waiting = s.competitors === 'waiting_owner';
        if (!s.open && !waiting) return null;
        const totalSteps = (s.totalSteps + 1) as 6 | 7; // + the All set screen
        const waitingOnOwner = waiting ? { firstName: await pickingOwnerFirstName(deps.service, ctx.agencyId, id) } : null;
        return [id, { open: s.open, doneSteps: Object.values(s.steps).filter(isSettledStep).length, totalSteps, waitingOnOwner }] as const;
      }))).filter((x) => x !== null));
      const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
      const [p, d, r, ls, la, lb] = [byId(pending), byId(delivered), byId(recs), byId(lastScore), byId(lastAlert), byId(lastSent)];
      return {
        trends,
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
            credits: creditsView(spend.get(c.id) ?? 0, effectiveLimitUsd(c.cap, settings), c.spendPausedAt, settings), setup: setupBy.get(c.id) ?? null,
          };
        }),
      };
    });
  },
});

export const portfolioTools = [getPortfolio];
