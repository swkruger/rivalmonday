import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { Db } from '@cs/db';
import { loadRehearsalLatency, REHEARSAL_PROVIDER, type RehearsalLatency } from '@cs/engine';
import { sql } from 'drizzle-orm';

export const LATENCY_WINDOW_DAYS = 30;
/** Fewer successful calls than this in the window: the task keeps its current percentiles. */
export const LATENCY_MIN_SAMPLES = 5;

/**
 * Owner-run against `cs_dev` before the rehearsal: rewrites `packages/engine/src/rehearsal-latency.json` (read by the
 * rehearsal AI, Task 10a) with p50/p90/p99 `latency_ms` per task from real, successful `llm_call` rows of the last 30 days.
 * Rehearsal rows (`provider = 'rehearsal'`) carry simulated latencies and are never measured.
 */
export async function measureRehearsalLatency(db: Db, o: { outFile: string; now?: Date; days?: number }): Promise<{ updated: string[]; kept: string[] }> {
  const now = o.now ?? new Date();
  const since = new Date(now.getTime() - (o.days ?? LATENCY_WINDOW_DAYS) * 86_400_000);
  const current: RehearsalLatency = existsSync(o.outFile) ? await loadRehearsalLatency(o.outFile) : {};
  const rows = (await db.execute(sql`
    SELECT task, count(*)::int AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p50,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p90,
           percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p99
      FROM llm_call
     WHERE provider <> ${REHEARSAL_PROVIDER} AND ok AND created_at >= ${since.toISOString()}::timestamptz AND created_at < ${now.toISOString()}::timestamptz
     GROUP BY task ORDER BY task`)) as unknown as { task: string; n: number; p50: number; p90: number; p99: number }[];
  const next: RehearsalLatency = { ...current };
  const updated: string[] = [];
  for (const r of rows) {
    if (Number(r.n) < LATENCY_MIN_SAMPLES) continue;
    next[r.task] = { p50: Math.round(Number(r.p50)), p90: Math.round(Number(r.p90)), p99: Math.round(Number(r.p99)) };
    updated.push(r.task);
  }
  await writeFile(o.outFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await loadRehearsalLatency(o.outFile); // the rehearsal AI's own schema must accept what we wrote
  return { updated, kept: Object.keys(next).filter((t) => !updated.includes(t)).sort() };
}
