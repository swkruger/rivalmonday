import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/** Spec §6.4/§6.5: complaint-topic spikes and topic discovery, nightly before moves (04:30) so new complaint events can feed reputation slump. */
export function createReviewJobs(deps: WorkerDeps) {
  let warned = false;
  const nightly = defineJob({
    name: 'reviews-nightly', schema: z.looseObject({}), cron: '15 4 * * *',
    // Topic discovery is a paid model call: never re-run by pg-boss; the next night picks up anything missed.
    queue: { retryLimit: 0 },
    handler: async () => {
      if (!deps.engineConfigured()) {
        if (!warned) {
          warned = true;
          workerLog.info('[reviews-nightly] OPENROUTER_API_KEY not set; skipping');
        }
        return;
      }
      workerLog.info(`[reviews-nightly] ${JSON.stringify(await deps.runReviewInsights())}`);
    },
  });
  return { nightly };
}
