import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

const BATCH = new Set(['reviews', 'jobs']);

export function createVendorJobs(
  deps: WorkerDeps,
  queue: { enqueueCollect(p: { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' }): Promise<void>; enqueueRankScan(clientId: string): Promise<void> },
) {
  let warnedUnconfigured = false;
  const schedule = defineJob({
    name: 'vendor-schedule', schema: z.looseObject({}), cron: '*/30 * * * *',
    handler: async () => {
      if (!deps.vendorsConfigured()) {
        if (!warnedUnconfigured) {
          warnedUnconfigured = true;
          console.log('[vendor-schedule] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; skipping vendor source claiming');
        }
        return;
      }
      const due = await deps.claimDueSources(500);
      const batch = due.filter((d) => BATCH.has(d.source)) as { competitorId: string; source: 'reviews' | 'jobs' }[];
      if (batch.length > 0) await deps.postBatchTasks(batch);
      for (const d of due) if (!BATCH.has(d.source)) await queue.enqueueCollect(d as { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' });
    },
  });
  const collect = defineJob({
    name: 'vendor-collect',
    schema: z.object({ competitorId: z.uuid(), source: z.enum(['gbp', 'ads_google', 'ads_meta']) }),
    handler: async ({ competitorId, source }) => {
      console.log(`[vendor-collect] ${competitorId} ${source} → ${JSON.stringify(await deps.runSource(competitorId, source))}`);
    },
  });
  const poll = defineJob({
    name: 'vendor-poll', schema: z.looseObject({}), cron: '*/10 * * * *',
    handler: async () => {
      const r = await deps.pollVendorTasks();
      if (r.reviews.collected + r.jobs.collected > 0) console.log(`[vendor-poll] ${JSON.stringify(r)}`);
    },
  });
  const rankSchedule = defineJob({
    name: 'rank-schedule', schema: z.looseObject({}), cron: '0 6 1 * *',
    handler: async () => {
      for (const id of await deps.listRankClients()) await queue.enqueueRankScan(id);
    },
  });
  const rankScan = defineJob({
    name: 'rank-scan', schema: z.object({ clientId: z.uuid() }),
    handler: async ({ clientId }) => {
      console.log(`[rank-scan] ${clientId} → ${JSON.stringify(await deps.scanRankings(clientId))}`);
    },
  });
  const suggest = defineJob({
    name: 'suggest-competitors', schema: z.object({ clientId: z.uuid() }),
    handler: async ({ clientId }) => {
      console.log(`[suggest-competitors] ${clientId} → ${JSON.stringify(await deps.suggestCompetitors(clientId))}`);
    },
  });
  return { schedule, collect, poll, rankSchedule, rankScan, suggest };
}
