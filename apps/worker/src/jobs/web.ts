import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

export const WEB_SCHEDULE_BATCH = 200;

export function createWebJobs(
  deps: WorkerDeps,
  /** `enqueueCapture` must use `singletonKey: 'capture:<id>'` (with the short policy: one queued capture per page). */
  queue: { enqueueCapture(trackedPageId: string, startAfterSeconds?: number): Promise<void>; enqueueDiff?(captureId: string): Promise<void> },
) {
  const schedule = defineJob({
    name: 'web-schedule',
    schema: z.looseObject({}),
    cron: '*/15 * * * *',
    handler: async () => {
      const ids = await deps.claimDuePages(WEB_SCHEDULE_BATCH);
      for (const id of ids) await queue.enqueueCapture(id);
      if (ids.length > 0) workerLog.info(`[web-schedule] enqueued ${ids.length} page captures`);
    },
  });
  const capture = defineJob({
    name: 'web-capture-page',
    schema: z.object({ trackedPageId: z.uuid() }),
    queue: { policy: 'short' },
    handler: async ({ trackedPageId }) => {
      const r = await deps.capturePage(trackedPageId);
      // 7c2: the host is busy or its next slot is too far away — come back later instead of holding a poller asleep.
      if (r.status === 'deferred') {
        const retryInSeconds = Math.ceil((r.retryInMs ?? 0) / 1000);
        await queue.enqueueCapture(trackedPageId, retryInSeconds);
        workerLog.info(`[web-capture-page] ${trackedPageId} deferred ${retryInSeconds}s`);
        return { deferred: true, retryInSeconds };
      }
      workerLog.info(`[web-capture-page] ${trackedPageId} → ${r.status}`);
      if (r.status === 'ok' && r.captureId && queue.enqueueDiff) await queue.enqueueDiff(r.captureId);
    },
  });
  const discover = defineJob({
    name: 'discover-pages', usesAi: true,
    schema: z.object({ competitorId: z.uuid() }),
    queue: { policy: 'short' },
    handler: async ({ competitorId }) => {
      const r = await deps.discoverPages(competitorId);
      workerLog.info(`[discover-pages] ${competitorId} → ${JSON.stringify(r)}`);
    },
  });
  return { schedule, capture, discover };
}
