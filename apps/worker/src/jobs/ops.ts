import { markOpsAlertEmailed } from '@cs/engine';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/**
 * 7c2: hourly (minute 25) brief readiness check. Records missing/late briefs in `ops_alert` and emails platform staff once
 * per alert: an alert is marked emailed only when every recipient's send succeeded, else it is retried next hour.
 * Logs counts and alert ids only.
 */
export function createOpsJobs(deps: WorkerDeps) {
  const readiness = defineJob({
    name: 'brief-readiness',
    schema: z.looseObject({}),
    cron: '25 * * * *',
    queue: { policy: 'short', retryLimit: 1, expireInSeconds: 600 },
    handler: async () => {
      if (!deps.engineConfigured()) return { skipped: 'engine_unconfigured' };
      const br = deps.briefReadiness();
      const now = new Date();
      const { open, toEmail, resolved } = await br.run(now);
      let emailed = 0;
      if (toEmail.length > 0) {
        const to = await br.recipients();
        if (to.length === 0) workerLog.warn(`[brief-readiness] no staff recipients; ${toEmail.length} alert(s) not emailed`);
        else {
          for (const alert of toEmail) {
            // PII-free failure reasons (error class names only: messages may carry addresses or vendor bodies).
            const errors = new Set<string>();
            for (const addr of to) {
              try {
                await br.send(addr, alert);
              } catch (err) {
                errors.add(err instanceof Error ? err.name : typeof err);
              }
            }
            if (errors.size === 0) {
              await markOpsAlertEmailed(deps.serviceDb(), alert.id, now);
              emailed++;
            } else workerLog.error({ alertId: alert.id, errors: [...errors] }, '[brief-readiness] staff email failed');
          }
        }
      }
      const out = { open: open.length, emailed, resolved };
      workerLog.info(`[brief-readiness] ${JSON.stringify(out)}`);
      return out;
    },
  });
  return { readiness };
}
