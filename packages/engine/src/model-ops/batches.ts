import type { Ai } from '@cs/ai';
import { type Db, modelBatch } from '@cs/db';
import { and, asc, eq, lt } from 'drizzle-orm';
import { applyTopicProposal, THEME_BATCH_PURPOSE, type TopicDiscoveryContext } from '../reviews/discovery';

/** Anthropic's batch limit is 24 h; a batch still unfinished after this is given up (its reviews are offered again). */
export const BATCH_MAX_AGE_HOURS = 26;
/** A `pending` row (written before the provider submit) older than this never got its provider id: it is closed as failed. */
export const BATCH_PENDING_STALE_MINUTES = 60;
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
  const swept = await deps.db
    .update(modelBatch)
    .set({ status: 'failed', error: 'orphaned before submit (check provider)', endedAt: now })
    .where(and(eq(modelBatch.status, 'pending'), lt(modelBatch.createdAt, new Date(now.getTime() - BATCH_PENDING_STALE_MINUTES * 60_000))))
    .returning({ id: modelBatch.id });
  r.expired += swept.length;
  const open = await deps.db.select().from(modelBatch).where(eq(modelBatch.status, 'submitted')).orderBy(asc(modelBatch.createdAt));
  for (const b of open) {
    const providerId = b.providerBatchId;
    if (!providerId) continue; // a submitted row always has one; defensive for the nullable column
    r.checked++;
    try {
      const res = await deps.ai.collectBatch(
        b.task, providerId, PLATFORM,
        b.purpose === THEME_BATCH_PURPOSE ? (id) => ({ verticalId: id }) : undefined,
      );
      if (res.status === 'in_progress') {
        if (now.getTime() - b.createdAt.getTime() > BATCH_MAX_AGE_HOURS * 3_600_000) {
          await deps.db.update(modelBatch).set({ status: 'failed', error: `expired: unfinished after ${BATCH_MAX_AGE_HOURS} h`, endedAt: now }).where(eq(modelBatch.id, b.id));
          r.expired++;
        }
        continue;
      }
      // One transaction per batch: lock the row, apply only while it is still 'submitted' (idempotent against a concurrent collector or a retry), then close it.
      const applied = await deps.db.transaction(async (tx) => {
        const [cur] = await tx.select({ status: modelBatch.status }).from(modelBatch).where(eq(modelBatch.id, b.id)).for('update');
        if (cur?.status !== 'submitted') return null;
        let ok = 0;
        let bad = 0;
        for (const item of res.results) {
          const ctx = b.items[item.customId] as TopicDiscoveryContext | undefined;
          if (!item.ok || !ctx || b.purpose !== THEME_BATCH_PURPOSE) {
            bad++;
            console.warn(`[model-batch] ${providerId}/${item.customId}: ${item.ok ? 'no context for this request' : item.error}`);
            continue;
          }
          if ('status' in (await applyTopicProposal(tx, ctx, item.text))) ok++;
        }
        await tx.update(modelBatch).set({ status: 'ended', endedAt: now }).where(eq(modelBatch.id, b.id));
        return { ok, bad };
      });
      if (!applied) continue;
      r.applied += applied.ok;
      r.failed += applied.bad;
      r.ended++;
    } catch (err) {
      r.failed++;
      console.error(`[model-batch] polling ${providerId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return r;
}
