import { snapshotPlatformCosts } from '@cs/tools';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

/**
 * Phase 8c: daily platform hosting-cost snapshot (06:00 UTC) plus low-balance emails to platform owners. `short` policy keeps
 * at most one queued run per singletonKey, so a web "Refresh now" that enqueues this job cannot pile up. Logs only the
 * per-service status map (no amounts, addresses or vendor bodies).
 */
export function createPlatformCostsJobs(deps: WorkerDeps) {
  const snapshot = defineJob({
    name: 'platform-costs-snapshot',
    schema: z.looseObject({}),
    cron: '0 6 * * *',
    queue: { policy: 'short', expireInSeconds: 600, retryLimit: 1 },
    handler: async () => {
      const { statuses } = await snapshotPlatformCosts(deps.platformCosts());
      console.log(`[platform-costs-snapshot] ${JSON.stringify(statuses)}`);
      return { statuses };
    },
  });
  return { snapshot };
}
