import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import type { SourceKind } from './kinds';

/**
 * Claims due vendor sources exactly once across concurrent schedulers by advancing next_due_at in one statement.
 * Untracked competitors are skipped (5b-1 decision 8): their rows stay due and resume when a client tracks
 * them again. A client's own business (never in client_competitor) keeps collecting gbp/reviews only — the
 * ('gbp', 'reviews') literal below must stay in sync with `SELF_SOURCES` in `local/self.ts`.
 */
export async function claimDueSources(db: Db, limit: number): Promise<{ competitorId: string; source: SourceKind }[]> {
  const rows = (await db.execute(sql`
    UPDATE competitor_source SET next_due_at = now() + interval '7 days'
     WHERE (competitor_id, source) IN (
       SELECT competitor_id, source FROM competitor_source cs
        WHERE active AND next_due_at <= now()
          AND (EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = cs.competitor_id)
               OR (cs.source IN ('gbp', 'reviews') AND EXISTS (SELECT 1 FROM client c WHERE c.self_competitor_id = cs.competitor_id)))
        ORDER BY next_due_at LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING competitor_id, source`)) as unknown as { competitor_id: string; source: SourceKind }[];
  return rows.map((r) => ({ competitorId: r.competitor_id, source: r.source }));
}

export async function markSourceResult(db: Db, competitorId: string, source: SourceKind, status: string): Promise<void> {
  await db.execute(sql`UPDATE competitor_source SET last_status = ${status}, last_run_at = now() WHERE competitor_id = ${competitorId} AND source = ${source}`);
}

/**
 * Releases previously-claimed sources back to due-now (undoing claimDueSources's 7-day advance)
 * and records `status`. Used when something claimed this tick fails before it could really run
 * (e.g. a batch task_post throws) — the alternative, leaving next_due_at 7 days out, would
 * silently lose a week of collection for every source caught in that failure.
 */
export async function releaseSources(db: Db, items: { competitorId: string; source: SourceKind }[], status: string): Promise<void> {
  if (items.length === 0) return;
  await db.execute(sql`
    UPDATE competitor_source SET next_due_at = now(), last_status = ${status}, last_run_at = now()
     WHERE (competitor_id, source) IN (${sql.join(items.map((i) => sql`(${i.competitorId}::uuid, ${i.source})`), sql`, `)})`);
}
