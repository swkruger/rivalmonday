import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

const BATCH = new Set(['reviews', 'jobs']);

export function createVendorJobs(
  deps: WorkerDeps,
  queue: { enqueueCollect(p: { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' }): Promise<void>; enqueueRankScan(clientId: string): Promise<void> },
) {
  let warnedScheduleUnconfigured = false;
  let warnedPollUnconfigured = false;
  let warnedRankUnconfigured = false;
  const schedule = defineJob({
    name: 'vendor-schedule', schema: z.looseObject({}), cron: '*/30 * * * *',
    handler: async () => {
      if (!deps.vendorsConfigured()) {
        if (!warnedScheduleUnconfigured) {
          warnedScheduleUnconfigured = true;
          console.log('[vendor-schedule] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; skipping vendor source claiming');
        }
        return;
      }
      const due = await deps.claimDueSources(500);
      const batch = due.filter((d) => BATCH.has(d.source)) as { competitorId: string; source: 'reviews' | 'jobs' }[];
      // Enqueue the synchronous collects first: if the batch task_post below throws, those
      // collect jobs are already queued and unaffected by the failure handled below.
      for (const d of due) if (!BATCH.has(d.source)) await queue.enqueueCollect(d as { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' });
      if (batch.length > 0) {
        try {
          await deps.postBatchTasks(batch);
        } catch (err) {
          // A failed task_post must not silently lose a week of reviews/jobs collection for every
          // source claimDueSources already advanced next_due_at on — release them back to
          // due-now so the next tick retries instead of waiting 7 days.
          console.error(`[vendor-schedule] postBatchTasks failed for ${batch.length} source(s); releasing for retry`, err);
          await deps.releaseSources(batch, 'post_failed');
        }
      }
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
      if (!deps.vendorsConfigured()) {
        if (!warnedPollUnconfigured) {
          warnedPollUnconfigured = true;
          console.log('[vendor-poll] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; skipping');
        }
        return;
      }
      const r = await deps.pollVendorTasks();
      const reviewsCollected = 'collected' in r.reviews ? r.reviews.collected : 0;
      if (reviewsCollected + r.jobs.collected > 0) console.log(`[vendor-poll] ${JSON.stringify(r)}`);
    },
  });
  const rankSchedule = defineJob({
    name: 'rank-schedule', schema: z.looseObject({}), cron: '0 6 1 * *',
    handler: async () => {
      if (!deps.vendorsConfigured()) {
        if (!warnedRankUnconfigured) {
          warnedRankUnconfigured = true;
          console.log('[rank-schedule] DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD not set; skipping');
        }
        return;
      }
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
