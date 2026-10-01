import { type Db, vendorTask } from '@cs/db';
import { type DataForSeoClient, DFS_US, isDfsOk } from '../vendors/dataforseo';

export async function postReviewTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  competitors: { id: string; placeId: string | null; cid: string | null; backfill?: boolean }[],
): Promise<{ posted: number; postedIds: string[] }> {
  const eligible = competitors.filter((c) => c.placeId || c.cid);
  let posted = 0;
  const postedIds: string[] = [];
  for (let i = 0; i < eligible.length; i += 100) {
    const batch = eligible.slice(i, i + 100);
    const tasks = await deps.dfs.post(
      '/business_data/google/reviews/task_post',
      batch.map((c) => ({ ...(c.placeId ? { place_id: c.placeId } : { cid: c.cid }), ...DFS_US, depth: c.backfill ? 700 : 100, sort_by: 'newest', tag: c.id })),
      { agencyId: null, clientId: null },
    );
    const rows = tasks
      .map((t, idx) => ({ t, c: batch[idx] }))
      .filter(({ t, c }) => c && isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: t.id, competitorId: (c as { id: string }).id }));
    if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
    posted += rows.length;
    postedIds.push(...rows.map((r) => r.competitorId));
  }
  return { posted, postedIds };
}
