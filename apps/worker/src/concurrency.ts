import type { JobDefinition } from './jobs';

/**
 * Phase 7c2 (decision 6): pollers per queue so one worker carries 120 clients. Every queue not listed runs one at a
 * time. `WORKER_QUEUE_CONCURRENCY` overrides single entries (`parseConcurrencyOverrides`); `main.ts` stamps the result
 * onto the job definitions (`applyConcurrency`) before `registerJobs`.
 */
export const QUEUE_CONCURRENCY: Readonly<Record<string, number>> = Object.freeze({
  'rival-search': 4,
  'vendor-collect': 4,
  'brief-client': 4,
  'web-capture-page': 4,
  'starting-point-client': 3,
  'engine-tag': 3,
  'engine-review': 3,
  'prospect-snapshot': 2,
  'rank-scan': 2,
  'setup-suggestions': 2,
  'runbook-tailor': 2,
  'rival-monthly-client': 2,
});

export const MIN_QUEUE_CONCURRENCY = 1;
export const MAX_QUEUE_CONCURRENCY = 8;

/**
 * Parses `WORKER_QUEUE_CONCURRENCY` (`"brief-client=6,rival-search=5"`). Unset/blank = no overrides. Throws an `Error`
 * naming the bad entry for a malformed entry, an unknown queue (listing `known`) or a value outside 1–8.
 */
export function parseConcurrencyOverrides(env: NodeJS.ProcessEnv, known: readonly string[]): Record<string, number> {
  const raw = env.WORKER_QUEUE_CONCURRENCY?.trim();
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const bad = (why: string) => new Error(`WORKER_QUEUE_CONCURRENCY: bad entry "${entry}": ${why}`);
    const m = /^([a-z0-9-]+)\s*=\s*(\d+)$/.exec(entry);
    if (!m) throw bad(`expected <queue>=<integer ${MIN_QUEUE_CONCURRENCY}-${MAX_QUEUE_CONCURRENCY}>`);
    const [, name, value] = m as unknown as [string, string, string];
    if (!known.includes(name)) throw bad(`unknown queue; known queues: ${known.join(', ')}`);
    const n = Number(value);
    if (n < MIN_QUEUE_CONCURRENCY || n > MAX_QUEUE_CONCURRENCY) throw bad(`must be ${MIN_QUEUE_CONCURRENCY}-${MAX_QUEUE_CONCURRENCY}`);
    out[name] = n;
  }
  return out;
}

/** Copies of `jobs` with `localConcurrency` from `table` (jobs not in it keep their own); never mutates the input. */
// biome-ignore lint: heterogeneous job payloads
export function applyConcurrency<T extends JobDefinition<any>>(jobs: T[], table: Record<string, number>): T[] {
  return jobs.map((job) => (Object.hasOwn(table, job.name) ? { ...job, localConcurrency: table[job.name] } : { ...job }));
}

/** Decision 20: the worker's app pool = one extra connection per extra poller, plus 10 for everything else. */
export function appPoolMax(jobs: Pick<JobDefinition<unknown>, 'localConcurrency'>[]): number {
  return jobs.reduce((sum, job) => sum + Math.max(0, (job.localConcurrency ?? 1) - 1), 0) + 10;
}
