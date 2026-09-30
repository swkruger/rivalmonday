import PgBoss from 'pg-boss';
import type { JobDefinition } from './jobs';

export function createBoss(url: string): PgBoss {
  const boss = new PgBoss(url);
  boss.on('error', (err) => console.error('[pg-boss]', err));
  return boss;
}

export async function registerJobs(
  boss: PgBoss,
  // biome-ignore lint: heterogeneous job payloads
  jobs: JobDefinition<any>[],
  opts: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  for (const job of jobs) {
    await boss.createQueue(job.name);
    await boss.work(job.name, { pollingIntervalSeconds: opts.pollingIntervalSeconds ?? 2 }, async (batch) => {
      for (const item of batch) {
        await job.handler(job.schema.parse(item.data));
      }
    });
    if (job.cron) await boss.schedule(job.name, job.cron, {});
  }
}

export async function enqueue<T>(boss: PgBoss, job: JobDefinition<T>, data: T): Promise<string | null> {
  const payload = job.schema.parse(data);
  return boss.send(job.name, payload as object);
}
