import { type Db, stageRun, type Tx } from '@cs/db';
import { and, eq, sql } from 'drizzle-orm';

export interface StageKey {
  stage: string;
  version: number;
  subjectId: string;
}

export type StageOutcome<R> = { ran: true; result: R } | { ran: false };

/** A `running` claim older than this is assumed to belong to a crashed worker and may be re-claimed. */
export const STALE_RUN_MINUTES = 30;
/** After this many failed attempts a subject is left alone (no endless paid retries); it stays visible as `failed`. */
export const MAX_STAGE_ATTEMPTS = 5;

const whereKey = (key: StageKey) =>
  and(eq(stageRun.stage, key.stage), eq(stageRun.stageVersion, key.version), eq(stageRun.subjectId, key.subjectId));

/** Atomically claims a stage run; false when it is done, exhausted, or freshly claimed by someone else. */
export async function claimStage(db: Db, key: StageKey): Promise<boolean> {
  const rows = (await db.execute(sql`
    INSERT INTO stage_run (stage, stage_version, subject_id, status, attempts, started_at)
    VALUES (${key.stage}, ${key.version}::int, ${key.subjectId}::uuid, 'running', 1, now())
    ON CONFLICT (stage, stage_version, subject_id) DO UPDATE
      SET status = 'running', attempts = stage_run.attempts + 1, started_at = now(), finished_at = NULL, error = NULL
      WHERE stage_run.attempts < ${MAX_STAGE_ATTEMPTS}::int
        AND (stage_run.status = 'failed'
             OR (stage_run.status = 'running' AND stage_run.started_at < now() - make_interval(mins => ${STALE_RUN_MINUTES}::int)))
    RETURNING stage_run.attempts`)) as unknown as { attempts: number }[];
  return rows.length > 0;
}

export async function stageDone(db: Db, key: StageKey): Promise<boolean> {
  const [row] = await db.select({ status: stageRun.status }).from(stageRun).where(whereKey(key)).limit(1);
  return row?.status === 'done';
}

/** Marks the run failed; warns when that failure used up the last of MAX_STAGE_ATTEMPTS (the subject is then left alone). */
async function failStage(db: Db, key: StageKey, err: unknown): Promise<void> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  const [row] = await db
    .update(stageRun)
    .set({ status: 'failed', error: message, finishedAt: new Date() })
    .where(whereKey(key))
    .returning({ attempts: stageRun.attempts });
  if (row && row.attempts >= MAX_STAGE_ATTEMPTS) {
    console.warn(`[engine] stage ${key.stage} v${key.version} exhausted for subject ${key.subjectId}: ${message}`);
  }
}

/**
 * Idempotent stage execution (spec §6): claim → compute (outside any transaction, so model and
 * store calls never hold a DB transaction open) → commit outputs and the `done` marker atomically.
 * A crash between claim and commit leaves a `running` row that becomes re-claimable after
 * STALE_RUN_MINUTES; any thrown error marks the run `failed` (retried on the next claim).
 */
export async function runStage<C, R>(
  db: Db,
  key: StageKey,
  compute: () => Promise<C>,
  commit: (tx: Tx, computed: C) => Promise<R>,
): Promise<StageOutcome<R>> {
  if (!(await claimStage(db, key))) return { ran: false };
  try {
    const computed = await compute();
    const result = await db.transaction(async (tx) => {
      const r = await commit(tx, computed);
      await tx.update(stageRun).set({ status: 'done', finishedAt: new Date() }).where(whereKey(key));
      return r;
    });
    return { ran: true, result };
  } catch (err) {
    await failStage(db, key, err);
    throw err;
  }
}
