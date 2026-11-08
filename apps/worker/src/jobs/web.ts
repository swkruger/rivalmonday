import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

export const WEB_SCHEDULE_BATCH = 200;
/** Owner cap: competitors re-discovered per daily run (= `DISCOVERY_SCHEDULE_BATCH`). */
export const DISCOVERY_BATCH = 25;

export function createWebJobs(
  deps: WorkerDeps,
  /** `enqueueCapture` must use `singletonKey: 'capture:<id>'` (with the short policy: one queued capture per page). */
  queue: {
    enqueueCapture(trackedPageId: string, startAfterSeconds?: number): Promise<void>;
    enqueueDiff?(captureId: string): Promise<void>;
    /** Must use `singletonKey: 'discover:<id>'`. */
    enqueueDiscover?(competitorId: string): Promise<void>;
  },
  /** 18a-2 D6: `webMonitoring` = `WEB_MONITORING_ENABLED === 'true'`; the discovery scheduler idles without it. */
  opts: { webMonitoring: boolean },
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
  let idleLogged = false;
  const discoverSchedule = defineJob({
    name: 'discover-schedule',
    schema: z.looseObject({}),
    cron: '0 4 * * *',
    handler: async () => {
      if (!opts.webMonitoring) {
        if (!idleLogged) workerLog.info('[discover-schedule] idle: WEB_MONITORING_ENABLED is not true');
        idleLogged = true;
        return;
      }
      const ids = await deps.claimDueDiscoveries(DISCOVERY_BATCH);
      for (const id of ids) await queue.enqueueDiscover?.(id);
      if (ids.length > 0) workerLog.info(`[discover-schedule] enqueued ${ids.length} site discoveries`);
    },
  });
  return { schedule, capture, discover, discoverSchedule };
}
