import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { SINGLE_SHOT_QUEUE } from './vendor';
import { workerLog } from '../log';

/** Review samples get 30 min to land before finalise is forced (reviews then stay null). */
export const FORCE_FINALISE_AFTER_SECONDS = 1800;
/**
 * The monthly refresh spaces its per-client jobs this far apart (pg-boss `startAfter`). 7c2: `rival-search` runs 4 at a
 * time (`QUEUE_CONCURRENCY`), so 15 min keeps the queue short of the 2 h stale sweep for a typical 20–40 min search.
 */
export const RIVAL_MONTHLY_SPACING_SECONDS = 900;

/**
 * Phase 12a competitor discovery: `rival-search` runs one discovery run (paid, so single-shot);
 * `rival-finalise` recomputes tiers when review samples land (vendor-poll) or is forced 30 min later;
 * `rival-sweep` fails dead runs and forces stuck finalises; `signals-weekly` rates tracked competitors;
 * `rival-monthly` refreshes every eligible client's suggestions on the first Monday of the month (trigger `scheduled`).
 */
export function createRivalJobs(
  deps: WorkerDeps,
  queue: {
    enqueueFinalise(runId: string, opts: { force: boolean; startAfter?: number }): Promise<void>;
    /** Queues the light `rival-monthly-client` job, available `startAfter` seconds from now. */
    enqueueMonthlyClient(clientId: string, opts: { startAfter: number; singletonKey: string }): Promise<void>;
    /** Starts a `scheduled` discovery run now (`startCompetitorSearch`). */
    startScheduledSearch(clientId: string): Promise<{ runId: string } | { refused: string }>;
    now?: () => Date;
  },
) {
  const now = queue.now ?? (() => new Date());
  const search = defineJob({
    name: 'rival-search', schema: z.object({ runId: z.uuid() }),
    // Up to ~150 paid calls: never retried, never expired mid-run; queued duplicates collapse.
    queue: { ...SINGLE_SHOT_QUEUE, expireInSeconds: 7200, policy: 'short' },
    handler: async ({ runId }) => {
      if (!deps.vendorsConfigured()) {
        workerLog.info(`[rival-search] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; failing run ${runId}`);
        await deps.failRivalRun(runId, 'vendors_unconfigured');
        return;
      }
      const r = await deps.runRivalSearch(runId);
      workerLog.info(`[rival-search] ${runId} → ${r.status}`);
      if (r.status === 'finalising') await queue.enqueueFinalise(runId, { force: true, startAfter: FORCE_FINALISE_AFTER_SECONDS });
    },
  });
  const finalise = defineJob({
    name: 'rival-finalise', schema: z.object({ runId: z.uuid(), force: z.boolean().default(false) }),
    queue: { policy: 'short' },
    handler: async ({ runId, force }) => {
      const r = await deps.finaliseRivalSearch(runId, { force });
      if (r === 'done') workerLog.info(`[rival-finalise] ${runId} done${force ? ' (forced)' : ''}`);
    },
  });
  const sweep = defineJob({
    name: 'rival-sweep', schema: z.looseObject({}), cron: '*/15 * * * *',
    handler: async () => {
      const r = await deps.sweepRivalRuns(now());
      if (r.stale + r.finalised > 0) workerLog.info(`[rival-sweep] ${JSON.stringify(r)}`);
    },
  });
  const signalsWeekly = defineJob({
    name: 'signals-weekly', schema: z.looseObject({}), cron: '0 9 * * 1',
    handler: async () => {
      const at = now();
      let rated = 0;
      for (const clientId of await deps.listSignalClients()) {
        try {
          rated += await deps.computeTrackedSignals(clientId, at);
        } catch (err) {
          workerLog.error({ err }, `[signals-weekly] client ${clientId} failed`);
        }
      }
      workerLog.info(`[signals-weekly] rated ${rated} tracked competitor(s)`);
    },
  });
  // Owner decision 2026-10-15: monthly automatic refresh. Standard cron ORs day-of-month with day-of-week, so
  // '0 10 1-7 * 1' would fire on days 1–7 *and* every Monday; run every Monday and skip unless it is the first one.
  // The fan-out only queues one light job per client; each creates its discovery_run when it becomes due, so no
  // run sits `queued` behind the serial `rival-search` queue long enough to be swept as stale.
  const monthly = defineJob({
    name: 'rival-monthly', schema: z.looseObject({}), cron: '0 10 * * 1',
    handler: async () => {
      const at = now();
      // A first-Monday window missed (worker down all of 10:00 UTC that day) is not caught up — backlog item.
      if (at.getUTCDate() > 7) return;
      const month = at.toISOString().slice(0, 7);
      let queued = 0;
      for (const clientId of await deps.listMonthlyRivalClients()) {
        try {
          await queue.enqueueMonthlyClient(clientId, { startAfter: queued * RIVAL_MONTHLY_SPACING_SECONDS, singletonKey: `rival-monthly:${clientId}:${month}` });
          queued++;
        } catch (err) {
          workerLog.error({ err }, `[rival-monthly] client ${clientId} failed`);
        }
      }
      workerLog.info(`[rival-monthly] queued ${queued} client refresh(es)`);
    },
  });
  const monthlyClient = defineJob({
    name: 'rival-monthly-client', schema: z.object({ clientId: z.uuid() }),
    queue: { policy: 'short' },
    handler: async ({ clientId }) => {
      const r = await queue.startScheduledSearch(clientId);
      workerLog.info(`[rival-monthly-client] ${clientId} → ${'runId' in r ? `run ${r.runId}` : `refused (${r.refused})`}`);
    },
  });
  return { search, finalise, sweep, signalsWeekly, monthly, monthlyClient };
}
