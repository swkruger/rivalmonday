import { gbpSummary } from '@cs/collectors';
import { toolkit } from '@cs/core';
import { observation, review } from '@cs/db';
import { reviewBenchmark, themesForVertical } from '@cs/engine';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { workspaceBusinesses } from '../workspace/business';
import { workspaceClient } from '../workspace/scope';
import { RatingTrendView, ThemeBenchmarkView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

export const getThemeBenchmark = defineTool({
  name: 'get_theme_benchmark',
  description: 'Review themes, your business vs each tracked competitor: how often each theme comes up and how positively, last 90 days vs the 90 before.',
  input: z.object({ clientId: uuid }),
  output: ThemeBenchmarkView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const packs = packsOf(deps);
    // reviewBenchmark/themesForVertical read client_competitor, review, review_analysis and theme_proposal with the service
    // Db — the client was proved through RLS above, and they only reach its tracked competitors and its self business.
    const b = await reviewBenchmark({ db: deps.service, packs }, c.id);
    const themes = await themesForVertical(deps.service, await packs(c.verticalId));
    return {
      windowDays: b.windowDays, from: b.from.toISOString(), to: b.to.toISOString(),
      themes: themes.map((t) => ({ id: t.id, name: t.name })),
      businesses: b.businesses.map((x) => ({
        competitorId: x.competitorId, name: x.name, self: x.self, reviews: x.reviews, avgRating: x.avgRating, prevReviews: x.prevReviews, prevAvgRating: x.prevAvgRating,
        themes: x.themes.map((t) => ({ themeId: t.themeId, mentions: t.mentions, asked: t.asked, share: t.share, sentiment: t.sentiment, shareDelta: t.shareDelta, sentimentDelta: t.sentimentDelta })),
      })),
    };
  },
});

/** UTC calendar months `YYYY-MM`, the last one containing `now`. */
export function monthKeys(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - k), 1)).toISOString().slice(0, 7));
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export const getRatingTrend = defineTool({
  name: 'get_rating_trend',
  description: 'Per business: Google rating, reviews in 90 days, reviews per month, reply rate, star mix and monthly average stars.',
  input: z.object({ clientId: uuid, months: z.union([z.literal(6), z.literal(12)]).default(12) }),
  output: RatingTrendView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const businesses = (await workspaceBusinesses(deps, ctx, c)).filter((b) => b.competitorId !== null);
    const selfPending = c.placeId !== null && c.selfCompetitorId === null;
    const now = new Date();
    const months = monthKeys(now, input.months);
    if (businesses.length === 0) return { months, selfPending, businesses: [] };
    const ids = businesses.map((b) => b.competitorId!);
    const since90 = new Date(now.getTime() - 90 * DAY).toISOString();
    const since180 = new Date(now.getTime() - 180 * DAY).toISOString();
    const monthExpr = sql<string>`to_char(date_trunc('month', ${review.postedAt} AT TIME ZONE 'UTC'), 'YYYY-MM')`;
    // Global review/observation rows — visibility proved by workspaceBusinesses (RLS; the self row via client.self_competitor_id).
    const monthly = await deps.service
      .select({ competitorId: review.competitorId, month: monthExpr, n: sql<number>`count(*)::int`, avg: sql<number | null>`round(avg(${review.rating})::numeric, 2)::float8` })
      .from(review)
      .where(and(inArray(review.competitorId, ids), gte(review.postedAt, new Date(`${months[0]}-01T00:00:00Z`))))
      .groupBy(review.competitorId, monthExpr);
    const stats = await deps.service
      .select({
        competitorId: review.competitorId,
        n90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since90}::timestamptz)::int`,
        answered90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since90}::timestamptz AND ${review.ownerAnswer} IS NOT NULL)::int`,
        n180: sql<number>`count(*) FILTER (WHERE ${review.postedAt} > ${since180}::timestamptz)::int`,
        s1: sql<number>`count(*) FILTER (WHERE ${review.rating} = 1)::int`,
        s2: sql<number>`count(*) FILTER (WHERE ${review.rating} = 2)::int`,
        s3: sql<number>`count(*) FILTER (WHERE ${review.rating} = 3)::int`,
        s4: sql<number>`count(*) FILTER (WHERE ${review.rating} = 4)::int`,
        s5: sql<number>`count(*) FILTER (WHERE ${review.rating} = 5)::int`,
      })
      .from(review).where(inArray(review.competitorId, ids)).groupBy(review.competitorId);
    const gbp = await deps.service.selectDistinctOn([observation.competitorId], { competitorId: observation.competitorId, data: observation.data })
      .from(observation).where(and(inArray(observation.competitorId, ids), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
      .orderBy(observation.competitorId, desc(observation.observedAt));

    return {
      months,
      selfPending,
      businesses: businesses.map((b) => {
        const s = stats.find((x) => x.competitorId === b.competitorId);
        const n90 = Number(s?.n90 ?? 0);
        return {
          competitorId: b.competitorId!, name: b.name, self: b.self,
          gbpRating: gbpSummary(gbp.find((g) => g.competitorId === b.competitorId)?.data ?? null)?.rating ?? null,
          reviews90d: n90,
          perMonth: r1(Number(s?.n180 ?? 0) / 6),
          replyRate: n90 > 0 ? r2(Number(s!.answered90) / n90) : null,
          mix: [s?.s1, s?.s2, s?.s3, s?.s4, s?.s5].map((v) => Number(v ?? 0)),
          monthly: months.map((m) => {
            const row = monthly.find((x) => x.competitorId === b.competitorId && x.month === m);
            return { reviews: Number(row?.n ?? 0), avgRating: row?.avg === null || row?.avg === undefined ? null : Number(row.avg) };
          }),
        };
      }),
    };
  },
});

export const reputationTools = [getThemeBenchmark, getRatingTrend];
