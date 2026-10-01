import { type Db, review } from '@cs/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { pseudonymizeReviewer, redactContactInfo, redactReviewerName } from '../evidence/privacy';
import { sha256Hex } from '../evidence/recorder';
import { parseDfsTimestamp } from '../vendors/dfs-time';

const reviewSchema = z.looseObject({
  review_id: z.string().nullish(),
  rating: z.looseObject({ value: z.number().nullish() }).nullish(),
  review_text: z.string().nullish(),
  timestamp: z.union([z.string(), z.number()]).nullish(),
  profile_name: z.string().nullish(),
  owner_answer: z.string().nullish(),
  owner_timestamp: z.union([z.string(), z.number()]).nullish(),
});

export interface ParsedReview {
  dedupeKey: string;
  externalId: string | null;
  rating: number | null;
  text: string | null;
  reviewerHash: string | null;
  postedAt: Date | null;
  ownerAnswer: string | null;
  ownerAnsweredAt: Date | null;
}

/**
 * Pure parsing step of upsertReviews: pseudonymises the reviewer, redacts contact info and the
 * reviewer's own name from review and owner-reply text, and builds the
 * dedupe key. Returns null for an item that is unparseable or carries no review content. Nothing
 * else from the vendor item (profile URLs, photos, review_url, …) is ever carried over.
 */
export function parseReviewItem(raw: unknown, salt: string, businessNames: readonly (string | null | undefined)[] = []): ParsedReview | null {
  const p = reviewSchema.safeParse(raw);
  if (!p.success || (!p.data.review_id && !p.data.review_text && !p.data.timestamp)) return null;
  const i = p.data;
  const reviewerHash = pseudonymizeReviewer(i.profile_name, salt);
  const clean = (t: string) => redactReviewerName(redactContactInfo(t), i.profile_name, businessNames);
  const text = i.review_text ? clean(i.review_text) : null;
  const postedAt = parseDfsTimestamp(i.timestamp);
  const rating = i.rating?.value != null ? Math.round(i.rating.value) : null;
  const dedupeKey = i.review_id ? `id:${i.review_id}` : `h:${sha256Hex(`${reviewerHash ?? ''}|${postedAt?.toISOString() ?? ''}|${rating ?? ''}|${text ?? ''}`)}`;
  return {
    dedupeKey, externalId: i.review_id ?? null, rating, text, reviewerHash, postedAt,
    ownerAnswer: i.owner_answer ? clean(i.owner_answer) : null, ownerAnsweredAt: parseDfsTimestamp(i.owner_timestamp),
  };
}

/**
 * `businessNames` (the reviewed business's title / competitor name) keeps business-name words from
 * being redacted as reviewer names. Dedupe falls back to a hash of the redacted text when a review has
 * no review_id, so those keys depend on the redaction rules (see redactReviewerName).
 */
export async function upsertReviews(
  db: Db, competitorId: string, captureId: string, items: unknown[], salt: string, now = new Date(), businessNames: readonly (string | null | undefined)[] = [],
): Promise<{ upserted: number; skipped: number }> {
  // Keyed by dedupeKey (last occurrence wins): a single batch can contain the same review twice
  // (e.g. overlapping pages), and Postgres rejects an INSERT ... ON CONFLICT DO UPDATE that would
  // affect the same row twice in one statement, which would otherwise fail the whole task.
  const rowsByKey = new Map<string, typeof review.$inferInsert>();
  let skipped = 0;
  for (const raw of items) {
    const parsed = parseReviewItem(raw, salt, businessNames);
    if (!parsed) {
      skipped++;
      continue;
    }
    if (rowsByKey.has(parsed.dedupeKey)) skipped++;
    rowsByKey.set(parsed.dedupeKey, { competitorId, source: 'google', ...parsed, firstCaptureId: captureId, firstSeenAt: now, lastSeenAt: now });
  }
  const rows = [...rowsByKey.values()];
  if (rows.length > 0) {
    await db.insert(review).values(rows).onConflictDoUpdate({
      target: [review.competitorId, review.source, review.dedupeKey],
      set: {
        lastSeenAt: sql`excluded.last_seen_at`,
        ownerAnswer: sql`coalesce(excluded.owner_answer, ${review.ownerAnswer})`,
        ownerAnsweredAt: sql`coalesce(excluded.owner_answered_at, ${review.ownerAnsweredAt})`,
      },
    });
  }
  return { upserted: rows.length, skipped };
}
