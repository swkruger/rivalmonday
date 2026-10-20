import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { MIGRATIONS_FOLDER } from './migrate';

export const MODEL_OPS_TAG = '0025_model_ops';

function modelOpsWhen(): number {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const entry = journal.entries.find((e) => e.tag === MODEL_OPS_TAG);
  if (!entry) throw new Error(`${MODEL_OPS_TAG} missing from migrations/meta/_journal.json`);
  return entry.when;
}

/**
 * Problems that would make the next `migrate` fail. [] = safe to migrate.
 * 0025 adds `client_score_thresholds_check`; a client whose score_thresholds already violates it
 * makes ADD CONSTRAINT abort the whole migration run.
 */
export async function findPredeployProblems(db: Db): Promise<string[]> {
  const when = modelOpsWhen();
  const [reg] = await db.execute<{ migrations: string | null; client: string | null }>(
    sql`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migrations, to_regclass('client')::text AS client`,
  );
  if (!reg?.client) return []; // fresh database

  if (reg.migrations) {
    const applied = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations WHERE created_at = ${when}`,
    );
    if ((applied[0]?.n ?? 0) > 0) return [];
  }

  // Copy of the CHECK body in 0025_model_ops.sql, negated.
  const bad = await db.execute<{ id: string }>(sql`
    SELECT id FROM client WHERE NOT (score_thresholds IS NULL OR (
      (score_thresholds ? 'alert') AND (score_thresholds ? 'brief')
      AND jsonb_typeof(score_thresholds->'alert') = 'number' AND jsonb_typeof(score_thresholds->'brief') = 'number'
      AND (score_thresholds->>'brief')::numeric >= 0 AND (score_thresholds->>'alert')::numeric <= 100
      AND (score_thresholds->>'brief')::numeric < (score_thresholds->>'alert')::numeric))
    ORDER BY id`);
  if (bad.length === 0) return [];
  return [
    `${MODEL_OPS_TAG} is pending and ${bad.length} client row(s) violate its score_thresholds CHECK; fix or null score_thresholds before migrating: ${bad.map((r) => r.id).join(', ')}`,
  ];
}
