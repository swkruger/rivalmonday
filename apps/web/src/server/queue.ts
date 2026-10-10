import 'server-only';
import { ToolError } from '@cs/core';
import { createDb, type Db, type EnvName } from '@cs/db';
import type { EnqueueJob, JobState, JobStatusLookup, QueueJob } from '@cs/tools';
import { sql } from 'drizzle-orm';
import PgBoss from 'pg-boss';
import { BACKGROUND_OFF } from './background-off';
import { activeEnvName } from './dev-guard';
import { perEnv } from './env-cache';
import { envUrls } from './runtime-env';
import type { Enqueue } from './files';

/** The subset of `PgBoss` this module needs — kept narrow so a test can inject a fake without a real connection. */
export interface Boss {
  on(event: 'error', listener: (err: Error) => void): unknown;
  start(): Promise<unknown>;
  send(name: string, data: object, options: { singletonKey: string }): Promise<string | null>;
  stop(options: { graceful: boolean }): Promise<unknown>;
}

/**
 * Enqueue only: the worker owns queue creation, schedules and maintenance (decision 8, owner `DATABASE_URL`).
 *
 * Fix round 1 (review finding, Important): a failed first `start()` (bad connection, a Neon hiccup) used to cache
 * the *rejected* promise in `started` forever — every later `/files/*` request on this process replayed the same
 * rejection without ever retrying, permanently wedging PDF enqueues until restart. The `.catch` below resets
 * `started` to `null` before rethrowing, so the caller that hit the failure still sees it, but the *next*
 * `enqueue` call launches and starts a fresh boss instead of being stuck forever.
 */
export function createBossQueue(launch: () => Boss): { enqueue: EnqueueJob; stop(): Promise<void> } {
  let started: Promise<Boss> | null = null;

  function boss(): Promise<Boss> {
    started ??= (async () => {
      const b = launch();
      b.on('error', (e) => console.error('[web queue]', e));
      await b.start();
      return b;
    })().catch((e) => {
      started = null;
      throw e;
    });
    return started;
  }

  return {
    stop: async () => {
      const s = started;
      started = null;
      if (s) await (await s.catch(() => null))?.stop({ graceful: false });
    },
    enqueue: async (job, payload, singletonKey) => {
      await (await boss()).send(job, payload, { singletonKey });
    },
  };
}

/** Deviation 9: the queue belongs to cs_dev's worker; DEMO and TEST ids must never reach it (it calls paid vendors). */
export { BACKGROUND_OFF };
export const refuseJobs: EnqueueJob = async () => {
  throw new ToolError('invalid_input', BACKGROUND_OFF);
};

const queues = perEnv<{ enqueue: EnqueueJob; stop(): Promise<void> }>(
  (name) =>
    name === 'dev'
      ? createBossQueue(() => new PgBoss({ connectionString: envUrls('dev').owner, supervise: false, schedule: false, migrate: false, max: 2 }))
      : { enqueue: refuseJobs, stop: async () => {} },
  (q) => q.stop(),
);

/** cs_dev's real queue, always — never the live environment's (final-review I1). */
const devEnqueue: EnqueueJob = (job, payload, singletonKey) => queues('dev').enqueue(job, payload, singletonKey);

/**
 * Final-review I1: the enqueue for one named environment. Anything built for DEMO or TEST (a registry, a `/files`
 * request) must take its enqueue from here by name, so an owner switching to DEV mid-request cannot send DEMO ids
 * to cs_dev's worker.
 */
export const enqueueFor = (name: EnvName): EnqueueJob => (name === 'dev' ? devEnqueue : refuseJobs);
/**
 * The PDF routes' narrower view of `enqueueFor`. The worker's `short` policy on `brief-pdf`/`report-pdf` dedupes by
 * `singletonKey`, so repeated page refreshes don't pile up renders.
 */
export const pdfEnqueueFor = (name: EnvName): Enqueue => enqueueFor(name);

/** Every job the web app starts (PDF renders, competitor suggestions, page discovery), for the live environment. */
export const enqueueJob: EnqueueJob = (job, payload, singletonKey) => enqueueFor(activeEnvName())(job, payload, singletonKey);

type JobRow = { state: JobState; created_on: Date; completed_on: Date | null };

/** Maps the newest pg-boss row for a queue + singleton key; `query` is injectable so a test needn't build pg-boss tables. */
export function createJobStatusLookup(query: (job: QueueJob, singletonKey: string) => Promise<JobRow[]>): JobStatusLookup {
  return async (job, singletonKey) => {
    const [row] = await query(job, singletonKey);
    return row ? { state: row.state, createdOn: new Date(row.created_on), completedOn: row.completed_on ? new Date(row.completed_on) : null } : null;
  };
}

let queueDb: Db | null = null;

/**
 * Read-only look at the worker's `pgboss.job` table (owner URL, like enqueue). Completed jobs are archived after a
 * while, which reads as "no job" — fine for the one caller, which only polls a search it just started.
 */
const devJobStatus: JobStatusLookup = createJobStatusLookup(async (job, singletonKey) => {
  queueDb ??= createDb(envUrls('dev').owner).db;
  return (await queueDb.execute(sql`
    SELECT state, created_on, completed_on FROM pgboss.job
     WHERE name = ${job} AND singleton_key = ${singletonKey}
     ORDER BY created_on DESC LIMIT 1`)) as unknown as JobRow[];
});
const noJob: JobStatusLookup = async () => null;

/** Final-review I1: DEMO and TEST have no queue, so they read every job as "no job" without connecting. */
export const jobStatusFor = (name: EnvName): JobStatusLookup => (name === 'dev' ? devJobStatus : noJob);
/** The live environment's job status lookup. */
export const jobStatus: JobStatusLookup = (job, singletonKey) => jobStatusFor(activeEnvName())(job, singletonKey);
