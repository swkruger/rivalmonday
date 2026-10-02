import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export const WEB_SCHEDULE_BATCH = 200;

export function createWebJobs(
  deps: WorkerDeps,
  queue: { enqueueCapture(trackedPageId: string): Promise<void>; enqueueDiff?(captureId: string): Promise<void> },
) {
  const schedule = defineJob({
    name: 'web-schedule',
    schema: z.looseObject({}),
    cron: '*/15 * * * *',
    handler: async () => {
      const ids = await deps.claimDuePages(WEB_SCHEDULE_BATCH);
      for (const id of ids) await queue.enqueueCapture(id);
      if (ids.length > 0) console.log(`[web-schedule] enqueued ${ids.length} page captures`);
    },
  });
  const capture = defineJob({
    name: 'web-capture-page',
    schema: z.object({ trackedPageId: z.uuid() }),
    handler: async ({ trackedPageId }) => {
      const r = await deps.capturePage(trackedPageId);
      console.log(`[web-capture-page] ${trackedPageId} → ${r.status}`);
      if (r.status === 'ok' && r.captureId && queue.enqueueDiff) await queue.enqueueDiff(r.captureId);
    },
  });
  const discover = defineJob({
    name: 'discover-pages',
    schema: z.object({ competitorId: z.uuid() }),
    handler: async ({ competitorId }) => {
      const r = await deps.discoverPages(competitorId);
      console.log(`[discover-pages] ${competitorId} → ${JSON.stringify(r)}`);
    },
  });
  return { schedule, capture, discover };
}
