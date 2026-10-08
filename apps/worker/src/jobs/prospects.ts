import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { SINGLE_SHOT_QUEUE } from './vendor';

/** 5b-2 decision 10: paid and one-off — never retried automatically; `singletonKey` `prospect:<clientId>` dedupes a queued duplicate. */
export function createProspectJobs(deps: WorkerDeps) {
  const snapshot = defineJob({
    name: 'prospect-snapshot',
    schema: z.object({ clientId: z.uuid(), reportId: z.uuid() }),
    queue: { ...SINGLE_SHOT_QUEUE, policy: 'short' },
    async handler({ clientId, reportId }) {
      const r = await deps.runProspectSnapshot(clientId, reportId);
      console.log(`[prospect-snapshot] client ${clientId} report ${reportId}: ${r.status}`);
    },
  });
  return { snapshot };
}
