import { ad, type Db } from '@cs/db';
import { and, eq, notInArray, sql } from 'drizzle-orm';

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
  opts: { markMissingInactive: boolean; now?: Date },
): Promise<{ upserted: number; deactivated: number }> {
  const now = opts.now ?? new Date();
  // Keyed by externalId (last occurrence wins): a single batch can list the same creative twice,
  // and Postgres rejects an INSERT ... ON CONFLICT DO UPDATE that would affect the same row twice
  // in one statement, which would otherwise fail the whole upsert.
  const byExternalId = new Map<string, NormalizedAd>();
  for (const a of ads) byExternalId.set(a.externalId, a);
  const rows = [...byExternalId.values()];
  if (rows.length > 0) {
    await db
      .insert(ad)
      .values(rows.map((a) => ({ ...a, competitorId, platform, firstSeenAt: now, lastSeenAt: now, firstCaptureId: captureId, lastCaptureId: captureId })))
      .onConflictDoUpdate({
        target: [ad.platform, ad.externalId],
        set: {
          isActive: sql`excluded.is_active`, endedAt: sql`excluded.ended_at`, lastSeenAt: sql`excluded.last_seen_at`, lastCaptureId: sql`excluded.last_capture_id`,
          text: sql`coalesce(excluded.text, ${ad.text})`, mediaUrls: sql`excluded.media_urls`, publisherPlatforms: sql`excluded.publisher_platforms`,
        },
      });
  }
  let deactivated = 0;
  if (opts.markMissingInactive) {
    const seen = rows.map((a) => a.externalId);
    const conds = [eq(ad.competitorId, competitorId), eq(ad.platform, platform), eq(ad.isActive, true)];
    if (seen.length > 0) conds.push(notInArray(ad.externalId, seen));
    const result = await db
      .update(ad)
      .set({ isActive: false, endedAt: now })
      .where(and(...conds))
      .returning({ id: ad.id });
    deactivated = result.length;
  }
  return { upserted: rows.length, deactivated };
}
