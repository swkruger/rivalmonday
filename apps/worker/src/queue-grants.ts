import { createDb, type Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/**
 * Spec D9 / migration 0081: what `cs_web` needs to enqueue and read job status — `version` (start), `queue` (send),
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

/** `ensureQueueGrants` on a short-lived connection to the worker's queue database (start-up and every heartbeat). */
export async function ensureQueueGrantsAt(url: string): Promise<void> {
  const grants = createDb(url);
  try {
    await ensureQueueGrants(grants.db);
  } finally {
    await grants.close();
  }
}

/** 7c2 heartbeat sample: connections open on this database server vs `max_connections`. */
export async function sampleConnections(db: Db): Promise<{ dbConnections: number; dbMaxConnections: number }> {
  const [row] = (await db.execute(sql`
    SELECT (SELECT count(*) FROM pg_stat_activity)::int AS connections, current_setting('max_connections')::int AS max_connections`)) as unknown as { connections: number; max_connections: number }[];
  return { dbConnections: Number(row?.connections ?? 0), dbMaxConnections: Number(row?.max_connections ?? 0) };
}
