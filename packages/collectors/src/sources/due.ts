import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import type { SourceKind } from './kinds';

/** Claims due vendor sources exactly once across concurrent schedulers by advancing next_due_at in one statement. */
export async function claimDueSources(db: Db, limit: number): Promise<{ competitorId: string; source: SourceKind }[]> {
  const rows = (await db.execute(sql`
    UPDATE competitor_source SET next_due_at = now() + interval '7 days'
     WHERE (competitor_id, source) IN (
       SELECT competitor_id, source FROM competitor_source
        WHERE active AND next_due_at <= now()
        ORDER BY next_due_at LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING competitor_id, source`)) as unknown as { competitor_id: string; source: SourceKind }[];
  return rows.map((r) => ({ competitorId: r.competitor_id, source: r.source }));
}

export async function markSourceResult(db: Db, competitorId: string, source: SourceKind, status: string): Promise<void> {
  await db.execute(sql`UPDATE competitor_source SET last_status = ${status}, last_run_at = now() WHERE competitor_id = ${competitorId} AND source = ${source}`);
}
