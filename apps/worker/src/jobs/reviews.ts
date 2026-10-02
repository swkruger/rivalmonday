import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

/** Spec §6.4/§6.5: complaint-theme spikes and theme discovery, nightly before moves (04:30) so new complaint events can feed reputation slump. */
export function createReviewJobs(deps: WorkerDeps) {
  let warned = false;
  const nightly = defineJob({
    name: 'reviews-nightly', schema: z.looseObject({}), cron: '15 4 * * *',
    // Theme discovery is a paid model call: never re-run by pg-boss; the next night picks up anything missed.
    queue: { retryLimit: 0 },
    handler: async () => {
      if (!deps.engineConfigured()) {
        if (!warned) {
          warned = true;
          console.log('[reviews-nightly] OPENROUTER_API_KEY not set; skipping');
        }
        return;
      }
      console.log(`[reviews-nightly] ${JSON.stringify(await deps.runReviewInsights())}`);
    },
  });
  return { nightly };
}
