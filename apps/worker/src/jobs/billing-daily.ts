import { gatewayFor, runBillingDaily } from '@cs/billing';
import type { EnvName } from '@cs/db';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export interface BillingJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST never run billing (R6). */
  envName: EnvName;
  env: NodeJS.ProcessEnv;
  now?: () => Date;
}

/**
 * Phase 9a Task 6: daily billing maintenance at 02:30 UTC (after `platform-daily-stats` at 02:00, whose rows it
 * annotates). Registered always; the handler returns early (logged) in DEMO/TEST (R6).
 */
export function createBillingJobs(deps: WorkerDeps, opts: BillingJobOptions) {
  const daily = defineJob({
    name: 'billing-daily',
    schema: z.looseObject({}),
    cron: '30 2 * * *',
    queue: { expireInSeconds: 3600 },
    handler: async () => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        console.log(`[billing-daily] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const r = await runBillingDaily(deps.serviceDb(), gatewayFor(opts.env, opts.envName), opts.now?.() ?? new Date());
      console.log(`[billing-daily] ${JSON.stringify(r)}`);
      return { ...r };
    },
  });
  return { daily };
}
