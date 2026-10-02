import { client, clientCompetitor, competitor, type Db } from '@cs/db';
import { asc, eq, sql } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { type Theme, themesForVertical } from './themes';

export const BENCHMARK_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length > 0 ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : r2(a - b));

export interface AnalysedReview {
  competitorId: string;
  postedAt: Date;
  rating: number | null;
  asked: string[];
  themes: string[];
  sentiment: number | null;
}

export interface ThemeStats {
  themeId: string;
  name: string;
  mentions: number;
  asked: number;
  share: number | null;
  sentiment: number | null;
}

export interface WindowStats {
  reviews: number;
  avgRating: number | null;
  themes: ThemeStats[];
}

export interface BenchmarkTheme extends ThemeStats {
  prevShare: number | null;
  prevSentiment: number | null;
  shareDelta: number | null;
  sentimentDelta: number | null;
}

export interface BenchmarkBusiness {
  competitorId: string;
  name: string;
  self: boolean;
  reviews: number;
  avgRating: number | null;
  prevReviews: number;
  prevAvgRating: number | null;
  themes: BenchmarkTheme[];
}

export interface ReviewBenchmark {
  clientId: string;
  verticalId: string;
  windowDays: number;
  from: Date;
  to: Date;
  businesses: BenchmarkBusiness[];
}

/** Sentiment level 0 (very negative) … 4 (very positive) → −1 … +1. */
export const sentimentScore = (level: number) => (level - 2) / 2;

/**
 * Spec §6.5 benchmark for one business and one window. Review count and average rating include rating-only
 * reviews; a theme's share is mentions / reviews where the theme was asked (decision 5), its sentiment the mean
 * sentiment of the reviews mentioning it.
 */
export function summarizeWindow(reviews: AnalysedReview[], themes: Theme[]): WindowStats {
  return {
    reviews: reviews.length,
    avgRating: mean(reviews.flatMap((r) => (r.rating === null ? [] : [r.rating]))),
    themes: themes.map((t) => {
      const asked = reviews.filter((r) => r.asked.includes(t.id));
      const mentioning = asked.filter((r) => r.themes.includes(t.id));
      return {
        themeId: t.id, name: t.name, mentions: mentioning.length, asked: asked.length,
        share: asked.length > 0 ? r2(mentioning.length / asked.length) : null,
        sentiment: mean(mentioning.flatMap((r) => (r.sentiment === null ? [] : [sentimentScore(r.sentiment)]))),
      };
    }),
  };
}

/** Client (its self business first, when linked) vs each tracked competitor, current vs previous window. Computed on read. */
export async function reviewBenchmark(deps: { db: Db; packs: PackLoader }, clientId: string, opts: { now?: Date; windowDays?: number } = {}): Promise<ReviewBenchmark> {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? BENCHMARK_WINDOW_DAYS;
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const themes = await themesForVertical(deps.db, await deps.packs(c.verticalId));
  const from = new Date(now.getTime() - windowDays * DAY_MS);
  const prevFrom = new Date(now.getTime() - 2 * windowDays * DAY_MS);

  const tracked = await deps.db
    .select({ id: competitor.id, name: competitor.name })
    .from(clientCompetitor)
    .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(eq(clientCompetitor.clientId, clientId))
    .orderBy(asc(competitor.name));
  const businesses = [
    ...(c.selfCompetitorId ? [{ id: c.selfCompetitorId, name: c.name, self: true }] : []),
    ...tracked.filter((t) => t.id !== c.selfCompetitorId).map((t) => ({ ...t, self: false })),
  ];
  const result: ReviewBenchmark = { clientId, verticalId: c.verticalId, windowDays, from, to: now, businesses: [] };
  if (businesses.length === 0) return result;

  const rows = (await deps.db.execute(sql`
    SELECT r.competitor_id, r.posted_at, r.rating, coalesce(a.asked, '[]'::jsonb) AS asked, coalesce(a.themes, '[]'::jsonb) AS themes, a.sentiment
    FROM review r
    LEFT JOIN review_analysis a ON a.review_id = r.id AND a.vertical_id = ${c.verticalId}
    WHERE r.competitor_id = ANY(ARRAY[${sql.join(businesses.map((b) => sql`${b.id}`), sql`, `)}]::uuid[])
      AND r.posted_at > ${prevFrom.toISOString()}::timestamptz AND r.posted_at <= ${now.toISOString()}::timestamptz`)) as unknown as {
    competitor_id: string; posted_at: string | Date; rating: number | null; asked: string[]; themes: string[]; sentiment: number | null;
  }[];
  const reviews: AnalysedReview[] = rows.map((r) => ({
    competitorId: r.competitor_id, postedAt: new Date(r.posted_at), rating: r.rating === null ? null : Number(r.rating), asked: r.asked, themes: r.themes,
    sentiment: r.sentiment === null ? null : Number(r.sentiment),
  }));

  result.businesses = businesses.map((b) => {
    const mine = reviews.filter((r) => r.competitorId === b.id);
    const cur = summarizeWindow(mine.filter((r) => r.postedAt > from), themes);
    const prev = summarizeWindow(mine.filter((r) => r.postedAt <= from), themes);
    return {
      competitorId: b.id, name: b.name, self: b.self, reviews: cur.reviews, avgRating: cur.avgRating, prevReviews: prev.reviews, prevAvgRating: prev.avgRating,
      themes: cur.themes.map((t, i) => {
        const p = prev.themes[i]!;
        return { ...t, prevShare: p.share, prevSentiment: p.sentiment, shareDelta: delta(t.share, p.share), sentimentDelta: delta(t.sentiment, p.sentiment) };
      }),
    };
  });
  return result;
}
