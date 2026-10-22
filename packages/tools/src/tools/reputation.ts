import { appLinkFor, ToolError, toolkit } from '@cs/core';
import { review, reviewAnalysis } from '@cs/db';
import { monthKeys, ratingStats, reviewBenchmark, sentimentScore, topicsForVertical } from '@cs/engine';
import { and, desc, eq, gte, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { detailOf, pageOf, pageResult } from '../paging';
import { pickBusiness, workspaceBusinesses } from '../workspace/business';
import { forChannel } from '../workspace/model-text';
import { escapeLike, workspaceClient } from '../workspace/scope';
import { BusinessKey, pageFields, RatingTrendView, ReviewPage, ThemeBenchmarkView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

// 15b-3b: delete — the engine speaks "topic"; the MCP/web contract keeps `themes`/`themeId` until the 15b-3b rename.
export function toLegacyThemeFields(b: Awaited<ReturnType<typeof reviewBenchmark>>['businesses'][number]) {
  return b.topics.map((t) => ({ themeId: t.topicId, mentions: t.mentions, asked: t.asked, share: t.share, sentiment: t.sentiment, shareDelta: t.shareDelta, sentimentDelta: t.sentimentDelta }));
}

export const getThemeBenchmark = defineTool({
  name: 'get_theme_benchmark',
  access: 'read',
  description: 'Review themes, your business vs each tracked competitor: how often each theme comes up and how positively, last 90 days vs the 90 before.',
  input: z.object({ clientId: uuid }),
  output: ThemeBenchmarkView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, { clientId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const packs = packsOf(deps);
    // reviewBenchmark/topicsForVertical read client_competitor, review, review_analysis and topic_proposal with the service
    // Db — the client was proved through RLS above, and they only reach its tracked competitors and its self business.
    const b = await reviewBenchmark({ db: deps.service, packs }, c.id);
    const topics = await topicsForVertical(deps.service, await packs(c.verticalId));
    return {
      windowDays: b.windowDays, from: b.from.toISOString(), to: b.to.toISOString(),
      themes: topics.map((t) => ({ id: t.id, name: t.name })),
      businesses: b.businesses.map((x) => ({
        competitorId: x.competitorId, name: x.name, self: x.self, reviews: x.reviews, avgRating: x.avgRating, prevReviews: x.prevReviews, prevAvgRating: x.prevAvgRating,
        themes: toLegacyThemeFields(x),
      })),
    };
  },
});

export { monthKeys };

export const getRatingTrend = defineTool({
  name: 'get_rating_trend',
  access: 'read',
  description: 'Per business: Google rating, reviews in 90 days, reviews per month, reply rate, star mix and monthly average stars.',
  input: z.object({ clientId: uuid, months: z.union([z.literal(6), z.literal(12)]).default(12) }),
  output: RatingTrendView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const businesses = (await workspaceBusinesses(deps, ctx, c)).filter((b) => b.competitorId !== null);
    const selfPending = c.placeId !== null && c.selfCompetitorId === null;
    const now = new Date();
    const months = monthKeys(now, input.months);
    if (businesses.length === 0) return { months, selfPending, businesses: [] };
    const stats = await ratingStats(deps.service, businesses.map((b) => b.competitorId!), now, months);
    return {
      months,
      selfPending,
      businesses: businesses.map((b) => {
        const s = stats.get(b.competitorId!)!;
        return { competitorId: b.competitorId!, name: b.name, self: b.self, gbpRating: s.gbpRating, reviews90d: s.reviews90d, perMonth: s.perMonth, replyRate: s.replyRate, mix: s.mix, monthly: s.monthly };
      }),
    };
  },
});

export const searchReviews = defineTool({
  name: 'search_reviews',
  access: 'read',
  description: 'Search Google reviews of your business and tracked competitors by business, theme, stars or text. Reviewer identities are never returned.',
  input: z.object({
    clientId: uuid,
    business: BusinessKey.optional(),
    themeId: z.string().regex(/^[a-z0-9_]{1,64}$/).optional(),
    stars: z.number().int().min(1).max(5).optional(),
    text: z.string().trim().min(1).max(100).optional(),
    days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
    offset: z.number().int().min(0).max(5000).default(0),
    limit: z.number().int().min(1).max(50).optional(),
    ...pageFields,
  }),
  output: ReviewPage,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps, meta) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const paged = pageOf(input, meta, 20);
    const limit = paged.limit;
    const offset = input.cursor ? paged.offset : input.offset;
    // A self business known only by place id has no review rows, so it is not searchable (pickBusiness -> not_found).
    const all = (await workspaceBusinesses(deps, ctx, c)).filter((b) => b.competitorId !== null);
    const scope = input.business ? [pickBusiness(all, input.business)] : all;
    const topics = await topicsForVertical(deps.service, await packsOf(deps)(c.verticalId));
    const topicId = input.themeId; // 15b-3b: delete — input stays `themeId` until the rename
    if (topicId && !topics.some((t) => t.id === topicId)) throw new ToolError('invalid_input', 'Unknown theme');
    if (scope.length === 0) return { items: [], hasMore: false };
    const byId = new Map(scope.map((b) => [b.competitorId!, b]));
    const topicName = new Map(topics.map((t) => [t.id, t.name]));
    const conds: SQL[] = [inArray(review.competitorId, [...byId.keys()]), gte(review.postedAt, new Date(Date.now() - input.days * DAY))];
    if (input.stars) conds.push(eq(review.rating, input.stars));
    if (input.text) conds.push(ilike(review.text, `%${escapeLike(input.text)}%`));
    if (topicId) conds.push(sql`${reviewAnalysis.topics} @> ${JSON.stringify([topicId])}::jsonb`);
    // Global review rows - visibility proved by workspaceBusinesses (RLS). reviewer_hash is never selected (spec 4.5).
    const rows = await deps.service
      .select({ id: review.id, competitorId: review.competitorId, rating: review.rating, text: review.text, postedAt: review.postedAt, ownerAnswer: review.ownerAnswer, topics: reviewAnalysis.topics, sentiment: reviewAnalysis.sentiment })
      .from(review)
      .leftJoin(reviewAnalysis, and(eq(reviewAnalysis.reviewId, review.id), eq(reviewAnalysis.verticalId, c.verticalId)))
      .where(and(...conds))
      .orderBy(sql`${review.postedAt} DESC NULLS LAST`, desc(review.id))
      .offset(offset).limit(limit + 1);
    const page = pageResult(rows, limit, offset);
    if (detailOf(input, meta) === 'summary') {
      return {
        items: page.rows.map((r) => {
          const b = byId.get(r.competitorId)!;
          return {
            id: r.id, title: `${b.name} review${r.rating ? `, ${r.rating}\u2605` : ''}`, date: r.postedAt ? r.postedAt.toISOString() : null, evidenceIds: [],
            url: appLinkFor(deps.appUrl, { t: 'review', clientId: c.id, id: r.id }),
          };
        }),
        hasMore: page.hasMore, nextCursor: page.nextCursor,
      };
    }
    return {
      items: page.rows.map((r) => {
        const b = byId.get(r.competitorId)!;
        return {
          reviewId: r.id, competitorId: r.competitorId, name: b.name, self: b.self, rating: r.rating, text: forChannel(meta, r.text, [b.name]), postedAt: r.postedAt ? r.postedAt.toISOString() : null,
          themes: (r.topics ?? []).map((id) => ({ id, name: topicName.get(id) ?? id })),
          // Same -1..+1 scale as get_theme_benchmark (engine sentimentScore), not the raw 0-4 level.
          sentiment: r.sentiment == null ? null : sentimentScore(r.sentiment), ownerAnswer: forChannel(meta, r.ownerAnswer, [b.name]),
        };
      }),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  },
});

export const reputationTools = [getThemeBenchmark, getRatingTrend, searchReviews];
