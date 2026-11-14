import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/** 18e: Facebook/Instagram account discovery and the weekly pull (ScrapeCreators credits; a retry would pay again, so none). */
export function createSocialJobs(deps: WorkerDeps) {
  const discover = defineJob({
    name: 'social-discover', schema: z.object({ competitorId: z.uuid() }), queue: { policy: 'short', retryLimit: 0, expireInSeconds: 3600 },
    handler: async ({ competitorId }) => {
      workerLog.info(`[social-discover] ${competitorId} → ${JSON.stringify(await deps.discoverSocial(competitorId))}`);
    },
  });
  const pull = defineJob({
    name: 'social-pull', schema: z.object({ competitorId: z.uuid() }), queue: { retryLimit: 0, expireInSeconds: 3600 },
    handler: async ({ competitorId }) => {
      workerLog.info(`[social-pull] ${competitorId} → ${JSON.stringify(await deps.pullSocial(competitorId))}`);
    },
  });
  return { discover, pull };
}
