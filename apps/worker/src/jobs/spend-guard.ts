import { runSpendGuard } from '@cs/tools';
import type { EnvName } from '@cs/db';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

export interface SpendGuardJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST never run the guard (no real spend, no mail). */
  envName: EnvName;
}

/** 7b1: hourly (minute 7) client spend guard. `short` keeps one queued run; one retry. Logs counts only. */
export function createSpendGuardJobs(deps: WorkerDeps, opts: SpendGuardJobOptions) {
  const guard = defineJob({
    name: 'spend-guard',
    schema: z.looseObject({}),
    cron: '7 * * * *',
    queue: { policy: 'short', retryLimit: 1 },
    handler: async () => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        workerLog.info(`[spend-guard] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const summary = await runSpendGuard(deps.spendGuard(), new Date());
      workerLog.info(`[spend-guard] ${JSON.stringify(summary)}`);
      return { ...summary };
    },
  });
  return { guard };
}
