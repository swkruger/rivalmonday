import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/**
 * Claims due pages exactly once across concurrent schedulers by advancing next_due_at in one statement.
 * Untracked competitors are skipped (5b-1 decision 8): their pages stay due and resume when a client
 * tracks the competitor again.
 */
export async function claimDuePages(db: Db, limit: number): Promise<string[]> {
  const rows = (await db.execute(sql`
    UPDATE tracked_page
       SET next_due_at = now() + CASE cadence WHEN 'daily' THEN interval '1 day' ELSE interval '7 days' END
     WHERE id IN (
       SELECT id FROM tracked_page tp
        WHERE active AND next_due_at <= now()
          AND EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = tp.competitor_id)
        ORDER BY next_due_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING id`)) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
