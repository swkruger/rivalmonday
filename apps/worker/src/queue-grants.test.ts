import { randomUUID } from 'node:crypto';
import { createDb } from '@cs/db';
import { applySingleMigration, errorText, ownerUrlFor, roleUrl, testUrls } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import PgBoss from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureQueueGrants } from './queue-grants';

/**
 * Spec D9 / migration 0080. Everything runs in one scratch database (always dropped) holding only 0080, so pgboss is
 * fresh and created by cs_worker, exactly like production: the shared test DB's pgboss was created by the superuser.
 */
const name = `cs_qgrants_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const admin = createDb(testUrls.owner);
const QUEUE = 'test-grants';
const OWNER_QUEUE = 'test-grants-owner';

const boss = (url: string, migrate: boolean) => {
  const b = new PgBoss({ connectionString: url, supervise: false, schedule: false, migrate, max: 2 });
  b.on('error', () => {});
  return b;
};
let worker: PgBoss;
let web: PgBoss;
const webDb = () => createDb(roleUrl('cs_web', name));

async function grantAsWorker(): Promise<void> {
  const { db, close } = createDb(roleUrl('cs_worker', name));
  try {
    await ensureQueueGrants(db);
  } finally {
    await close();
  }
}

const failure = errorText;

beforeAll(async () => {
  await admin.db.execute(sql.raw(`CREATE DATABASE ${name}`));
  await applySingleMigration(ownerUrlFor(name), '0080_runtime_roles');
});
afterAll(async () => {
  await web?.stop({ graceful: false }).catch(() => {});
  await worker?.stop({ graceful: false }).catch(() => {});
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
  await admin.close();
});

describe('ensureQueueGrants + cs_web (0080)', () => {
  it('fresh pgboss: worker start as cs_worker + ensureQueueGrants → cs_web send works', async () => {
    worker = boss(roleUrl('cs_worker', name), true);
    await worker.start();
    await worker.createQueue(QUEUE);
    // Before the grants cs_web cannot even start (it reads pgboss.version); the web's createBossQueue retries later.
    const early = boss(roleUrl('cs_web', name), false);
    expect(await failure(early.start())).toContain('permission denied');
    await early.stop({ graceful: false }).catch(() => {});
    await grantAsWorker();
    web = boss(roleUrl('cs_web', name), false);
    await web.start();
    expect(await web.send(QUEUE, { n: 1 })).toEqual(expect.any(String));
  });

  it('cs_web can send a job and read its status', async () => {
    const id = await web.send(QUEUE, { n: 2 }, { singletonKey: 'k2' });
    const { db, close } = webDb();
    try {
      const rows = await db.execute(sql`SELECT state FROM pgboss.job WHERE name = ${QUEUE} AND singleton_key = 'k2' ORDER BY created_on DESC LIMIT 1`);
      expect([...rows]).toEqual([{ state: 'created' }]);
      expect(await web.getJobById(QUEUE, id as string)).toMatchObject({ id, state: 'created' });
    } finally {
      await close();
    }
  });

  it('cs_web cannot UPDATE or DELETE pgboss.job', async () => {
    const { db, close } = webDb();
    try {
      expect(await failure(db.execute(sql`UPDATE pgboss.job SET state = 'cancelled' WHERE name = ${QUEUE}`))).toContain('permission denied');
      expect(await failure(db.execute(sql`DELETE FROM pgboss.job WHERE name = ${QUEUE}`))).toContain('permission denied');
    } finally {
      await close();
    }
  });

  it('cs_web cannot SELECT pgboss.archive', async () => {
    const { db, close } = webDb();
    try {
      expect(await failure(db.execute(sql`SELECT 1 FROM pgboss.archive LIMIT 1`))).toContain('permission denied');
    } finally {
      await close();
    }
  });

  it('ensureQueueGrants succeeds when an owner-created queue partition exists', async () => {
    // A dev worker on the owner URL creates owner-owned partitions; a schema-wide grant by cs_worker would fail on them.
    const owner = boss(ownerUrlFor(name), true);
    await owner.start();
    try {
      await owner.createQueue(OWNER_QUEUE);
    } finally {
      await owner.stop({ graceful: false });
    }
    await expect(grantAsWorker()).resolves.toBeUndefined();
    expect(await web.send(OWNER_QUEUE, { n: 3 })).toEqual(expect.any(String));
  });
});
