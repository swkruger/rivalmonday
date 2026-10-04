import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

/** Spec §9.1: hourly tick; each client's brief is generated in its own job on its Thursday night (local time). */
export function createBriefJobs(deps: WorkerDeps, queue: { enqueueBriefClient(clientId: string): Promise<void> }) {
  const schedule = defineJob({
    name: 'briefs-schedule', schema: z.looseObject({}), cron: '5 * * * *',
    handler: async () => {
      if (!deps.engineConfigured()) return;
      const ids = await deps.listBriefDueClients(new Date());
      for (const id of ids) await queue.enqueueBriefClient(id);
      if (ids.length > 0) console.log(`[briefs-schedule] enqueued ${ids.length} client(s)`);
    },
  });
  // retryLimit 0: generateBrief records failures on the brief row and the next hourly tick retries (≤ 3 attempts).
  const client = defineJob({
    name: 'brief-client', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short', retryLimit: 0 },
    handler: async ({ clientId }) => {
      const r = await deps.generateBrief(clientId);
      console.log(`[brief-client] ${clientId} → ${JSON.stringify(r)}`);
      if (deps.deliveryConfigured()) await deps.notifyBriefOutcome(r, new Date());
    },
  });
  return { schedule, client };
}
