import { ad, type Db } from '@cs/db';
import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm';

export interface NormalizedAd {
  externalId: string;
  advertiserId: string | null;
  format: string | null;
  title: string | null;
  text: string | null;
  mediaUrls: string[];
  landingUrl: string | null;
  publisherPlatforms: string[];
  startedAt: Date | null;
  endedAt: Date | null;
  isActive: boolean;
}

export async function upsertAds(
  db: Db,
  competitorId: string,
  platform: 'google' | 'meta',
  captureId: string,
  ads: NormalizedAd[],
  opts: { markMissingInactive: boolean; now?: Date; advertiserId?: string },
): Promise<{ upserted: number; deactivated: number }> {
  const now = opts.now ?? new Date();
  // Keyed by externalId (last occurrence wins): a single batch can list the same creative twice,
  // and Postgres rejects an INSERT ... ON CONFLICT DO UPDATE that would affect the same row twice
  // in one statement, which would otherwise fail the whole upsert.
  const byExternalId = new Map<string, NormalizedAd>();
  for (const a of ads) byExternalId.set(a.externalId, a);
  const rows = [...byExternalId.values()];
  let upserted = 0;
  if (rows.length > 0) {
    const written = await db
      .insert(ad)
      .values(rows.map((a) => ({ ...a, competitorId, platform, firstSeenAt: now, lastSeenAt: now, firstCaptureId: captureId, lastCaptureId: captureId })))
      .onConflictDoUpdate({
        target: [ad.platform, ad.externalId],
        // `(platform, external_id)` is globally unique, but a creative id can collide across two
        // competitor rows for the same advertiser (duplicate competitor rows, franchise siblings).
        // Never let that silently rewrite another competitor's ad row: a conflicting row is only
        // actually updated when it already belongs to this competitor; otherwise it's skipped.
        setWhere: sql`${ad.competitorId} = excluded.competitor_id`,
        set: {
          isActive: sql`excluded.is_active`, endedAt: sql`excluded.ended_at`, lastSeenAt: sql`excluded.last_seen_at`, lastCaptureId: sql`excluded.last_capture_id`,
          // A legacy row without an advertiser id is adopted by the page that lists it, so other pages' pulls stop ending it.
          advertiserId: sql`coalesce(${ad.advertiserId}, excluded.advertiser_id)`,
          text: sql`coalesce(excluded.text, ${ad.text})`, mediaUrls: sql`excluded.media_urls`, publisherPlatforms: sql`excluded.publisher_platforms`,
          // Seen active again → no longer ended; seen inactive while it was active → this capture ended it; otherwise unchanged.
          endedCaptureId: sql`CASE WHEN excluded.is_active THEN NULL WHEN ${ad.isActive} THEN excluded.last_capture_id ELSE ${ad.endedCaptureId} END`,
        },
      })
      .returning({ id: ad.id });
    upserted = written.length;
    const skipped = rows.length - upserted;
    if (skipped > 0) {
      console.warn(
        `[ads] competitor ${competitorId} (${platform}): ${skipped} creative(s) already belong to another competitor's ad row; flagging for merge review`,
      );
    }
  }
  let deactivated = 0;
  if (opts.markMissingInactive) {
    const seen = rows.map((a) => a.externalId);
    const conds = [eq(ad.competitorId, competitorId), eq(ad.platform, platform), eq(ad.isActive, true)];
    if (seen.length > 0) conds.push(notInArray(ad.externalId, seen));
    // One Meta page's pull only speaks for that page's ads (legacy rows without an advertiser id count as its own).
    if (opts.advertiserId) conds.push(or(eq(ad.advertiserId, opts.advertiserId), isNull(ad.advertiserId))!);
    const result = await db
      .update(ad)
      .set({ isActive: false, endedAt: now, endedCaptureId: captureId })
      .where(and(...conds))
      .returning({ id: ad.id });
    deactivated = result.length;
  }
  return { upserted, deactivated };
}
