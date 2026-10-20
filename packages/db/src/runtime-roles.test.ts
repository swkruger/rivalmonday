import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { applySingleMigration, ownerUrlFor, roleUrl, testUrls } from '../test/helpers';

/** Spec D9 / migration 0080: least-privilege runtime roles. pg-boss behaviour is covered in apps/worker queue-grants.test.ts. */
const TAG = '0080_runtime_roles';
const admin = postgres(testUrls.owner, { max: 1, onnotice: () => {} });
const scratch: string[] = [];

async function denied(url: string, query: string): Promise<string> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(query);
  } catch (e) {
    return (e as Error).message;
  } finally {
    await sql.end();
  }
  throw new Error(`expected "${query}" to fail`);
}

afterAll(async () => {
  for (const name of scratch) await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe('runtime roles (0080)', () => {
  it('cs_web cannot SELECT public.client', async () => {
    expect(await denied(roleUrl('cs_web'), 'SELECT 1 FROM public.client LIMIT 1')).toContain('permission denied');
  });

  it('cs_worker cannot SELECT public.client', async () => {
    expect(await denied(roleUrl('cs_worker'), 'SELECT 1 FROM public.client LIMIT 1')).toContain('permission denied');
  });

  it('neither role can CREATE in schema public', async () => {
    expect(await denied(roleUrl('cs_web'), 'CREATE TABLE public.cs_web_probe (id int)')).toContain('permission denied');
    expect(await denied(roleUrl('cs_worker'), 'CREATE TABLE public.cs_worker_probe (id int)')).toContain('permission denied');
  });

  it('schema pgboss belongs to cs_worker and cs_web has USAGE on it', async () => {
    const [row] = await admin<{ owner: string; web_usage: boolean }[]>`
      SELECT pg_get_userbyid(nspowner) AS owner, has_schema_privilege('cs_web', oid, 'USAGE') AS web_usage
        FROM pg_namespace WHERE nspname = 'pgboss'`;
    expect(row).toEqual({ owner: 'cs_worker', web_usage: true });
  });

  it('migration fails with the roles message when cs_web is missing', async () => {
    // The roles are cluster-wide and shared by every worktree's test DB, so the real cs_web is never dropped: the
    // migration is run (through the drizzle migrator, in a scratch DB) with its existence check pointed at a role that
    // does not exist.
    const name = `cs_rolesguard_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    scratch.push(name);
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const missing = `cs_web_absent_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const err = await applySingleMigration(ownerUrlFor(name), TAG, (s) => s.replaceAll("'cs_web'", `'${missing}'`)).then(
      () => null,
      (e: { message?: string; cause?: { message?: string } }) => `${e.message ?? ''} ${e.cause?.message ?? ''}`,
    );
    expect(err).toContain('roles cs_worker/cs_web missing');
    const db = postgres(ownerUrlFor(name), { max: 1, onnotice: () => {} });
    try {
      expect(await db`SELECT 1 FROM pg_namespace WHERE nspname = 'pgboss'`).toHaveLength(0);
    } finally {
      await db.end();
    }
  });
});
