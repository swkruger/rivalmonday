import type PgBoss from 'pg-boss';
import type { z } from 'zod';

/**
 * Per-queue pg-boss options (retry/expiry/retention/policy). pg-boss 10 copies these onto every
 * job sent to the queue (job option ?? queue option ?? constructor default), so cron-scheduled and
 * enqueued jobs both get them. Use `expireInSeconds` — pg-boss 10's createQueue/updateQueue read
 * only that field (expireInMinutes/Hours are silently dropped there).
 * `policy: 'short'` keeps at most one *queued* job per `singletonKey` — pg-boss 10 applies a
 * policy change to existing queues through `updateQueue`, so redeploys pick it up.
 */
export type JobQueueOptions = Pick<PgBoss.Queue, 'retryLimit' | 'retryDelay' | 'retryBackoff' | 'expireInSeconds' | 'retentionMinutes' | 'policy'>;

export interface JobDefinition<T> {
  name: string;
  schema: z.ZodType<T>;
  handler: (data: T) => Promise<void>;
  /** Optional cron schedule (UTC), registered with pg-boss schedule(). */
  cron?: string;
  /** Optional queue options; when omitted the pg-boss defaults apply (retryLimit 2, 15-minute expiry). */
  queue?: JobQueueOptions;
}

export function defineJob<T>(def: JobDefinition<T>): JobDefinition<T> {
  return def;
}
