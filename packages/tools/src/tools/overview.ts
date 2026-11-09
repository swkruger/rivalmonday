import { isAgencyRole, toolkit } from '@cs/core';
import { clientCompetitor, competitor, prospectReport, withTenant } from '@cs/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { adWeeklySeries, kpiEventReads, kpiGlobalReads, pressureByClient, workspaceKpis } from '@cs/engine';
import { allInOrder, workspaceClient } from '../workspace/scope';
import { AdActivityView, WorkspaceOverview } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

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
    // Launch-gate 6a: the client check and every RLS read start together; the reads are pipelined in one transaction
    // (none needs another's result). `clientId` is the checked client's id; the client's refusal still comes first.
    const [c, { tracked, pressure, events, latestReport }] = await allInOrder([
      workspaceClient(deps, ctx, clientId),
      withTenant(deps.app, ctx, async (tx) => {
        const [trackedRows, pressureMap, eventRows, [report]] = await Promise.all([
          tx.select({ id: competitor.id, name: competitor.name }).from(clientCompetitor)
            .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId)).where(eq(clientCompetitor.clientId, clientId)),
          pressureByClient(tx, [clientId], now),
          // The KPI event reads, shared with the weekly report (`@cs/engine` kpi.ts).
          kpiEventReads(tx, clientId, now),
          // Preflight F11: only the latest report counts, as `get_prospect_report` shows only that one.
          isAgencyRole(ctx.role)
            ? tx.select({ status: prospectReport.status }).from(prospectReport).where(eq(prospectReport.clientId, clientId)).orderBy(desc(prospectReport.createdAt)).limit(1)
            : Promise.resolve([]),
        ]);
        return { tracked: trackedRows, pressure: pressureMap.get(clientId) ?? [], events: eventRows, latestReport: report };
      }),
    ]);

    // Global rows (`ad`, `capture`, `observation`) — visibility proved by the RLS reads above (the self business through
    // `client.self_competitor_id`).
    const trackedIds = tracked.map((t) => t.id);
    const globals = await kpiGlobalReads(deps.service, trackedIds, c.selfCompetitorId, now);
    const k = workspaceKpis(c, trackedIds, events, globals, now);

    return {
      clientId: c.id,
      trackedCompetitors: tracked.length,
      zips: c.zips,
      changes7d: k.changes7d,
      alerts7d: k.alerts7d,
      priceMoves7d: k.priceMoves7d,
      priceCuts7d: k.priceCuts7d,
      activeAds: k.activeAds,
      activeAds7dAgo: k.activeAds7dAgo,
      weekly: k.weekly,
      rating: { self: k.ratingSelf, competitorAverage: k.ratingAvg },
      pressure: pressure.map((p) => ({ competitorId: p.competitorId, name: p.name, pressure: p.pressure })),
      pitchSnapshot: latestReport?.status === 'ready',
    };
  },
});

export const overviewTools = [getAdActivity, getWorkspaceOverview];
