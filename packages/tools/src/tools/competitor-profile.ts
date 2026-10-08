import { toolkit } from '@cs/core';
import { ad, changeEvent, clientCompetitor, competitor, competitorSource, eventScore, move, observation, withTenant } from '@cs/db';
import { gbpSummary } from '@cs/collectors';
import { and, asc, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { MOVE_LABELS, pressureByClient } from '../pressure';
import { eventRowSelect, toEventRow } from '../workspace/events-read';
import { sourceLabel } from '../workspace/labels';
import { clientEvents, eventJoin, workspaceClient } from '../workspace/scope';
import { liveEventCount } from './moves';
import { requireTracked } from './pages';
import { CompetitorProfile, TimelineItem, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

export const getCompetitorProfile = defineTool({
  name: 'get_competitor_profile',
  description: 'A tracked competitor at a glance: GBP rating, active ads, pressure, open moves and collection status.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: CompetitorProfile,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId, competitorId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    await requireTracked(deps.app, ctx, c.id, competitorId);
    const now = new Date();
    const [link, pressure, openMoves] = await withTenant(deps.app, ctx, async (tx) => {
      const [linkRow] = await tx.select({ addedAt: clientCompetitor.createdAt }).from(clientCompetitor)
        .where(and(eq(clientCompetitor.clientId, c.id), eq(clientCompetitor.competitorId, competitorId)));
      const pressureMap = await pressureByClient(tx, [c.id], now);
      const p = pressureMap.get(c.id)?.find((x) => x.competitorId === competitorId)?.pressure ?? { score: 0, level: 'low' as const, reasons: ['Quiet'] };
      const [openRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(move)
        .where(and(eq(move.clientId, c.id), eq(move.competitorId, competitorId), isNull(move.closedAt), sql`${liveEventCount} > 0`));
      return [linkRow, p, Number(openRow?.n ?? 0)] as const;
    });
    // Global rows — visibility already proved by requireTracked.
    const [comp] = await deps.service.select().from(competitor).where(eq(competitor.id, competitorId));
    const [gbp] = await deps.service.select({ data: observation.data, at: observation.observedAt }).from(observation)
      .where(and(eq(observation.competitorId, competitorId), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
      .orderBy(desc(observation.observedAt)).limit(1);
    const ads = await deps.service.select({ platform: ad.platform, n: sql<number>`count(*)::int` }).from(ad)
      .where(and(eq(ad.competitorId, competitorId), eq(ad.isActive, true))).groupBy(ad.platform);
    const sources = await deps.service.select().from(competitorSource).where(eq(competitorSource.competitorId, competitorId)).orderBy(asc(competitorSource.source));
    const [pages] = (await deps.service.execute(sql`
      SELECT count(*)::int AS active,
             count(*) FILTER (WHERE l.status IN ('blocked', 'robots_disallowed'))::int AS blocked
      FROM tracked_page p
      LEFT JOIN LATERAL (SELECT status FROM capture c WHERE c.tracked_page_id = p.id ORDER BY captured_at DESC LIMIT 1) l ON true
      WHERE p.competitor_id = ${competitorId}::uuid AND p.active`)) as unknown as { active: number; blocked: number }[];
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
  description: 'A tracked competitor’s recent activity: scored events and move starts, newest first.',
  input: z.object({ clientId: uuid, competitorId: uuid, days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90) }),
  output: z.object({ items: z.array(TimelineItem) }),
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    await requireTracked(deps.app, ctx, c.id, input.competitorId);
    const since = new Date(Date.now() - input.days * DAY);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    const [events, moves] = await withTenant(deps.app, ctx, async (tx) => [
      await tx.select(eventRowSelect).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked).innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(clientEvents(c.id), eq(changeEvent.competitorId, input.competitorId), gte(changeEvent.occurredAt, since))).orderBy(desc(changeEvent.occurredAt)).limit(200),
      await tx.select({ id: move.id, moveType: move.moveType, status: move.status, summary: move.summary, at: move.firstDetectedAt, closedAt: move.closedAt }).from(move)
        .where(and(eq(move.clientId, c.id), eq(move.competitorId, input.competitorId), or(gte(move.firstDetectedAt, since), isNull(move.closedAt)), sql`${liveEventCount} > 0`)),
    ] as const);
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
