import { type Db, vendorTask } from '@cs/db';
import { type DataForSeoClient, DFS_US, isDfsOk } from '../vendors/dataforseo';

export async function postJobTasks(deps: { db: Db; dfs: DataForSeoClient }, competitors: { id: string; name: string }[]): Promise<{ posted: number }> {
  let posted = 0;
  for (let i = 0; i < competitors.length; i += 100) {
    const batch = competitors.slice(i, i + 100);
    const tasks = await deps.dfs.post('/serp/google/jobs/task_post', batch.map((c) => ({ keyword: c.name, ...DFS_US, depth: 20, tag: c.id })), { agencyId: null, clientId: null });
    const rows = tasks
      .map((t, idx) => ({ t, c: batch[idx] }))
      .filter(({ t, c }) => c && isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_jobs', externalTaskId: t.id, competitorId: (c as { id: string }).id }));
    if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
    posted += rows.length;
  }
  return { posted };
}
