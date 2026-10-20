import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/** Spec §9.1: hourly tick; each client's brief is generated in its own job on its Thursday night (local time). */
export function createBriefJobs(deps: WorkerDeps, queue: { enqueueBriefClient(clientId: string): Promise<void>; enqueueAskStarters(clientId: string): Promise<void> }) {
  const schedule = defineJob({
    name: 'briefs-schedule', schema: z.looseObject({}), cron: '5 * * * *',
    handler: async () => {
      if (!deps.engineConfigured()) return;
      const ids = await deps.listBriefDueClients(new Date());
      for (const id of ids) await queue.enqueueBriefClient(id);
      if (ids.length > 0) workerLog.info(`[briefs-schedule] enqueued ${ids.length} client(s)`);
    },
  });
  // retryLimit 0: generateBrief records failures on the brief row and the next hourly tick retries (≤ 3 attempts).
  const client = defineJob({
    name: 'brief-client', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short', retryLimit: 0 },
    handler: async ({ clientId }) => {
      const r = await deps.generateBrief(clientId);
      workerLog.info(`[brief-client] ${clientId} → ${JSON.stringify(r)}`);
      if (deps.deliveryConfigured()) await deps.notifyBriefOutcome(r, new Date());
      // Phase 6b: fresh starter questions after a written brief (standard or quiet); a failed/skipped brief gets none.
      if (r.status === 'ready') await queue.enqueueAskStarters(clientId);
    },
  });
  return { schedule, client };
}

/** Phase 12b (spec § Generation): hourly at :15; each due client's one-off starting point runs in its own job. */
export function createStartingPointJobs(deps: WorkerDeps, queue: { enqueueStartingPointClient(clientId: string): Promise<void> }) {
  const schedule = defineJob({
    name: 'starting-point-schedule', schema: z.looseObject({}), cron: '15 * * * *',
    handler: async () => {
      if (!deps.engineConfigured()) return;
      const ids = await deps.listStartingPointDue(new Date());
      for (const id of ids) await queue.enqueueStartingPointClient(id);
      if (ids.length > 0) workerLog.info(`[starting-point-schedule] enqueued ${ids.length} client(s)`);
    },
  });
  // Failures are recorded on the brief row and retried by the next tick (≤ 3 attempts); retryLimit 2 covers a throw before the claim.
  const client = defineJob({
    name: 'starting-point-client', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short', retryLimit: 2 },
    handler: async ({ clientId }) => {
      const r = await deps.generateStartingPoint(clientId);
      workerLog.info(`[starting-point-client] ${clientId} → ${JSON.stringify(r)}`);
      if (deps.deliveryConfigured()) await deps.notifyBriefOutcome(r, new Date());
    },
  });
  return { schedule, client };
}
