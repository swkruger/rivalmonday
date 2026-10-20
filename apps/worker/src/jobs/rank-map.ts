import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/** Phase 13b: refreshes a client's rank-grid static map background (no-op without STADIA_API_KEY). */
export function createRankMapJobs(deps: WorkerDeps) {
  const refresh = defineJob({
    name: 'rank-map-refresh', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short', retryLimit: 2 },
    handler: async ({ clientId }) => {
      const r = await deps.refreshRankMap(clientId);
      workerLog.info(`[rank-map-refresh] ${clientId} → ${r}`);
    },
  });
  return { refresh };
}
