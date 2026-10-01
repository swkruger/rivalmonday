import { type Db, vendorTask } from '@cs/db';
import { type DataForSeoClient, type DfsTask, DFS_US, isDfsOk, pairPostedTasks } from '../vendors/dataforseo';
import { VendorError } from '../vendors/errors';

export async function postReviewTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  competitors: { id: string; placeId: string | null; cid: string | null; backfill?: boolean }[],
  chunkSize = 100,
): Promise<{ posted: number; postedIds: string[]; failedIds: string[] }> {
  const eligible = competitors.filter((c) => c.placeId || c.cid);
  let posted = 0;
  const postedIds: string[] = [];
  const failedIds: string[] = [];
  for (let i = 0; i < eligible.length; i += chunkSize) {
    const batch = eligible.slice(i, i + chunkSize);
    let tasks: DfsTask[];
    try {
      tasks = await deps.dfs.post(
        '/business_data/google/reviews/task_post',
        batch.map((c) => ({ ...(c.placeId ? { place_id: c.placeId } : { cid: c.cid }), ...DFS_US, depth: c.backfill ? 700 : 100, sort_by: 'newest', tag: c.id })),
        { agencyId: null, clientId: null },
      );
    } catch (err) {
      // A whole-chunk failure (rate limit exhausted, HTTP error, …) must not lose the postedIds
      // of chunks already posted earlier in this call — record this chunk as failed and keep
      // going instead of throwing out of the loop. An unexpected (non-vendor) error still throws.
      if (!(err instanceof VendorError)) throw err;
      failedIds.push(...batch.map((c) => c.id));
      continue;
    }
    // Match tasks to competitors by the echoed tag (positional only when the tag is absent).
    const rows = pairPostedTasks(tasks, batch)
      .filter(({ t }) => isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: t.id, competitorId: c.id }));
    if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
    posted += rows.length;
    postedIds.push(...rows.map((r) => r.competitorId));
  }
  return { posted, postedIds, failedIds };
}
