import PgBoss from 'pg-boss';
import type { JobDefinition } from './jobs';
import { workerLog } from './log';
import { AI_PAUSE_DEFER_SECONDS, runJob } from './sentry';

export function createBoss(url: string): PgBoss {
  const boss = new PgBoss(url);
  boss.on('error', (err) => workerLog.error({ err }, 'pg-boss error'));
  return boss;
}

export async function registerJobs(
  boss: PgBoss,
  // biome-ignore lint: heterogeneous job payloads
  jobs: JobDefinition<any>[],
  opts: {
    pollingIntervalSeconds?: number;
    /** 7b1: true while the platform is spend-paused; `usesAi` batches are then deferred without running. */
    aiPaused?: () => Promise<boolean>;
  } = {},
): Promise<void> {
  for (const job of jobs) {
    // pg-boss mutates the options object it is given, so pass copies. createQueue is a no-op for an
    // existing queue; updateQueue applies the options to queues created by an earlier deploy.
    await boss.createQueue(job.name, job.queue ? { name: job.name, ...job.queue } : undefined);
    if (job.queue) await boss.updateQueue(job.name, { name: job.name, ...job.queue });
    await boss.work(job.name, { pollingIntervalSeconds: opts.pollingIntervalSeconds ?? 2, includeMetadata: true }, async (batch) => {
      // Re-sent with the same singleton key (a short queue keeps one *queued* job per key; this one is active).
      // Cron-scheduled jobs are never re-sent: pg-boss only dedupes singletonKey on short/singleton/stately queues, so
      // on a standard queue every tick would start another 10-minute chain (N paid runs when a long pause lifts);
      // the next cron tick is the retry.
      const resendItem = (item: (typeof batch)[number]) => async (startAfter: number) => {
        // Trade-off: pg-boss 10 dedupes singletonKey only on short/singleton/stately queues, so re-sending a cron job on a
        // standard queue would start a new 10-minute chain every tick during a long pause (N paid runs when it lifts).
        // A cron job on a platform pause therefore waits for its next scheduled tick instead of retrying in 10 minutes.
        if (job.cron) return;
        await boss.send(job.name, item.data as object, { startAfter, singletonKey: item.singletonKey ?? undefined });
      };
      if (job.usesAi && (await opts.aiPaused?.())) {
        for (const item of batch) await resendItem(item)(AI_PAUSE_DEFER_SECONDS);
        workerLog.info({ job: job.name, jobs: batch.length }, 'batch deferred: AI paused');
        return { deferred: 'ai_paused' };
      }
      let result: void | Record<string, unknown> = undefined;
      for (const item of batch) {
        result = await runJob(job, item.id, job.schema.parse(item.data), job.handler, workerLog, { resend: resendItem(item) });
      }
      return result ?? undefined;
    });
    if (job.cron) await boss.schedule(job.name, job.cron, {});
  }
}

/** `startAfter`: seconds from now (or an ISO string / Date) before the job becomes available. */
export async function enqueue<T>(boss: PgBoss, job: JobDefinition<T>, data: T, opts: { singletonKey?: string; startAfter?: number | string | Date } = {}): Promise<string | null> {
  const payload = job.schema.parse(data);
  return boss.send(job.name, payload as object, opts);
}
