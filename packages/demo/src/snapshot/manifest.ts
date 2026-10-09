import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS_FOLDER } from '@cs/db';
import type postgres from 'postgres';
import { z } from 'zod';

/** Spec §6.1 step 4. No URL, password or host is ever stored. */
const Manifest = z.strictObject({
  version: z.literal(1),
  createdAt: z.string(),
  sourceDatabase: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  serverVersion: z.string(),
  lastMigration: z.string().nullable(),
  tables: z.record(z.string(), z.number().int().nonnegative()),
  evidence: z.strictObject({ files: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() }),
});
export type SnapshotManifest = z.infer<typeof Manifest>;

export const parseManifest = (json: unknown): SnapshotManifest => Manifest.parse(json);

/** `YYYYMMDD-HHMMSS`, UTC. */
export const stampOf = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Exact row counts of every table in the schemas the app owns. */
export async function tableCounts(sql: postgres.Sql): Promise<Record<string, number>> {
  const tables = await sql<{ schema: string; name: string }[]>`
    select table_schema as schema, table_name as name from information_schema.tables
    where table_type = 'BASE TABLE' and table_schema in ('public', 'auth', 'drizzle') order by 1, 2`;
  const out: Record<string, number> = {};
  for (const t of tables) {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const [row] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from ${q(t.schema)}.${q(t.name)}`);
    out[`${t.schema}.${t.name}`] = Number(row?.n ?? 0);
  }
  return out;
}

/** The tag of the newest applied migration (drizzle's `created_at` is the journal's `when`). */
export async function lastMigration(sql: postgres.Sql): Promise<string | null> {
  const rows = await sql<{ created_at: string }[]>`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`.catch(() => []);
  if (rows.length === 0) return null;
  const when = Number(rows[0]!.created_at);
  const journal = JSON.parse(await readFile(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number; tag: string }[] };
  return journal.entries.find((e) => e.when === when)?.tag ?? String(when);
}

/** Spec §6.2 "check afterwards": one line per difference. */
export function compareCounts(expected: Record<string, number>, actual: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [t, n] of Object.entries(expected)) {
    if (!(t in actual)) out.push(`${t}: missing after restore (expected ${n})`);
    else if (actual[t] !== n) out.push(`${t}: expected ${n}, got ${actual[t]}`);
  }
  for (const [t, n] of Object.entries(actual)) if (!(t in expected)) out.push(`${t}: not in the snapshot (${n} rows)`);
  return out;
}
