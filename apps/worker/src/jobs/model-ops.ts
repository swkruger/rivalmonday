import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

/** Phase 3d decision 10: applies finished Anthropic batches (theme discovery). Idempotent; never retried by pg-boss. */
export function createModelOpsJobs(deps: WorkerDeps) {
  const batchPoll = defineJob({
    name: 'model-batch-poll', schema: z.looseObject({}), cron: '*/15 * * * *', queue: { retryLimit: 0 },
    handler: async () => {
      if (!deps.engineConfigured()) return;
      const r = await deps.collectModelBatches();
      if (r.checked > 0) console.log(`[model-batch-poll] ${JSON.stringify(r)}`);
    },
  });
  return { batchPoll };
}
