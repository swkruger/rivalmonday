import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/** Phase 6b: starter questions for the Ask card, enqueued by `brief-client` once a client's brief is written. */
export function createAskJobs(deps: WorkerDeps) {
  // retryLimit 0: a failed generation keeps last week's row; the next brief run tries again.
  const starters = defineJob({
    name: 'ask-starters', usesAi: true, schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short', retryLimit: 0 },
    handler: async ({ clientId }) => {
      if (!deps.engineConfigured()) return;
      const q = await deps.generateAskStarters(clientId);
      workerLog.info(`[ask-starters] ${clientId} → ${q ? `${q.length} questions` : 'none'}`);
    },
  });
  return { starters };
}
