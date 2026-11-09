import { agencyServiceable, clientWorkAllowed, type Db } from '@cs/db';
import { type SQL, sql } from 'drizzle-orm';
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

export const AD_IMAGE_READ_STAGE = 'ad_image_read';
export const AD_IMAGE_READ_VERSION = 1;
/** R12: a tracker allows at most this many vision reads (`ad_image.read_at`) in 7 days across its competitors. */
export const AD_IMAGE_READS_PER_WEEK = 20;
/** R11: the vision model returns at most this many price lines, each cut to this many characters. */
export const MAX_PRICE_LINES = 6;
export const MAX_PRICE_LINE_CHARS = 200;

/**
 * R12 as SQL (shared with the sweep): some workable tracker of `competitorId` has fewer than
 * `AD_IMAGE_READS_PER_WEEK` reads in 7 days across all the competitors it tracks. Billed failures count (`read_at` set).
 */
export function readCapOpenSql(competitorId: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM client_competitor rc_cc JOIN client rc_cl ON rc_cl.id = rc_cc.client_id
    WHERE rc_cc.competitor_id = ${competitorId} AND ${clientWorkAllowed('rc_cl')} AND ${agencyServiceable(sql.raw('rc_cl.agency_id'))}
      AND (SELECT count(*) FROM ad_image rc_ai
           WHERE rc_ai.read_at > now() - interval '7 days'
             AND rc_ai.competitor_id IN (SELECT rc_c2.competitor_id FROM client_competitor rc_c2 WHERE rc_c2.client_id = rc_cl.id)) < ${AD_IMAGE_READS_PER_WEEK}::int)`;
}

/** R12: true while some workable tracker of the competitor is under the weekly read cap. */
export async function readCapOpen(db: Db, competitorId: string): Promise<boolean> {
  const rows = (await db.execute(sql`SELECT ${readCapOpenSql(sql`${competitorId}::uuid`)} AS open`)) as unknown as { open: boolean }[];
  return rows[0]?.open === true;
}

/**
 * P7 as SQL (shared with the sweep): the image row aliased `alias` has a same-ad twin with the same original bytes that
 * was already read (any final `read_status`), so its spans exist and it is not read again.
 */
export function readTwinSql(alias: string): SQL {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`readTwinSql: invalid alias ${alias}`);
  return sql.raw(`EXISTS (SELECT 1 FROM ad_image tw WHERE tw.ad_id = ${alias}.ad_id AND tw.source_sha256 = ${alias}.source_sha256 AND tw.id <> ${alias}.id AND tw.read_status IS NOT NULL)`);
}
