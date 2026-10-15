import { competitorSuggestion, type Db, discoveryRun, vendorTask } from '@cs/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { type DataForSeoClient, type DfsTask, DFS_US, isDfsOk, pairPostedTasks } from '../vendors/dataforseo';
import { parseDfsTimestamp } from '../vendors/dfs-time';

const DAY_MS = 86_400_000;
export const REVIEW_SAMPLE_DEPTH = 20;
export const reviewSampleTag = (runId: string, placeId: string) => `discovery:${runId}:${placeId}`;

export type ReviewSignals = { reviews30d: number | null; reviews90d: number | null; replyRate: number | null };
const NULL_REVIEWS: ReviewSignals = { reviews30d: null, reviews90d: null, replyRate: null };

/** Merges keys into the suggestions' `signals` (other keys kept). */
export async function patchSuggestionSignals(db: Db, suggestionIds: string[], patch: Record<string, unknown>): Promise<void> {
  if (suggestionIds.length === 0) return;
  await db
    .update(competitorSuggestion)
    .set({ signals: sql`${competitorSuggestion.signals} || ${JSON.stringify(patch)}::jsonb` })
    .where(inArray(competitorSuggestion.id, suggestionIds));
}

/**
 * Posts one newest-first review sample (depth 20) per shortlisted suggestion, recorded as a vendor_task with
 * `suggestion_id`. A suggestion whose task could not be posted gets its review signals set to null right away,
 * so finalising never waits for it.
 */
export async function postReviewSamples(deps: { db: Db; dfs: DataForSeoClient }, runId: string, suggestions: { id: string; placeId: string }[]): Promise<void> {
  if (suggestions.length === 0) return;
  const [run] = await deps.db.select({ agencyId: discoveryRun.agencyId, clientId: discoveryRun.clientId }).from(discoveryRun).where(eq(discoveryRun.id, runId)).limit(1);
  if (!run) throw new Error(`discovery run ${runId} not found`);
  const batch = suggestions.map((s) => ({ id: reviewSampleTag(runId, s.placeId), suggestionId: s.id, placeId: s.placeId }));
  let tasks: DfsTask[] = [];
  try {
    tasks = await deps.dfs.post(
      '/business_data/google/reviews/task_post',
      batch.map((b) => ({ place_id: b.placeId, ...DFS_US, depth: REVIEW_SAMPLE_DEPTH, sort_by: 'newest', tag: b.id })),
      { agencyId: run.agencyId, clientId: run.clientId },
    );
  } catch (err) {
    console.warn(`[discovery] run ${runId}: review sample post failed (${err instanceof Error ? err.message : String(err)})`);
  }
  const rows = pairPostedTasks(tasks, batch)
    .filter(({ t }) => isDfsOk(t.statusCode))
    .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: t.id, suggestionId: c.suggestionId }));
  if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
  const posted = new Set(rows.map((r) => r.suggestionId));
  await patchSuggestionSignals(deps.db, batch.filter((b) => !posted.has(b.suggestionId)).map((b) => b.suggestionId), NULL_REVIEWS);
}

/** Review velocity and reply rate from a newest-first sample. replyRate is null when no review falls in the last 90 days. */
export function reviewSignalsFromItems(items: unknown[], now: Date): ReviewSignals {
  let reviews30d = 0;
  let reviews90d = 0;
  let answered90d = 0;
  for (const raw of items) {
    const i = raw as { timestamp?: unknown; owner_answer?: unknown } | null;
    const at = parseDfsTimestamp(i?.timestamp);
    if (!at) continue;
    const age = now.getTime() - at.getTime();
    if (age > 90 * DAY_MS) continue;
    reviews90d++;
    if (age <= 30 * DAY_MS) reviews30d++;
    if (typeof i?.owner_answer === 'string' && i.owner_answer.trim() !== '') answered90d++;
  }
  return { reviews30d, reviews90d, replyRate: reviews90d === 0 ? null : answered90d / reviews90d };
}

/**
 * Vendor-poll branch for a suggestion-subject review task: patch its review signals (no review rows); returns its
 * run id. A late sample from an older run (echoed tag names another run) is ignored, so it can't fill a newer run's signals.
 */
export async function applyReviewSample(db: Db, suggestionId: string, task: DfsTask, now: Date): Promise<string | null> {
  const [s] = await db.select({ runId: competitorSuggestion.runId }).from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId)).limit(1);
  if (!s?.runId) return null;
  const tagRun = task.tag?.startsWith('discovery:') ? task.tag.split(':')[1] : null;
  if (tagRun && tagRun !== s.runId) return null;
  const items = (task.result[0] as { items?: unknown[] } | undefined)?.items ?? [];
  await patchSuggestionSignals(db, [suggestionId], reviewSignalsFromItems(items, now));
  return s.runId;
}
