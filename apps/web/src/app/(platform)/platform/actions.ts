'use server';
import { requireOperatorContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import type { ActivityPage } from './_components/activity-feed';

/** "Show more": reads the next activity page through the registered tool (refusal → "Not found"). */
export async function loadMoreActivity(cursor: string): Promise<ActivityPage> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool<ActivityPage>(ctx, 'list_platform_activity', { cursor: String(cursor).slice(0, 200), limit: 20 });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
