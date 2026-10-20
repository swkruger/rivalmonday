import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { VERTICAL_CATALOG_SEED } from './catalog-seed.sql';
import { assertDatabase } from './environments';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate';

export const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const ROLE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export const NEON_CREATE_HINT = (name: string) => `Create database ${name} in the Neon console, then re-run.`;

/**
 * Errors never carry a URL, password or host. Strips postgres URLs, `user:pass@`, `@host[:port]`, `host=` values,
 * *.neon.tech hostnames and bare IPv4 addresses (with optional port). Role and database names are left alone.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '<redacted>')
    .replace(/[\w.%+-]+:[^\s@/:"']+@/g, '<redacted>@')
    .replace(/@(?!<)[\w.-]+(?::\d+)?/g, '@<host>')
    .replace(/\b(host(?:addr)?)=('[^']*'|"[^"]*"|[^\s,;]+)/gi, '$1=<host>')
    .replace(/\b[\w.-]+\.neon\.tech\b/gi, '<host>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<host>');
}

const connect = (url: string) => postgres(url, { max: 1, onnotice: () => {} });

/**
 * Spec §7: the wipe that `packages/db/test/global-setup.ts` used to do inline, generalised to an exact expected name.
 * Both the URL's database name and the server's `current_database()` must equal `expected`.
 */
export async function wipeDatabase(ownerUrl: string, expected: string): Promise<void> {
  assertDatabase(ownerUrl, expected);
  const sql = connect(ownerUrl);
  try {
    const [row] = await sql<{ current_database: string }[]>`select current_database()`;
    if (row?.current_database !== expected) throw new Error(`Refusing to wipe database "${row?.current_database}": expected exactly "${expected}"`);
    await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await sql.end();
  }
}

export async function resetDatabase(ownerUrl: string, expected: string): Promise<void> {
  await wipeDatabase(ownerUrl, expected);
  await runMigrations(ownerUrl);
}

/** Fingerprint of every migration file (SQL + drizzle journal); a change means the schema must be rebuilt. */
export function migrationsFingerprint(folder: string = MIGRATIONS_FOLDER): string {
  const hash = createHash('sha256');
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, `${rel}${entry.name}/`);
      else hash.update(`${rel}${entry.name}\0`).update(readFileSync(path)).update('\0');
    }
  };
  walk(folder, '');
  return hash.digest('hex');
}

const META = 'cs_test_meta';

/**
 * Test-run start: wipe + migrate only when the migrations changed since the last run (or `TEST_DB_FULL_RESET=1`);
 * otherwise empty every table in `public` and `auth` and re-seed the vertical catalogue, which is what a fresh migrate leaves.
 * The fingerprint lives in its own schema, which the wipe never drops; it is cleared before a rebuild and written only
 * after a successful migrate, so an interrupted run always rebuilds next time.
 */
export async function prepareTestDatabase(ownerUrl: string, expected: string): Promise<'migrated' | 'truncated'> {
  assertDatabase(ownerUrl, expected);
  if (!expected.endsWith('_test')) throw new Error(`Refusing to prepare database "${expected}": test database names must end with _test`);
  const fingerprint = migrationsFingerprint();
  const sql = connect(ownerUrl);
  try {
    const [row] = await sql<{ current_database: string }[]>`select current_database()`;
    if (row?.current_database !== expected) throw new Error(`Refusing to prepare database "${row?.current_database}": expected exactly "${expected}"`);
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${META}; CREATE TABLE IF NOT EXISTS ${META}.fingerprint (value text NOT NULL)`);
    const [stored] = await sql<{ value: string }[]>`select value from cs_test_meta.fingerprint limit 1`;
    if (process.env.TEST_DB_FULL_RESET !== '1' && stored?.value === fingerprint) {
      const [list] = await sql<{ tables: string | null }[]>`
        select string_agg(format('%I.%I', schemaname, tablename), ', ') as tables
        from pg_tables where schemaname in ('public', 'auth')`;
      if (list?.tables) await sql.unsafe(`TRUNCATE TABLE ${list.tables} RESTART IDENTITY CASCADE`);
      // Migration 0077 seeds the vertical catalogue, so a fresh migrate leaves it; the truncate must restore it.
      for (const stmt of VERTICAL_CATALOG_SEED) await sql.unsafe(stmt);
      return 'truncated';
    }
    await sql`delete from cs_test_meta.fingerprint`;
  } finally {
    await sql.end();
  }
  await resetDatabase(ownerUrl, expected);
  const done = connect(ownerUrl);
  try {
    await done`insert into cs_test_meta.fingerprint (value) values (${fingerprint})`;
  } finally {
    await done.end();
  }
  return 'migrated';
}

export async function databaseExists(maintenanceUrl: string, name: string): Promise<boolean> {
  const sql = connect(maintenanceUrl);
  try {
    return (await sql`select 1 from pg_database where datname = ${name}`).length > 0;
  } finally {
    await sql.end();
  }
}

/**
 * Spec §7: `CREATE DATABASE` through the owner role, then the CONNECT grant the migrations' role grants rely on.
 * `maintenanceUrl` is any database on the same server the owner may connect to (cs_dev). Neon may refuse.
 */
export async function ensureDatabase(maintenanceUrl: string, name: string, grantTo: string[] = []): Promise<'exists' | 'created'> {
  if (!IDENT.test(name)) throw new Error(`Invalid database name "${name}"`);
  for (const r of grantTo) if (!ROLE.test(r)) throw new Error('Invalid role name');
  if (await databaseExists(maintenanceUrl, name)) return 'exists';
  const sql = connect(maintenanceUrl);
  try {
    try {
      await sql.unsafe(`CREATE DATABASE "${name}"`);
    } catch (e) {
      throw new Error(`${NEON_CREATE_HINT(name)} (${redactSecrets((e as Error).message)})`);
    }
    if (grantTo.length) await sql.unsafe(`GRANT CONNECT ON DATABASE "${name}" TO ${grantTo.map((r) => `"${r}"`).join(', ')}`);
    return 'created';
  } finally {
    await sql.end();
  }
}

/** Only the snapshot round-trip test's scratch databases may be dropped from code. */
export async function dropScratchDatabase(maintenanceUrl: string, name: string): Promise<void> {
  if (!IDENT.test(name) || !name.startsWith('cs_roundtrip_')) throw new Error(`Refusing to drop "${name}": only cs_roundtrip_ scratch databases`);
  const sql = connect(maintenanceUrl);
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await sql.end();
  }
}
