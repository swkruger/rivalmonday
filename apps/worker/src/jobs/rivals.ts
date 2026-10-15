import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { SINGLE_SHOT_QUEUE } from './vendor';

/** Review samples get 30 min to land before finalise is forced (reviews then stay null). */
export const FORCE_FINALISE_AFTER_SECONDS = 1800;

/**
 * Phase 12a competitor discovery: `rival-search` runs one discovery run (paid, so single-shot);
 * `rival-finalise` recomputes tiers when review samples land (vendor-poll) or is forced 30 min later;
 * `rival-sweep` fails dead runs and forces stuck finalises; `signals-weekly` rates tracked competitors.
 */
export function createRivalJobs(
  deps: WorkerDeps,
  queue: { enqueueFinalise(runId: string, opts: { force: boolean; startAfter?: number }): Promise<void>; now?: () => Date },
) {
  const now = queue.now ?? (() => new Date());
  const search = defineJob({
    name: 'rival-search', schema: z.object({ runId: z.uuid() }),
    // Up to ~150 paid calls: never retried, never expired mid-run; queued duplicates collapse.
    queue: { ...SINGLE_SHOT_QUEUE, expireInSeconds: 7200, policy: 'short' },
    handler: async ({ runId }) => {
      if (!deps.vendorsConfigured()) {
        console.log(`[rival-search] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; failing run ${runId}`);
        await deps.failRivalRun(runId, 'vendors_unconfigured');
        return;
      }
      const r = await deps.runRivalSearch(runId);
      console.log(`[rival-search] ${runId} → ${r.status}`);
      if (r.status === 'finalising') await queue.enqueueFinalise(runId, { force: true, startAfter: FORCE_FINALISE_AFTER_SECONDS });
    },
  });
  const finalise = defineJob({
    name: 'rival-finalise', schema: z.object({ runId: z.uuid(), force: z.boolean().default(false) }),
    queue: { policy: 'short' },
    handler: async ({ runId, force }) => {
      const r = await deps.finaliseRivalSearch(runId, { force });
      if (r === 'done') console.log(`[rival-finalise] ${runId} done${force ? ' (forced)' : ''}`);
    },
  });
  const sweep = defineJob({
    name: 'rival-sweep', schema: z.looseObject({}), cron: '*/15 * * * *',
    handler: async () => {
      const r = await deps.sweepRivalRuns(now());
      if (r.stale + r.finalised > 0) console.log(`[rival-sweep] ${JSON.stringify(r)}`);
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
          console.error(`[signals-weekly] client ${clientId} failed`, err);
        }
      }
      console.log(`[signals-weekly] rated ${rated} tracked competitor(s)`);
    },
  });
  return { search, finalise, sweep, signalsWeekly };
}
