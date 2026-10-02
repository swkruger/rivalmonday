import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export const ENGINE_SWEEP_LIMIT = 100;

/**
 * Engine stage jobs must never retry themselves: runStage marks a run 'failed' and rethrows, so a
 * pg-boss retry re-claims and re-fails the same stage_run attempts budget back to back. The
 * engine-sweep cron is the only retry path (packages/engine/src/sweep.ts backs off exponentially
 * per stage_run.attempts), which spaces retries out instead of burning MAX_STAGE_ATTEMPTS in minutes.
 */
export const ENGINE_STAGE_QUEUE = { retryLimit: 0 } as const;

export function createEngineJobs(
  deps: WorkerDeps,
  queue: { enqueueDiff(captureId: string): Promise<void>; enqueueTag(changeId: string): Promise<void>; enqueueScore(eventId: string): Promise<void> },
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
      for (const id of w.tag) await queue.enqueueTag(id);
      for (const id of w.score) await queue.enqueueScore(id);
      if (w.diff.length + w.tag.length + w.score.length > 0) console.log(`[engine-sweep] enqueued diff ${w.diff.length}, tag ${w.tag.length}, score ${w.score.length}`);
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
  return { sweep, diff, tag, score };
}
