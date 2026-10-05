import 'server-only';
import PgBoss from 'pg-boss';
import { webEnv } from './env';
import type { Enqueue } from './files';

let started: Promise<PgBoss> | null = null;

/** Enqueue only: the worker owns queue creation, schedules and maintenance (decision 8, owner `DATABASE_URL`). */
function boss(): Promise<PgBoss> {
  started ??= (async () => {
    const b = new PgBoss({ connectionString: webEnv().queueDatabaseUrl, supervise: false, schedule: false, migrate: false, max: 2 });
    b.on('error', (e) => console.error('[web queue]', e));
    await b.start();
    return b;
  })();
  return started;
}

/** The worker's `short` policy on `brief-pdf`/`report-pdf` dedupes by `singletonKey`, so repeated page refreshes don't pile up renders. */
export const enqueue: Enqueue = async (job, payload, singletonKey) => {
  await (await boss()).send(job, payload, { singletonKey });
};
