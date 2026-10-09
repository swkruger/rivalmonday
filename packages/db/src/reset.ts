import postgres from 'postgres';
import { assertDatabase } from './environments';
import { runMigrations } from './migrate';

export const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const ROLE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export const NEON_CREATE_HINT = (name: string) => `Create database ${name} in the Neon console, then re-run.`;

/** Errors never carry a URL, password or host: strips postgres URLs and *.neon.tech hostnames from text. */
export function redactSecrets(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, '<redacted>').replace(/\b[\w.-]+\.neon\.tech\b/gi, '<host>');
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
