import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/**
 * Spec D9 / migration 0080: what `cs_web` needs to enqueue and read job status — `version` (start), `queue` (send),
 * `job` (send + status). Queries go through the partitioned parent, so per-queue partitions need no grant. Run after
 * `boss.start()`, because on a fresh database pg-boss creates these tables only then.
 *
 * Explicit tables only, never `ON ALL TABLES IN SCHEMA pgboss`: a dev worker on the owner URL creates owner-owned queue
 * partitions, and `cs_worker` granting on those fails. Harmless when run as the owner (it owns or inherits the tables).
 */
export async function ensureQueueGrants(db: Db): Promise<void> {
  await db.execute(sql`GRANT SELECT ON pgboss.version, pgboss.queue TO cs_web`);
  await db.execute(sql`GRANT SELECT, INSERT ON pgboss.job TO cs_web`);
}
