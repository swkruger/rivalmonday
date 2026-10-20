import { randomUUID } from 'node:crypto';
import { createDb } from '@cs/db';
import { applySingleMigration, errorText, ownerUrlFor, roleUrl, testUrls } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueStatsOn } from './queue';

/**
 * `queueStatsOn` as production runs it: a scratch database holding only migration 0080, pgboss created by cs_worker,
 * and cs_web with exactly the grants of `ensureQueueGrants` (SELECT on version/queue, SELECT+INSERT on job; nothing on
 * archive). The shared test DB would not catch a missing grant: its pgboss belongs to the superuser.
 */
const name = `cs_qstats_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const admin = createDb(testUrls.owner);
const worker = createDb(roleUrl('cs_worker', name));
const web = createDb(roleUrl('cs_web', name));
let boss: PgBoss;
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function insertJob(queue: string, state: string, o: { createdOn?: string; startAfter?: string; completedOn?: string | null } = {}) {
  const created = o.createdOn ?? ago(0);
  await worker.db.execute(sql`
    INSERT INTO pgboss.job (name, state, created_on, start_after, completed_on)
    VALUES (${queue}, ${state}::pgboss.job_state, ${created}::timestamptz, ${o.startAfter ?? created}::timestamptz, ${o.completedOn ?? null}::timestamptz)`);
}

beforeAll(async () => {
  await admin.db.execute(sql.raw(`CREATE DATABASE ${name}`));
  await applySingleMigration(ownerUrlFor(name), '0080_runtime_roles');
  boss = new PgBoss({ connectionString: roleUrl('cs_worker', name), supervise: false, schedule: false, migrate: true, max: 2 });
  boss.on('error', () => {});
  await boss.start();
  for (const q of ['alpha', 'beta', 'system-heartbeat']) await boss.createQueue(q);
  await worker.db.execute(sql`GRANT SELECT ON pgboss.version, pgboss.queue TO cs_web`);
  await worker.db.execute(sql`GRANT SELECT, INSERT ON pgboss.job TO cs_web`);
});
afterAll(async () => {
  await boss?.stop({ graceful: false }).catch(() => {});
  await web.close();
  await worker.close();
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
  await admin.close();
});

describe('queueStatsOn as cs_web', () => {
  it('counts seeded pgboss rows per queue and finds the last completed heartbeat, without touching pgboss.archive', async () => {
    await insertJob('alpha', 'created', { createdOn: ago(5 * MIN) });
    await insertJob('alpha', 'retry', { createdOn: ago(60 * MIN), startAfter: ago(10 * MIN) }); // delayed retry: eligible only 10 min ago
    await insertJob('alpha', 'active');
    await insertJob('alpha', 'failed', { completedOn: ago(60 * MIN) });
    await insertJob('alpha', 'failed', { createdOn: ago(50 * 60 * MIN), completedOn: ago(30 * 60 * MIN) }); // older than 24 h: not counted
    await insertJob('alpha', 'completed', { completedOn: ago(MIN) });
    await insertJob('system-heartbeat', 'completed', { completedOn: ago(9 * MIN) });
    await insertJob('system-heartbeat', 'completed', { completedOn: ago(4 * MIN) });
    await insertJob('system-heartbeat', 'created');

    const out = await queueStatsOn(web.db);
    expect(out.queues.map((q) => q.name)).toEqual(['alpha', 'beta', 'system-heartbeat']);
    const alpha = out.queues.find((q) => q.name === 'alpha')!;
    expect(alpha).toMatchObject({ queued: 2, active: 1, failed24h: 1 });
    expect(Math.round((Date.now() - alpha.oldestQueuedAt!.getTime()) / MIN)).toBe(10);
    expect(out.queues.find((q) => q.name === 'beta')).toEqual({ name: 'beta', queued: 0, active: 0, failed24h: 0, oldestQueuedAt: null });
    expect(Math.round((Date.now() - out.lastHeartbeatAt!.getTime()) / MIN)).toBe(4);

    // The reason the query must not union the archive: cs_web has no grant on it.
    expect(await errorText(web.db.execute(sql`SELECT 1 FROM pgboss.archive LIMIT 1`))).toContain('permission denied');
  });
});
