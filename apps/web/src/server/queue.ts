import 'server-only';
import type { EnqueueJob } from '@cs/tools';
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
