import 'server-only';
import { createDb, type Db } from '@cs/db';
import type { EnqueueJob, JobState, JobStatusLookup, QueueJob } from '@cs/tools';
import { sql } from 'drizzle-orm';
import PgBoss from 'pg-boss';
import { webEnv } from './env';
import type { Enqueue } from './files';

/** The subset of `PgBoss` this module needs — kept narrow so a test can inject a fake without a real connection. */
export interface Boss {
  on(event: 'error', listener: (err: Error) => void): unknown;
  start(): Promise<unknown>;
  send(name: string, data: object, options: { singletonKey: string }): Promise<string | null>;
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
export function createBossQueue(launch: () => Boss): { enqueue: EnqueueJob } {
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
    enqueue: async (job, payload, singletonKey) => {
      await (await boss()).send(job, payload, { singletonKey });
    },
  };
}

const queue = createBossQueue(() => new PgBoss({ connectionString: webEnv().queueDatabaseUrl, supervise: false, schedule: false, migrate: false, max: 2 }));

/** Every job the web app starts (PDF renders, competitor suggestions, page discovery). */
export const enqueueJob: EnqueueJob = queue.enqueue;
/** The worker's `short` policy on `brief-pdf`/`report-pdf` dedupes by `singletonKey`, so repeated page refreshes don't pile up renders. */
export const enqueue: Enqueue = queue.enqueue;

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
export const jobStatus: JobStatusLookup = createJobStatusLookup(async (job, singletonKey) => {
  queueDb ??= createDb(webEnv().queueDatabaseUrl).db;
  return (await queueDb.execute(sql`
    SELECT state, created_on, completed_on FROM pgboss.job
     WHERE name = ${job} AND singleton_key = ${singletonKey}
     ORDER BY created_on DESC LIMIT 1`)) as unknown as JobRow[];
});
