import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

/** Spec §6.4: moves are evaluated nightly, one job per client so one failure never blocks the rest. */
export function createMovesJobs(deps: WorkerDeps, queue: { enqueueMovesClient(clientId: string): Promise<void> }) {
  const nightly = defineJob({
    name: 'moves-nightly', schema: z.looseObject({}), cron: '30 4 * * *',
    handler: async () => {
      const ids = await deps.listMoveClients();
      for (const id of ids) await queue.enqueueMovesClient(id);
      console.log(`[moves-nightly] enqueued ${ids.length} client(s)`);
    },
  });
  const client = defineJob({
    name: 'moves-client', schema: z.object({ clientId: z.uuid() }), queue: { policy: 'short' },
    handler: async ({ clientId }) => {
      console.log(`[moves-client] ${clientId} → ${JSON.stringify(await deps.updateMoves(clientId))}`);
      if (!deps.engineConfigured()) return;
      try {
        console.log(`[moves-client] ${clientId} recommendations → ${JSON.stringify(await deps.recommendForMoves(clientId))}`);
      } catch (err) {
        console.warn(`[moves-client] ${clientId} recommendations failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
  return { nightly, client };
}
