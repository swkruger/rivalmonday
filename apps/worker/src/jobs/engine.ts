import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export const ENGINE_SWEEP_LIMIT = 100;

/**
 * Engine stage jobs must never retry themselves: runStage marks a run 'failed' and rethrows, so a
 * pg-boss retry re-claims and re-fails the same stage_run attempts budget back to back. The
 * engine-sweep cron is the only retry path (packages/engine/src/sweep.ts backs off exponentially
 * per stage_run.attempts). The 'short' policy plus a per-subject singletonKey (main.ts) keeps a
 * subject from being queued twice when a sweep runs while its job is still waiting (3a carry-over).
 */
export const ENGINE_STAGE_QUEUE = { retryLimit: 0, policy: 'short' } as const;

export function createEngineJobs(
  deps: WorkerDeps,
  queue: {
    enqueueDiff(captureId: string): Promise<void>;
    enqueueRankDiff(scanId: string): Promise<void>;
    enqueueTag(changeId: string): Promise<void>;
    enqueueScore(eventId: string): Promise<void>;
    enqueueReview(reviewId: string): Promise<void>;
    enqueuePrice(captureId: string): Promise<void>;
  },
) {
  let warnedUnconfigured = false;
  // Safety net: stages are idempotent (stage_run / event_score keys), so re-enqueueing found work is harmless.
  const sweep = defineJob({
    name: 'engine-sweep', schema: z.looseObject({}), cron: '*/5 * * * *',
    handler: async () => {
      if (!deps.engineConfigured()) {
        if (!warnedUnconfigured) {
          warnedUnconfigured = true;
          console.log('[engine-sweep] OPENROUTER_API_KEY not set; skipping');
        }
        return;
      }
      const w = await deps.findEngineWork(ENGINE_SWEEP_LIMIT);
      for (const id of w.diff) await queue.enqueueDiff(id);
      for (const id of w.rankDiff) await queue.enqueueRankDiff(id);
      for (const id of w.tag) await queue.enqueueTag(id);
      for (const id of w.score) await queue.enqueueScore(id);
      for (const id of w.reviews) await queue.enqueueReview(id);
      for (const id of w.prices) await queue.enqueuePrice(id);
      if (w.diff.length + w.rankDiff.length + w.tag.length + w.score.length + w.reviews.length + w.prices.length > 0)
        console.log(
          `[engine-sweep] enqueued diff ${w.diff.length}, rank ${w.rankDiff.length}, tag ${w.tag.length}, score ${w.score.length}, review ${w.reviews.length}, price ${w.prices.length}`,
        );
    },
  });
  const diff = defineJob({
    name: 'engine-diff', schema: z.object({ captureId: z.uuid() }), queue: ENGINE_STAGE_QUEUE,
    handler: async ({ captureId }) => {
      const r = await deps.diffCapture(captureId);
      for (const id of r.changeIds) await queue.enqueueTag(id);
      if (r.ran) console.log(`[engine-diff] ${captureId} → ${r.changeIds.length} change(s)`);
    },
  });
  const tag = defineJob({
    name: 'engine-tag', schema: z.object({ changeId: z.uuid() }), queue: ENGINE_STAGE_QUEUE,
    handler: async ({ changeId }) => {
      const r = await deps.tagChange(changeId);
      if (r.eventId) await queue.enqueueScore(r.eventId);
    },
  });
  const score = defineJob({
    name: 'engine-score', schema: z.object({ eventId: z.uuid() }), queue: ENGINE_STAGE_QUEUE,
    handler: async ({ eventId }) => {
      console.log(`[engine-score] ${eventId} → ${JSON.stringify(await deps.scoreEvent(eventId))}`);
    },
  });
  const rankDiff = defineJob({
    name: 'engine-rank-diff', schema: z.object({ scanId: z.uuid() }), queue: ENGINE_STAGE_QUEUE,
    handler: async ({ scanId }) => {
      const r = await deps.diffRankScan(scanId);
      for (const id of r.changeIds) await queue.enqueueTag(id);
      if (r.ran) console.log(`[engine-rank-diff] ${scanId} → ${r.changeIds.length} change(s)`);
    },
  });
  const review = defineJob({
    name: 'engine-review', schema: z.object({ reviewId: z.uuid() }), queue: ENGINE_STAGE_QUEUE,
    handler: async ({ reviewId }) => {
      await deps.analyzeReview(reviewId);
    },
  });
  const price = defineJob({
    name: 'engine-price', schema: z.object({ captureId: z.uuid() }), queue: ENGINE_STAGE_QUEUE,
    handler: async ({ captureId }) => {
      const r = await deps.extractPrices(captureId);
      if (r.ran && r.points + r.ended > 0) console.log(`[engine-price] ${captureId} → ${r.points} new, ${r.ended} ended`);
    },
  });
  return { sweep, diff, rankDiff, tag, score, review, price };
}
