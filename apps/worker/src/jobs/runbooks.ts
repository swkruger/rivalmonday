import type { Ai } from '@cs/ai';
import type { Db, EnvName } from '@cs/db';
import { tailorClientRunbook } from '@cs/engine';
import type { PackLoader, VerticalPack } from '@cs/verticals';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export interface RunbookJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST make no paid calls. */
  envName: EnvName;
}

/** OpenRouter not configured: still write the untailored copy (status `failed`) instead of throwing and retrying with nothing written. */
export async function runRunbookTailor(
  d: { db: Db; getAi: () => Promise<Ai>; packs: PackLoader; generic: () => Promise<VerticalPack> },
  clientId: string,
) {
  let ai: Ai;
  try {
    ai = await d.getAi();
  } catch (err) {
    ai = { chat: async () => { throw err; } } as unknown as Ai;
  }
  return tailorClientRunbook({ db: d.db, ai, packs: d.packs, generic: d.generic }, clientId);
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
