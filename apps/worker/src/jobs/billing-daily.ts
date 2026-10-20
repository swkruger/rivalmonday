import { gatewayFor, runBillingDaily } from '@cs/billing';
import type { EnvName } from '@cs/db';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

export interface BillingJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST never run billing (R6). */
  envName: EnvName;
  env: NodeJS.ProcessEnv;
  now?: () => Date;
}

/**
 * Phase 9a Task 6: daily billing maintenance at 02:30 UTC (after `platform-daily-stats` at 02:00, whose rows it
 * annotates). Registered always; the handler returns early (logged) in DEMO/TEST (R6). Without a Stripe key the
 * gateway is null and only the Stripe steps are skipped (R27).
 */
export function createBillingJobs(deps: WorkerDeps, opts: BillingJobOptions) {
  const daily = defineJob({
    name: 'billing-daily',
    schema: z.looseObject({}),
    cron: '30 2 * * *',
    queue: { expireInSeconds: 3600 },
    handler: async () => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        workerLog.info(`[billing-daily] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const gw = gatewayFor(opts.env, opts.envName);
      // R27: no Stripe key => billing is not configured; timers, reminders and stats still run.
      if (!gw) workerLog.info('[billing-daily] billing not configured: Stripe steps skipped');
      const r = await runBillingDaily(deps.serviceDb(), gw, opts.now?.() ?? new Date());
      workerLog.info(`[billing-daily] ${JSON.stringify(r)}`);
      return { ...r };
    },
  });
  return { daily };
}
