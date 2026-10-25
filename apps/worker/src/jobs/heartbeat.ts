import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { defineJob, type JobDefinition } from '../jobs';
import { healthState } from '../health';
import { workerLog } from '../log';

export interface HeartbeatDeps {
  /** `ensureQueueGrants` on the worker's own queue connection. */
  ensureGrants(): Promise<void>;
  /** Connections in use / allowed on the service database (`pg_stat_activity`, `max_connections`). */
  sample(): Promise<{ dbConnections: number; dbMaxConnections: number }>;
}

/**
 * Every 5 minutes: marks the worker alive, retries the cs_web queue grants (7c2; `/healthz` is 503 while they fail) and
 * returns a resource sample as the job output (read by the rehearsal report). A failing sample never fails the beat
 * (its two fields are then `null`). Grants going from ok/unknown to failed send one Sentry event; repeats only log.
 */
export function createHeartbeatJob(deps: HeartbeatDeps): JobDefinition<Record<string, unknown>> {
  return defineJob({
    name: 'system-heartbeat',
    schema: z.looseObject({}),
    cron: '*/5 * * * *',
    handler: async () => {
      let queueGrants: 'ok' | 'failed' = 'ok';
      try {
        await deps.ensureGrants();
      } catch (err) {
        queueGrants = 'failed';
        if (healthState.queueGrantsOk !== false) Sentry.captureException(err);
        workerLog.error({ err }, 'queue grants for cs_web failed; web enqueues will be refused');
      }
      healthState.queueGrantsOk = queueGrants === 'ok';
      healthState.lastHeartbeatAt = new Date();
      let db: { dbConnections: number | null; dbMaxConnections: number | null } = { dbConnections: null, dbMaxConnections: null };
      try {
        db = await deps.sample();
      } catch (err) {
        workerLog.warn({ err }, 'heartbeat connection sample failed');
      }
      const rssMb = Math.round(process.memoryUsage().rss / 1_048_576);
      workerLog.info({ queueGrants, rssMb, ...db }, 'heartbeat');
      return { queueGrants, rssMb, ...db };
    },
  });
}
