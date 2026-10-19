import type { EnvName } from '@cs/db';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export interface RunbookJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST make no paid calls. */
  envName: EnvName;
}

/** Phase 14b: `runbook-tailor` (enqueued by `advance_client_setup` once the competitors step is done). */
export function createRunbookJobs(deps: WorkerDeps, opts: RunbookJobOptions) {
  const tailor = defineJob({
    name: 'runbook-tailor',
    schema: z.object({ clientId: z.uuid() }),
    // One retry for an infrastructure failure; an AI failure is recorded as `failed` (untailored copy) and is not thrown.
    queue: { policy: 'short', retryLimit: 1 },
    handler: async ({ clientId }) => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        console.log(`[runbook-tailor] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      return deps.tailorRunbook(clientId);
    },
  });
  return { tailor };
}
