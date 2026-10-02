import { review } from '@cs/db';
import { and, avg, count, eq, gt, lte, sql } from 'drizzle-orm';
import type { SourceDiffer } from './vendor-diff';

/** Spike: the window's weekly review rate is this many deviations above the competitor's own baseline … */
export const REVIEW_SPIKE_Z = 2;
/** … and at least this many reviews arrived (3 reviews against a quiet baseline are not news). */
export const REVIEW_SPIKE_MIN = 4;
export const REVIEW_BASELINE_WEEKS = 12;
const DAY_MS = 86_400_000;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Weekly rate of the window vs the weekly baseline; the deviation is floored at 1 so a quiet competitor's baseline of zeros doesn't explode. */
export function reviewVelocity(windowCount: number, windowDays: number, weekly: number[]): { perWeek: number; mean: number; sd: number; z: number } {
  const perWeek = (windowCount * 7) / windowDays;
  const mean = weekly.length > 0 ? weekly.reduce((a, b) => a + b, 0) / weekly.length : 0;
  const sd = weekly.length > 0 ? Math.sqrt(weekly.reduce((a, b) => a + (b - mean) ** 2, 0) / weekly.length) : 0;
  return { perWeek: round(perWeek), mean: round(mean), sd: round(sd), z: round((perWeek - mean) / Math.max(sd, 1)) };
}

/**
 * Spec §6.1/§6.3 review spike: reviews posted since the previous pull, against the 12 weeks before it.
 * Rating and velocity only — review text never enters a change (spec §4.5).
 */
export const diffReviews: SourceDiffer = async (db, cap, prev) => {
  const start = prev.capturedAt;
  const end = cap.capturedAt;
  const windowDays = Math.max(1, (end.getTime() - start.getTime()) / DAY_MS);
  const [w] = await db
    .select({ n: count(), avgRating: avg(review.rating) })
    .from(review)
    .where(and(eq(review.competitorId, cap.competitorId), gt(review.postedAt, start), lte(review.postedAt, end)));
  const windowCount = Number(w?.n ?? 0);
  if (windowCount < REVIEW_SPIKE_MIN) return [];
  const weeks = (await db.execute(sql`
    SELECT w.i, count(r.id)::int AS n
    FROM generate_series(1, ${REVIEW_BASELINE_WEEKS}::int) AS w(i)
    LEFT JOIN review r ON r.competitor_id = ${cap.competitorId}::uuid
      AND r.posted_at >  ${start.toISOString()}::timestamptz - make_interval(days => 7 * w.i)
      AND r.posted_at <= ${start.toISOString()}::timestamptz - make_interval(days => 7 * (w.i - 1))
    GROUP BY w.i ORDER BY w.i`)) as unknown as { n: number }[];
  const v = reviewVelocity(windowCount, windowDays, weeks.map((r) => Number(r.n)));
  if (v.z < REVIEW_SPIKE_Z) return [];
  const avgRating = w?.avgRating === null || w?.avgRating === undefined ? null : round(Number(w.avgRating), 1);
  const days = round(windowDays, 1);
  return [
    {
      kind: 'modified', blockKey: 'reviews:velocity',
      beforeText: `${v.mean} reviews/week over the previous ${REVIEW_BASELINE_WEEKS} weeks`,
      afterText: `${windowCount} reviews in ${days} days (${v.perWeek}/week)${avgRating !== null ? `, average rating ${avgRating}` : ''}`,
      details: { changeType: 'review_spike', count: windowCount, windowDays: days, baselineMean: v.mean, z: v.z, avgRating },
    },
  ];
};
