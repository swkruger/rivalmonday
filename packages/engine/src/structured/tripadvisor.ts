import { observation } from '@cs/db';
import { and, eq } from 'drizzle-orm';
import { implausibleVotesDrop, RATING_CHANGE_MIN } from './gbp';
import type { CaptureRow, DifferResult, SourceDiffer } from './vendor-diff';

/** The `tripadvisor` observation stored by a matched pull (18d-10b; an unmatched pull stores none). */
interface TripadvisorData { id?: string | number | null; rating?: number | null; reviews?: number | null }

async function readObservation(db: Parameters<SourceDiffer>[0], cap: CaptureRow): Promise<TripadvisorData | null> {
  const [row] = await db
    .select({ data: observation.data })
    .from(observation)
    .where(and(eq(observation.captureId, cap.id), eq(observation.kind, 'tripadvisor')))
    .limit(1);
  return (row?.data as TripadvisorData | undefined) ?? null;
}

/**
 * Tripadvisor rating moves (18d D13): the same rule as the Google rating differ (>= RATING_CHANGE_MIN, no implausible
 * review-count drop), compared only while both pulls matched the same listing id. A re-match is not a rating move.
 */
export const diffTripadvisor: SourceDiffer = async (db, cap, prev): Promise<DifferResult> => {
  const none: DifferResult = { changes: [], implausible: 0, held: 0 };
  const [after, before] = [await readObservation(db, cap), await readObservation(db, prev)];
  if (!after || !before || String(after.id ?? '') !== String(before.id ?? '')) return none;
  const r0 = before.rating;
  const r1 = after.rating;
  if (typeof r0 !== 'number' || typeof r1 !== 'number' || Math.abs(r1 - r0) < RATING_CHANGE_MIN - 1e-9) return none;
  if (implausibleVotesDrop({ votes: before.reviews }, { votes: after.reviews })) return { ...none, implausible: 1 };
  return {
    changes: [{
      kind: 'modified', blockKey: 'tripadvisor:rating',
      beforeText: `rating ${r0} (${before.reviews ?? '?'} reviews)`, afterText: `rating ${r1} (${after.reviews ?? '?'} reviews)`,
      details: { changeType: 'rating_change', platform: 'tripadvisor', field: 'rating', ratingBefore: r0, ratingAfter: r1, votesBefore: before.reviews ?? null, votesAfter: after.reviews ?? null },
    }],
    implausible: 0, held: 0,
  };
};
