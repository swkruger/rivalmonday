import { type Db, review } from '@cs/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { pseudonymizeReviewer, redactContactInfo } from '../evidence/privacy';
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

export async function upsertReviews(db: Db, competitorId: string, captureId: string, items: unknown[], salt: string, now = new Date()): Promise<{ upserted: number; skipped: number }> {
  const rows: (typeof review.$inferInsert)[] = [];
  let skipped = 0;
  for (const raw of items) {
    const p = reviewSchema.safeParse(raw);
    if (!p.success || (!p.data.review_id && !p.data.review_text && !p.data.timestamp)) {
      skipped++;
      continue;
    }
    const i = p.data;
    const reviewerHash = pseudonymizeReviewer(i.profile_name, salt);
    const text = i.review_text ? redactContactInfo(i.review_text) : null;
    const postedAt = parseDfsTimestamp(i.timestamp);
    const dedupeKey = i.review_id ? `id:${i.review_id}` : `h:${sha256Hex(`${reviewerHash ?? ''}|${postedAt?.toISOString() ?? ''}|${text ?? ''}`)}`;
    rows.push({
      competitorId, source: 'google', dedupeKey, externalId: i.review_id ?? null, rating: i.rating?.value != null ? Math.round(i.rating.value) : null,
      text, reviewerHash, postedAt, ownerAnswer: i.owner_answer ? redactContactInfo(i.owner_answer) : null,
      ownerAnsweredAt: parseDfsTimestamp(i.owner_timestamp), firstCaptureId: captureId, firstSeenAt: now, lastSeenAt: now,
    });
  }
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
