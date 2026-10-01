import { competitor, type Db, vendorTask } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { scrubReviewerIdentity } from '../evidence/privacy';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import type { DataForSeoClient, DfsTask } from '../vendors/dataforseo';
import { isDfsOk, isRetryableDfsCode, VendorError } from '../vendors/dataforseo';
import { upsertReviews } from './upsert';

export type VendorTaskRow = typeof vendorTask.$inferSelect;
const scope = { agencyId: null, clientId: null };

/** Shared poll loop for async DataForSEO endpoints: tasks_ready → task_get for our pending tasks. */
export async function collectReadyTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  kind: 'google_reviews' | 'google_jobs',
  readyPath: string,
  getPath: (id: string) => string,
  handle: (task: DfsTask, vt: VendorTaskRow) => Promise<void>,
): Promise<{ collected: number; failed: number }> {
  const [ready] = await deps.dfs.get(readyPath, scope);
  const readyIds = (ready?.result ?? []).map((r) => (r as { id?: unknown }).id).filter((id): id is string => typeof id === 'string');

  let collected = 0;
  let failed = 0;
  if (readyIds.length > 0) {
    const pending = await deps.db.select().from(vendorTask).where(and(eq(vendorTask.kind, kind), eq(vendorTask.status, 'pending'), inArray(vendorTask.externalTaskId, readyIds)));
    for (const vt of pending) {
      try {
        const [task] = await deps.dfs.get(getPath(vt.externalTaskId), scope);
        if (!task) throw new VendorError('dataforseo', null, 'empty task', false);
        if (!isDfsOk(task.statusCode)) throw new VendorError('dataforseo', task.statusCode, task.statusMessage, isRetryableDfsCode(task.statusCode));
        await handle(task, vt);
        await deps.db.update(vendorTask).set({ status: 'done', completedAt: sql`now()` }).where(eq(vendorTask.id, vt.id));
        collected++;
      } catch (err) {
        // A retryable vendor error (rate limit, 50xxx, network) leaves the task pending: it is
        // still in tasks_ready, so the next poll fetches it again (the 48h expiry below still
        // bounds it). Anything else marks it failed.
        if (err instanceof VendorError && err.retryable) {
          console.warn(`[vendor-poll] ${kind} task ${vt.externalTaskId}: retryable vendor error (${err.code ?? 'n/a'} ${err.message}); left pending`);
          continue;
        }
        await deps.db.update(vendorTask).set({ status: 'failed', error: String(err instanceof Error ? err.message : err).slice(0, 500), completedAt: sql`now()` }).where(eq(vendorTask.id, vt.id));
        failed++;
      }
    }
  }

  // Expire stragglers *after* collecting: a task that only just turned ready (e.g. at hour 49) must
  // still be fetched above, not marked failed before we ever checked tasks_ready for it.
  await deps.db
    .update(vendorTask)
    .set({ status: 'failed', error: 'not ready after 48h', completedAt: sql`now()` })
    .where(and(eq(vendorTask.kind, kind), eq(vendorTask.status, 'pending'), lt(vendorTask.postedAt, sql`now() - interval '48 hours'`)));

  return { collected, failed };
}

export async function collectReadyReviews(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; salt: string }): Promise<{ collected: number; failed: number; reviews: number }> {
  let reviews = 0;
  const r = await collectReadyTasks(
    deps,
    'google_reviews',
    '/business_data/google/reviews/tasks_ready',
    (id) => `/business_data/google/reviews/task_get/${id}`,
    async (task, vt) => {
      // Privacy at ingest (spec §4.5): the stored raw-vendor evidence must never carry reviewer
      // identity (name, profile URL, photo) or unredacted contact info — scrub before it is
      // gzipped and persisted. Parsed review rows still come from the raw `task.result` items
      // below; upsertReviews does its own hashing/redaction independently.
      // The business's own name words are never treated as reviewer-name words (e.g. "Texas Homeowner"
      // reviewing "Aire Serv of Central Texas"): pass the competitor name; the scrubber also picks up
      // the result-level `title`.
      const [comp] = await deps.db.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, vt.competitorId)).limit(1);
      const result0 = task.result[0] as { items?: unknown[]; title?: unknown } | undefined;
      const businessNames = [comp?.name, typeof result0?.title === 'string' ? result0.title : null];
      const { captureId } = await recordVendorCapture(deps, {
        competitorId: vt.competitorId, source: 'google_reviews', collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok',
        payload: scrubReviewerIdentity(task.result, deps.salt, businessNames),
      });
      const items = result0?.items ?? [];
      reviews += (await upsertReviews(deps.db, vt.competitorId, captureId, items, deps.salt, new Date(), businessNames)).upserted;
    },
  );
  return { ...r, reviews };
}
