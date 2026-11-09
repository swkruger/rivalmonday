import { agencyServiceable, clientWorkAllowed, type Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

/** P13: only Google ads first seen from this date get their image triaged (no backfill). */
export const AD_IMAGE_SINCE = new Date('2026-11-16T00:00:00Z');
export const AD_IMAGE_TRIAGE_STAGE = 'ad_image_triage';
export const AD_IMAGE_TRIAGE_VERSION = 1;
/** At most this many candidate ads per sweep (R2). */
export const AD_IMAGE_SWEEP_MAX = 200;
/**
 * Task 0: video is the only stored non-image format. Google text ads that also carry an image URL stay candidates:
 * magic-byte sniffing (R6) rejects non-images and Jev triage decides the rest.
 */
export const AD_IMAGE_SKIP_FORMATS: readonly string[] = ['video'];

/** Stage subject of an ad image (R4): `md5(id || '|' || source_url_sha)` as a uuid; SQL twin `md5(ai.id::text || '|' || ai.source_url_sha)::uuid`. */
export function adImageSubjectId(id: string, sourceUrlSha: string): string {
  const h = createHash('md5').update(`${id}|${sourceUrlSha}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** True when some client tracking the competitor may get recurring paid work (`clientWorkAllowed`) under a serviceable agency. */
export async function anyWorkableTracker(db: Db, competitorId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT 1 FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
    WHERE cc.competitor_id = ${competitorId}::uuid AND ${clientWorkAllowed('cl')} AND ${agencyServiceable(sql.raw('cl.agency_id'))}
    LIMIT 1`)) as unknown as unknown[];
  return rows.length > 0;
}
