import { agencyServiceable, type Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import { pilotMode, SAMPLE_AGENCY_KEY } from './settings';

/** Phase 17a: public pilot flag and honest counters for the marketing site. Aggregates only, never ids or names. */
export const COUNTER_FLOOR = 10;

export interface SiteStatus {
  pilotMode: boolean;
  counters: { rivalSitesWatched: number | null; snapshotsThisWeek: number | null; claimsChecked: number | null; claimsDropped: number | null } | null;
}

/** Null below the floor; otherwise rounded down to 2 significant digits (so the site never overstates). */
export function publicCount(n: number): number | null {
  if (!Number.isFinite(n) || n < COUNTER_FLOOR) return null;
  const whole = Math.floor(n);
  if (whole < 100) return Math.floor(whole / 10) * 10;
  const step = 10 ** (String(whole).length - 2); // 2 significant digits, rounded down
  return Math.floor(whole / step) * step;
}

export async function siteStatus(service: Db, now: Date): Promise<SiteStatus> {
  let pilot = false;
  try {
    pilot = await pilotMode(service);
  } catch (e) {
    console.error('[site-status] pilot flag failed', e instanceof Error ? e.name : typeof e);
  }
  try {
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const res = await service.execute(sql`
      WITH sample AS (SELECT (value->>'agencyId')::uuid AS id FROM platform_setting WHERE key = ${SAMPLE_AGENCY_KEY}),
      live AS (SELECT c.id FROM client c WHERE c.status = 'active' AND c.paused_at IS NULL AND c.archived_at IS NULL
                 AND ${agencyServiceable(sql.raw('c.agency_id'))} AND c.agency_id IS DISTINCT FROM (SELECT id FROM sample)),
      recent AS (SELECT b.claims_checked, (b.dropped->>'sentences')::int AS dropped FROM brief b
                 JOIN client c ON c.id = b.client_id AND c.archived_at IS NULL
                 JOIN agency a ON a.id = b.agency_id AND a.archived_at IS NULL
                 WHERE b.generated_at > ${since}::timestamptz AND b.claims_checked IS NOT NULL AND b.agency_id IS DISTINCT FROM (SELECT id FROM sample))
      SELECT
        (SELECT count(DISTINCT cc.competitor_id) FROM client_competitor cc JOIN live l ON l.id = cc.client_id)::int AS rivals,
        (SELECT count(*) FROM capture cp WHERE cp.status IN ('ok','unchanged') AND cp.captured_at > ${since}::timestamptz
           AND EXISTS (SELECT 1 FROM client_competitor cc JOIN live l ON l.id = cc.client_id WHERE cc.competitor_id = cp.competitor_id))::int AS snapshots,
        (SELECT coalesce(sum(claims_checked), 0) FROM recent)::int AS checked,
        (SELECT coalesce(sum(dropped), 0) FROM recent)::int AS dropped`);
    const row = (res as unknown as { rows?: Record<string, number>[] }).rows?.[0] ?? (res as unknown as Record<string, number>[])[0];
    if (!row) throw new Error('no_row');
    return {
      pilotMode: pilot,
      counters: {
        rivalSitesWatched: publicCount(Number(row.rivals)),
        snapshotsThisWeek: publicCount(Number(row.snapshots)),
        claimsChecked: publicCount(Number(row.checked)),
        claimsDropped: publicCount(Number(row.dropped)),
      },
    };
  } catch (e) {
    console.error('[site-status] counters failed', e instanceof Error ? e.name : typeof e);
    return { pilotMode: pilot, counters: null };
  }
}
