import { type Db, vendorTask } from '@cs/db';
import { type DataForSeoClient, type DfsTask, DFS_US, isDfsOk } from '../vendors/dataforseo';
import { VendorError } from '../vendors/errors';

export async function postJobTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  competitors: { id: string; name: string }[],
  chunkSize = 100,
): Promise<{ posted: number; postedIds: string[]; failedIds: string[] }> {
  const eligible = competitors.filter((c) => c.name.trim().length > 0);
  let posted = 0;
  const postedIds: string[] = [];
  const failedIds: string[] = [];
  for (let i = 0; i < eligible.length; i += chunkSize) {
    const batch = eligible.slice(i, i + chunkSize);
    let tasks: DfsTask[];
    try {
      tasks = await deps.dfs.post('/serp/google/jobs/task_post', batch.map((c) => ({ keyword: c.name, ...DFS_US, depth: 20, tag: c.id })), { agencyId: null, clientId: null });
    } catch (err) {
      // See postReviewTasks: a whole-chunk failure must not lose earlier chunks' postedIds.
      if (!(err instanceof VendorError)) throw err;
      failedIds.push(...batch.map((c) => c.id));
      continue;
    }
    const rows = tasks
      .map((t, idx) => ({ t, c: batch[idx] }))
      .filter(({ t, c }) => c && isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_jobs', externalTaskId: t.id, competitorId: (c as { id: string }).id }));
    if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
    posted += rows.length;
    postedIds.push(...rows.map((r) => r.competitorId));
  }
  return { posted, postedIds, failedIds };
}
