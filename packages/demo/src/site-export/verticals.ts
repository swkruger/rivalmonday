import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/** The site's vertical list: reviewed, unmerged catalogue verticals except `generic`, name-sorted. */
export async function exportSiteVerticals(db: Db): Promise<{ id: string; name: string }[]> {
  const list = [...(await db.execute(sql`select id, name from vertical where status = 'reviewed' and merged_into is null and id <> 'generic'`))] as { id: string; name: string }[];
  return list.map((v) => ({ id: v.id, name: v.name })).sort((a, b) => a.name.localeCompare(b.name));
}
