import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

const BATCH = new Set(['reviews', 'jobs']);

/**
 * Paid, long-running jobs run exactly once: a rank scan is up to ~245 DataForSEO calls and must
 * never be re-run by pg-boss's default retry (retryLimit 2) or killed by its default 15-minute
 * expiry (an expired job is retried too) — either would duplicate paid calls and snapshots.
 */
export const SINGLE_SHOT_QUEUE = { retryLimit: 0, expireInSeconds: 3 * 60 * 60 } as const;

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
      const linked = await deps.ensureSelfCompetitors();
      if (linked > 0) console.log(`[vendor-schedule] linked ${linked} client(s) to their own business for review benchmarking`);
      const due = await deps.claimDueSources(500);
      const batch = due.filter((d) => BATCH.has(d.source)) as { competitorId: string; source: 'reviews' | 'jobs' }[];
      // Enqueue the synchronous collects first: if the batch task_post below throws, those
      // collect jobs are already queued and unaffected by the failure handled below.
      for (const d of due) if (!BATCH.has(d.source)) await queue.enqueueCollect(d as { competitorId: string; source: 'gbp' | 'ads_google' | 'ads_meta' });
      if (batch.length > 0) {
        try {
          // deps.postBatchTasks already resolves each source's status itself (posted/skipped, or
          // released back to due-now as post_failed on a VendorError — reviews and jobs
          // independently, so one failing never touches the other). Nothing here needs releasing:
          // anything already marked this tick, by definition, must not be reset.
          const { failed } = await deps.postBatchTasks(batch);
          if (failed > 0) console.warn(`[vendor-schedule] ${failed} of ${batch.length} source(s) failed to post and were released for retry`);
        } catch (err) {
          // Unexpected (non-VendorError) failure inside postBatchTasks itself, e.g. a DB error —
          // some sources in the batch may already be correctly marked; just log it.
          console.error(`[vendor-schedule] postBatchTasks failed unexpectedly for ${batch.length} source(s)`, err);
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
    name: 'rank-scan', schema: z.object({ clientId: z.uuid() }), queue: SINGLE_SHOT_QUEUE,
    handler: async ({ clientId }) => {
      console.log(`[rank-scan] ${clientId} → ${JSON.stringify(await deps.scanRankings(clientId))}`);
    },
  });
  const suggest = defineJob({
    name: 'suggest-competitors', schema: z.object({ clientId: z.uuid() }), queue: { ...SINGLE_SHOT_QUEUE, policy: 'short' },
    handler: async ({ clientId }) => {
      console.log(`[suggest-competitors] ${clientId} → ${JSON.stringify(await deps.suggestCompetitors(clientId))}`);
    },
  });
  return { schedule, collect, poll, rankSchedule, rankScan, suggest };
}
