import { toolkit } from '@cs/core';
import { ad, changeEvent, clientCompetitor, competitor, competitorSource, eventScore, move, observation, withTenant } from '@cs/db';
import { gbpSummary } from '@cs/collectors';
import { and, asc, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { MOVE_LABELS, pressureByClient } from '../pressure';
import { eventRowSelect, toEventRow } from '../workspace/events-read';
import { sourceLabel } from '../workspace/labels';
import { allInOrder, clientEvents, eventJoin, liveEventCount, workspaceClient } from '../workspace/scope';
import { requireTracked } from './pages';
import { CompetitorProfile, TimelineItem, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

export const getCompetitorProfile = defineTool({
  name: 'get_competitor_profile',
  access: 'read',
  description: 'A tracked competitor at a glance: GBP rating, active ads, pressure, open moves and collection status.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: CompetitorProfile,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, { clientId, competitorId }, deps) {
    const now = new Date();
    // Launch-gate 6a: the client check, the tracked check and the RLS reads (pipelined in one transaction) start together;
    // `allInOrder` keeps the refusals in their old order (client, then competitor). `clientId` is the checked client's id.
    const [, , [link, pressure, openMoves]] = await allInOrder([
      workspaceClient(deps, ctx, clientId),
      requireTracked(deps.app, ctx, clientId, competitorId),
      withTenant(deps.app, ctx, async (tx) => {
        const [[linkRow], pressureMap, [openRow]] = await Promise.all([
          tx.select({ addedAt: clientCompetitor.createdAt }).from(clientCompetitor)
            .where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))),
          pressureByClient(tx, [clientId], now),
          tx.select({ n: sql<number>`count(*)::int` }).from(move)
            .where(and(eq(move.clientId, clientId), eq(move.competitorId, competitorId), isNull(move.closedAt), sql`${liveEventCount} > 0`)),
        ]);
        const p = pressureMap.get(clientId)?.find((x) => x.competitorId === competitorId)?.pressure ?? { score: 0, level: 'low' as const, reasons: ['Quiet'] };
        return [linkRow, p, Number(openRow?.n ?? 0)] as const;
      }),
    ]);
    // Global rows — visibility already proved by requireTracked. Independent reads: one stage.
    const [[comp], [gbp], ads, sources, [pages]] = await Promise.all([
      deps.service.select().from(competitor).where(eq(competitor.id, competitorId)),
      deps.service.select({ data: observation.data, at: observation.observedAt }).from(observation)
        .where(and(eq(observation.competitorId, competitorId), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
        .orderBy(desc(observation.observedAt)).limit(1),
      deps.service.select({ platform: ad.platform, n: sql<number>`count(*)::int` }).from(ad)
        .where(and(eq(ad.competitorId, competitorId), eq(ad.isActive, true))).groupBy(ad.platform),
      deps.service.select().from(competitorSource).where(eq(competitorSource.competitorId, competitorId)).orderBy(asc(competitorSource.source)),
      deps.service.execute(sql`
      SELECT count(*)::int AS active,
             count(*) FILTER (WHERE l.status IN ('blocked', 'robots_disallowed'))::int AS blocked
      FROM tracked_page p
      LEFT JOIN LATERAL (SELECT status FROM capture c WHERE c.tracked_page_id = p.id ORDER BY captured_at DESC LIMIT 1) l ON true
      WHERE p.competitor_id = ${competitorId}::uuid AND p.active`) as unknown as Promise<{ active: number; blocked: number }[]>,
    ]);
    const g = gbpSummary(gbp?.data ?? null);
    return {
      competitorId, name: comp!.name, domain: comp!.domain, placeId: comp!.placeId, addedAt: link!.addedAt.toISOString(),
      gbp: g ? { rating: g.rating, reviews: g.reviews, category: g.category } : null, gbpAsOf: gbp ? gbp.at.toISOString() : null,
      activeAds: { google: Number(ads.find((a) => a.platform === 'google')?.n ?? 0), meta: Number(ads.find((a) => a.platform === 'meta')?.n ?? 0) },
      pressure, openMoves,
      sources: sources.map((s) => ({ source: s.source, label: sourceLabel(s.source), active: s.active, lastRunAt: toIso(s.lastRunAt), lastStatus: s.lastStatus ?? null })),
      pages: { active: Number(pages?.active ?? 0), blocked: Number(pages?.blocked ?? 0) },
    };
  },
});

export const getCompetitorTimeline = defineTool({
  name: 'get_competitor_timeline',
  access: 'read',
  description: 'A tracked competitor’s recent activity: scored events and move starts, newest first.',
  input: z.object({ clientId: uuid, competitorId: uuid, days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90) }),
  output: z.object({ items: z.array(TimelineItem) }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const since = new Date(Date.now() - input.days * DAY);
    // Launch-gate 6a: the client check, the tracked check and both RLS reads (pipelined in one transaction) start together;
    // refusals keep their order (`allInOrder`). `input.clientId` is the checked client's id.
    const [c, , [events, moves]] = await allInOrder([
      workspaceClient(deps, ctx, input.clientId),
      requireTracked(deps.app, ctx, input.clientId, input.competitorId),
      withTenant(deps.app, ctx, (tx) => Promise.all([
        tx.select(eventRowSelect).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked).innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
          .where(and(clientEvents(input.clientId), eq(changeEvent.competitorId, input.competitorId), gte(changeEvent.occurredAt, since))).orderBy(desc(changeEvent.occurredAt)).limit(200),
        tx.select({ id: move.id, moveType: move.moveType, status: move.status, summary: move.summary, at: move.firstDetectedAt, closedAt: move.closedAt }).from(move)
          .where(and(eq(move.clientId, input.clientId), eq(move.competitorId, input.competitorId), or(gte(move.firstDetectedAt, since), isNull(move.closedAt)), sql`${liveEventCount} > 0`)),
      ])),
    ]);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    const items: TimelineItem[] = [
      ...events.map((e) => {
        const r = toEventRow(e, c.verticalId, names);
        return { kind: 'event' as const, id: r.eventId, at: r.occurredAt, title: r.summary, label: r.typeLabel, score: r.score, route: r.route, status: null };
      }),
      ...moves.map((m) => ({ kind: 'move' as const, id: m.id, at: m.at.toISOString(), title: m.summary, label: MOVE_LABELS[m.moveType] ?? m.moveType, score: null, route: null, status: m.closedAt ? 'closed' : m.status })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return { items };
  },
});

export const competitorProfileTools = [getCompetitorProfile, getCompetitorTimeline];
