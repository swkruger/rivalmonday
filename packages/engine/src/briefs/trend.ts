import { changeEvent, type Db, eventScore, type TrendSnapshot } from '@cs/db';
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { adActivity } from '../moves/moves-stage';
import { reviewBenchmark } from '../reviews/benchmark';
import type { PackLoader } from '../tag/tag-stage';

export const TREND_WINDOW_DAYS = 30;

/** Spec §9.1.5 trend snapshot: deterministic numbers from stored data (rendered by Phase 4b), never model-written. */
export async function trendSnapshot(deps: { db: Db; packs: PackLoader }, clientId: string, period: { start: Date; end: Date }, windowDays = TREND_WINDOW_DAYS): Promise<TrendSnapshot> {
  const bench = await reviewBenchmark(deps, clientId, { now: period.end, windowDays });
  const businesses = [];
  for (const b of bench.businesses) {
    businesses.push({
      competitorId: b.competitorId, name: b.name, self: b.self, reviews: b.reviews, avgRating: b.avgRating, prevAvgRating: b.prevAvgRating,
      activeAds: b.self ? null : (await adActivity(deps.db, b.competitorId, period.end)).activeNow,
    });
  }
  const [n] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventScore)
    .innerJoin(changeEvent, eq(changeEvent.id, eventScore.eventId))
    .where(and(eq(eventScore.clientId, clientId), isNull(changeEvent.retractedAt), gt(changeEvent.createdAt, period.start), lte(changeEvent.createdAt, period.end)));
  return { windowDays, events: n?.n ?? 0, businesses };
}
