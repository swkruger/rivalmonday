import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { applySingleMigration, ownerUrlFor, roleUrl, testUrls } from '../test/helpers';

/** Spec D9 / migration 0080: least-privilege runtime roles. pg-boss behaviour is covered in apps/worker queue-grants.test.ts. */
const TAG = '0080_runtime_roles';
const admin = postgres(testUrls.owner, { max: 1, onnotice: () => {} });
const scratch: string[] = [];
/** Scratch databases are always dropped in afterAll. */
const scratchName = (prefix: string) => {
  const name = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  scratch.push(name);
  return name;
};

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
  // Table level, not schema level: the test DB's wipe recreates `public` without USAGE for PUBLIC, while Neon keeps
  // `=U/pg_database_owner` there, so only table/sequence privileges stand between these roles and tenant data.
  it.each(['cs_web', 'cs_worker'])('%s has no privilege on any relation or sequence in public or auth', async (role) => {
    const offenders = await admin<{ obj: string; priv: string }[]>`
      SELECT format('%I.%I', n.nspname, c.relname) AS obj, p.priv
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p(priv)
       WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND has_table_privilege(${role}, c.oid, p.priv)
      UNION ALL
      SELECT format('%I.%I', n.nspname, c.relname), p.priv
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) AS p(priv)
       WHERE n.nspname IN ('public', 'auth') AND c.relkind = 'S'
         AND has_sequence_privilege(${role}, c.oid, p.priv)
       ORDER BY 1, 2`;
    const [{ n }] = await admin<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'auth') AND c.relname IN ('client', 'agency')`;
    expect(n, 'test DB must hold the migrated public tables').toBeGreaterThanOrEqual(2);
    expect(offenders.map((o) => `${o.priv} ${o.obj}`), `${role} privileges in public/auth`).toEqual([]);
  });

  it('with Neon-like USAGE on public, both roles are refused at table level and cannot CREATE there', async () => {
    const name = scratchName('cs_rolespublic');
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const raw = postgres(ownerUrlFor(name), { max: 1, onnotice: () => {} });
    try {
      await raw.unsafe('CREATE TABLE public.client (id int)');
      // Mimic Neon: PUBLIC keeps USAGE (not CREATE, PG15+) on schema public.
      await raw.unsafe('GRANT USAGE ON SCHEMA public TO PUBLIC');
    } finally {
      await raw.end();
    }
    await applySingleMigration(ownerUrlFor(name), TAG);
    for (const role of ['cs_web', 'cs_worker']) {
      expect(await denied(roleUrl(role, name), 'SELECT 1 FROM public.client LIMIT 1')).toBe('permission denied for table client');
      expect(await denied(roleUrl(role, name), `CREATE TABLE public.${role}_probe (id int)`)).toBe('permission denied for schema public');
    }
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
    const name = scratchName('cs_rolesguard');
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
