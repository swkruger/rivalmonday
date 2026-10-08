import { isAgencyRole, toolkit } from '@cs/core';
import { gbpSummary } from '@cs/collectors';
import { changeEvent, clientCompetitor, competitor, eventScore, type NumericChange, observation, prospectReport, withTenant } from '@cs/db';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pressureByClient } from '../pressure';
import { adWeeklySeries } from '../workspace/ads';
import { clientEvents, eventJoin, workspaceClient } from '../workspace/scope';
import { AdActivityView, WorkspaceOverview } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

export const getAdActivity = defineTool({
  name: 'get_ad_activity',
  description: 'Weekly count of active ads per tracked competitor; a week is empty (null) before ads were first checked.',
  input: z.object({ clientId: uuid, weeks: z.number().int().min(4).max(26).default(12), competitorId: uuid.optional() }),
  output: AdActivityView,
  permission: 'read',
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

const isPriceCut = (f: NumericChange): boolean =>
  f.kind === 'price' && typeof f.before?.value === 'number' && typeof f.after?.value === 'number' && f.after.value < f.before.value;

/** Sum of the given points, or null when every point is null (decision 12). */
const sumPoints = (points: (number | null)[]): number | null =>
  points.every((p) => p === null) ? null : points.reduce<number>((s, p) => s + (p ?? 0), 0);

export const getWorkspaceOverview = defineTool({
  name: 'get_workspace_overview',
  description: 'A client workspace at a glance: changes, alerts and price moves this week, active ads, ratings and competitor pressure.',
  input: z.object({ clientId: uuid }),
  output: WorkspaceOverview,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const now = new Date();
    const since = new Date(now.getTime() - 7 * DAY);
    const recent = and(clientEvents(c.id), gte(eventScore.scoredAt, since));
    const { tracked, pressure, counts, priceRows, latestReport } = await withTenant(deps.app, ctx, async (tx) => {
      const trackedRows = await tx.select({ id: competitor.id, name: competitor.name }).from(clientCompetitor)
        .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId)).where(eq(clientCompetitor.clientId, c.id));
      const pressureMap = await pressureByClient(tx, [c.id], now);
      const [countRow] = await tx.select({
        changes: sql<number>`count(*) FILTER (WHERE ${eventScore.route} IN ('alert', 'brief'))::int`,
        alerts: sql<number>`count(*) FILTER (WHERE ${eventScore.route} = 'alert')::int`,
      }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked).where(recent);
      // Decision 12: price moves count on every route.
      const prices = await tx.select({ services: changeEvent.services, facts: changeEvent.facts }).from(eventScore).innerJoin(changeEvent, eventJoin.change)
        .innerJoin(clientCompetitor, eventJoin.tracked).where(and(recent, eq(changeEvent.changeType, 'price_change')));
      // Preflight F11: only the latest report counts, as `get_prospect_report` shows only that one.
      const [report] = isAgencyRole(ctx.role)
        ? await tx.select({ status: prospectReport.status }).from(prospectReport).where(eq(prospectReport.clientId, c.id)).orderBy(desc(prospectReport.createdAt)).limit(1)
        : [];
      return { tracked: trackedRows, pressure: pressureMap.get(c.id) ?? [], counts: countRow, priceRows: prices, latestReport: report };
    });

    const priceMoves = priceRows.filter((r) => {
      const service = r.services?.[c.verticalId];
      return !!service && c.services.includes(service);
    });

    // Global rows (`ad`, `capture`, `observation`) — visibility proved by the RLS reads above (the self business through
    // `client.self_competitor_id`).
    const trackedIds = tracked.map((t) => t.id);
    const ads = await adWeeklySeries(deps.service, trackedIds, now, 2);
    const ratingIds = [...trackedIds, ...(c.selfCompetitorId ? [c.selfCompetitorId] : [])];
    const gbp = ratingIds.length === 0 ? [] : await deps.service.selectDistinctOn([observation.competitorId], { competitorId: observation.competitorId, data: observation.data })
      .from(observation).where(and(inArray(observation.competitorId, ratingIds), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
      .orderBy(observation.competitorId, desc(observation.observedAt));
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
      activeAds: sumPoints(trackedIds.map((id) => ads.get(id)?.[1] ?? null)),
      activeAds7dAgo: sumPoints(trackedIds.map((id) => ads.get(id)?.[0] ?? null)),
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
