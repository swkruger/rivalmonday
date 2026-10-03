import type { Ai } from '@cs/ai';
import { type Db, modelBatch } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import { applyThemeProposal, THEME_BATCH_PURPOSE, type ThemeDiscoveryContext } from '../reviews/discovery';

/** Anthropic's batch limit is 24 h; a batch still unfinished after this is given up (its reviews are offered again). */
export const BATCH_MAX_AGE_HOURS = 26;
const PLATFORM = { agencyId: null, clientId: null } as const;

export interface BatchCollectResult {
  checked: number;
  ended: number;
  applied: number;
  failed: number;
  expired: number;
}

/** Polls every submitted batch; applies ended ones. A poll error leaves the batch submitted for the next poll. */
export async function collectModelBatches(deps: { db: Db; ai: Ai }, opts: { now?: Date } = {}): Promise<BatchCollectResult> {
  const now = opts.now ?? new Date();
  const r: BatchCollectResult = { checked: 0, ended: 0, applied: 0, failed: 0, expired: 0 };
  const open = await deps.db.select().from(modelBatch).where(eq(modelBatch.status, 'submitted')).orderBy(asc(modelBatch.createdAt));
  for (const b of open) {
    r.checked++;
    try {
      const res = await deps.ai.collectBatch(b.task, b.providerBatchId, PLATFORM);
      if (res.status === 'in_progress') {
        if (now.getTime() - b.createdAt.getTime() > BATCH_MAX_AGE_HOURS * 3_600_000) {
          await deps.db.update(modelBatch).set({ status: 'failed', error: `expired: unfinished after ${BATCH_MAX_AGE_HOURS} h`, endedAt: now }).where(eq(modelBatch.id, b.id));
          r.expired++;
        }
        continue;
      }
      for (const item of res.results) {
        const ctx = b.items[item.customId] as ThemeDiscoveryContext | undefined;
        if (!item.ok || !ctx || b.purpose !== THEME_BATCH_PURPOSE) {
          r.failed++;
          console.warn(`[model-batch] ${b.providerBatchId}/${item.customId}: ${item.ok ? 'no context for this request' : item.error}`);
          continue;
        }
        if ('status' in (await applyThemeProposal(deps.db, ctx, item.text))) r.applied++;
      }
      await deps.db.update(modelBatch).set({ status: 'ended', endedAt: now }).where(eq(modelBatch.id, b.id));
      r.ended++;
    } catch (err) {
      r.failed++;
      console.error(`[model-batch] polling ${b.providerBatchId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return r;
}
