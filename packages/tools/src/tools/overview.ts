import { isAgencyRole, toolkit } from '@cs/core';
import { gbpSummary } from '@cs/collectors';
import { changeEvent, clientCompetitor, competitor, eventScore, observation, prospectReport, withTenant } from '@cs/db';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { adWeeklySeries, isPriceCut, pressureByClient, sumPoints, weeklyCounts } from '@cs/engine';
import { allInOrder, clientEvents, eventJoin, workspaceClient } from '../workspace/scope';
import { AdActivityView, WorkspaceOverview } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;
const TREND_WEEKS = 8;

export const getAdActivity = defineTool({
  name: 'get_ad_activity',
  access: 'read',
  description: 'Weekly count of active ads per tracked competitor; a week is empty (null) before ads were first checked.',
  input: z.object({ clientId: uuid, weeks: z.number().int().min(4).max(26).default(12), competitorId: uuid.optional() }),
  output: AdActivityView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const now = Date.now();
    const conds = [eq(clientCompetitor.clientId, c.id)];
    if (input.competitorId) conds.push(eq(competitor.id, input.competitorId));
    const tracked = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: competitor.id, name: competitor.name }).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
        .where(and(...conds)).orderBy(asc(competitor.name)));
    // Global `ad`/`capture` rows — visibility proved by the RLS read above.
    const series = await adWeeklySeries(deps.service, tracked.map((t) => t.id), new Date(now), input.weeks);
    return {
      weeks: Array.from({ length: input.weeks }, (_, k) => new Date(now - (input.weeks - 1 - k) * 7 * DAY).toISOString().slice(0, 10)),
      series: tracked.map((t) => ({ competitorId: t.id, name: t.name, points: series.get(t.id)! })),
    };
  },
});

export const getWorkspaceOverview = defineTool({
  name: 'get_workspace_overview',
  access: 'read',
  description: 'A client workspace at a glance: changes, alerts and price moves this week, active ads, ratings and competitor pressure.',
  input: z.object({ clientId: uuid }),
  output: WorkspaceOverview,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId }, deps) {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * DAY);
    const recent = and(clientEvents(clientId), gte(eventScore.scoredAt, since));
    const trendSince = new Date(now.getTime() - TREND_WEEKS * 7 * DAY);
    // Launch-gate 6a: the client check and every RLS read start together; the reads are pipelined in one transaction
    // (none needs another's result). `clientId` is the checked client's id; the client's refusal still comes first.
    const [c, { tracked, pressure, counts, priceRows, routedRows, latestReport }] = await allInOrder([
      workspaceClient(deps, ctx, clientId),
      withTenant(deps.app, ctx, async (tx) => {
        const [trackedRows, pressureMap, [countRow], prices, routed, [report]] = await Promise.all([
          tx.select({ id: competitor.id, name: competitor.name }).from(clientCompetitor)
            .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId)).where(eq(clientCompetitor.clientId, clientId)),
          pressureByClient(tx, [clientId], now),
          tx.select({
            changes: sql<number>`count(*) FILTER (WHERE ${eventScore.route} IN ('alert', 'brief'))::int`,
            alerts: sql<number>`count(*) FILTER (WHERE ${eventScore.route} = 'alert')::int`,
          }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked).where(recent),
          // Decision 12: price moves count on every route.
          tx.select({ scoredAt: eventScore.scoredAt, services: changeEvent.services, facts: changeEvent.facts }).from(eventScore).innerJoin(changeEvent, eventJoin.change)
            .innerJoin(clientCompetitor, eventJoin.tracked).where(and(clientEvents(clientId), gte(eventScore.scoredAt, trendSince), eq(changeEvent.changeType, 'price_change'))),
          tx.select({ scoredAt: eventScore.scoredAt }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
            .where(and(clientEvents(clientId), gte(eventScore.scoredAt, trendSince), inArray(eventScore.route, ['alert', 'brief']))),
          // Preflight F11: only the latest report counts, as `get_prospect_report` shows only that one.
          isAgencyRole(ctx.role)
            ? tx.select({ status: prospectReport.status }).from(prospectReport).where(eq(prospectReport.clientId, clientId)).orderBy(desc(prospectReport.createdAt)).limit(1)
            : Promise.resolve([]),
        ]);
        return { tracked: trackedRows, pressure: pressureMap.get(clientId) ?? [], counts: countRow, priceRows: prices, routedRows: routed, latestReport: report };
      }),
    ]);

    const allPriceMoves = priceRows.filter((r) => {
      const service = r.services?.[c.verticalId];
      return !!service && c.services.includes(service);
    });
    const priceMoves = allPriceMoves.filter((r) => r.scoredAt >= since);

    // Global rows (`ad`, `capture`, `observation`) — visibility proved by the RLS reads above (the self business through
    // `client.self_competitor_id`).
    const trackedIds = tracked.map((t) => t.id);
    const ratingIds = [...trackedIds, ...(c.selfCompetitorId ? [c.selfCompetitorId] : [])];
    // Launch-gate 6a: the two global reads are independent; one stage.
    const [ads, gbp] = await Promise.all([
      adWeeklySeries(deps.service, trackedIds, now, TREND_WEEKS),
      ratingIds.length === 0 ? Promise.resolve([]) : deps.service.selectDistinctOn([observation.competitorId], { competitorId: observation.competitorId, data: observation.data })
        .from(observation).where(and(inArray(observation.competitorId, ratingIds), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
        .orderBy(observation.competitorId, desc(observation.observedAt)),
    ]);
    const adTotals = Array.from({ length: TREND_WEEKS }, (_, w) => sumPoints(trackedIds.map((id) => ads.get(id)?.[w] ?? null)));
    const ratingOf = (id: string) => gbpSummary(gbp.find((g) => g.competitorId === id)?.data ?? null)?.rating ?? null;
    const ratings = trackedIds.map(ratingOf).filter((r): r is number => r !== null);

    return {
      clientId: c.id,
      trackedCompetitors: tracked.length,
      zips: c.zips,
      changes7d: Number(counts?.changes ?? 0),
      alerts7d: Number(counts?.alerts ?? 0),
      priceMoves7d: priceMoves.length,
      priceCuts7d: priceMoves.filter((r) => (r.facts ?? []).some(isPriceCut)).length,
      activeAds: adTotals[TREND_WEEKS - 1]!,
      activeAds7dAgo: adTotals[TREND_WEEKS - 2]!,
      weekly: { changes: weeklyCounts(routedRows, now, TREND_WEEKS), priceMoves: weeklyCounts(allPriceMoves, now, TREND_WEEKS), activeAds: adTotals },
      rating: {
        self: c.selfCompetitorId ? ratingOf(c.selfCompetitorId) : null,
        competitorAverage: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
      },
      pressure: pressure.map((p) => ({ competitorId: p.competitorId, name: p.name, pressure: p.pressure })),
      pitchSnapshot: latestReport?.status === 'ready',
    };
  },
});

export const overviewTools = [getAdActivity, getWorkspaceOverview];
