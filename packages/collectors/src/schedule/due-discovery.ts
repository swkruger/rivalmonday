import { agencyServiceable, clientWorkAllowed, type Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import { REDISCOVERY_DAYS } from '../discovery/discover';

/** Owner cap (18a-2 D6): competitors re-discovered per daily run. */
export const DISCOVERY_SCHEDULE_BATCH = 25;

/**
 * Claims competitors whose site discovery is due, exactly once across concurrent schedulers (18a-2 D6).
 * Eligible = has a website and at least one active, serviceable, not spend-paused client tracks it (prospects, paused
 * and untracked competitors wait; self competitors have no client_competitor row and are never crawled, §6.5).
 * One transaction: seed missing `site_discovery` rows (due now), then push `next_due_at` out REDISCOVERY_DAYS for up to
 * `limit` due rows (SKIP LOCKED). A discovery run itself also pushes the date out, so a failed run retries in 28 days.
 */
export async function claimDueDiscoveries(db: Db, limit: number): Promise<string[]> {
  return db.transaction(async (tx) => {
    const eligible = sql`c.domain IS NOT NULL AND EXISTS (
      SELECT 1 FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
       WHERE cc.competitor_id = c.id AND ${clientWorkAllowed('cl')} AND ${agencyServiceable(sql.raw('cl.agency_id'))})`;
    await tx.execute(sql`
      INSERT INTO site_discovery (competitor_id)
      SELECT c.id FROM competitor c WHERE ${eligible}
      ON CONFLICT DO NOTHING`);
    const rows = (await tx.execute(sql`
      UPDATE site_discovery
         SET next_due_at = now() + ${sql.raw(`interval '${REDISCOVERY_DAYS} days'`)}
       WHERE competitor_id IN (
         SELECT sd.competitor_id FROM site_discovery sd JOIN competitor c ON c.id = sd.competitor_id
          WHERE sd.next_due_at <= now() AND ${eligible}
          ORDER BY sd.next_due_at
          LIMIT ${limit}
          FOR UPDATE OF sd SKIP LOCKED)
      RETURNING competitor_id`)) as unknown as { competitor_id: string }[];
    return rows.map((r) => r.competitor_id);
  });
}
