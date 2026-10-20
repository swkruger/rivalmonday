import { runDailyStats } from '@cs/tools';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/**
 * Phase 8a spec § Nightly job: one agency_daily_stat row per agency for yesterday (UTC), 02:00 UTC. Idempotent upsert;
 * `{ day }` recomputes one day, `{ backfill: true }` (automatic when the table is empty) fills up to 400 days of history.
 * The computation lives in @cs/tools (P2) so the demo seed shares it; this job only orchestrates.
 */
export function createPlatformStatsJobs(deps: WorkerDeps) {
  const daily = defineJob({
    name: 'platform-daily-stats',
    schema: z.looseObject({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), backfill: z.boolean().optional() }),
    cron: '0 2 * * *',
    // A backfill over many agencies can outlast pg-boss's 15-minute default expiry.
    queue: { expireInSeconds: 3600 },
    handler: async (data) => {
      const r = await runDailyStats(deps.serviceDb(), { day: data.day, backfill: data.backfill });
      workerLog.info(`[platform-daily-stats] ${JSON.stringify(r)}`);
      return r;
    },
  });
  return { daily };
}
