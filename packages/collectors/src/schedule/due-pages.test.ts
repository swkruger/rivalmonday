import { trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDuePages } from './due-pages';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const base = { competitorId: IDS.competitorX, pageType: 'pricing', source: 'nav' };
  await dbs.service.insert(trackedPage).values([
    { ...base, url: 'https://s.example/due-daily', cadence: 'daily', nextDueAt: sql`now() - interval '1 minute'` },
    { ...base, url: 'https://s.example/due-weekly', cadence: 'weekly', nextDueAt: sql`now() - interval '1 hour'` },
    { ...base, url: 'https://s.example/future', cadence: 'daily', nextDueAt: sql`now() + interval '1 hour'` },
    { ...base, url: 'https://s.example/inactive', cadence: 'daily', active: false, nextDueAt: sql`now() - interval '1 hour'` },
  ]);
});

describe('claimDuePages', () => {
  it('claims only due active pages and advances their next_due_at by cadence', async () => {
    const claimed = await claimDuePages(dbs.service, 10);
    expect(claimed).toHaveLength(2);
    expect(await claimDuePages(dbs.service, 10)).toEqual([]);
    const rows = (await dbs.service.execute(sql`
      SELECT url, round(extract(epoch FROM (next_due_at - now())) / 3600) AS hours FROM tracked_page
       WHERE id = ANY(ARRAY[${sql.join(claimed.map((id) => sql`${id}`), sql`, `)}]::uuid[]) ORDER BY url`)) as unknown as { url: string; hours: string }[];
    expect(rows.map((r) => [r.url, Number(r.hours)])).toEqual([
      ['https://s.example/due-daily', 24],
      ['https://s.example/due-weekly', 168],
    ]);
  });

  it('never hands the same page to concurrent claimers', async () => {
    const [a, b] = await Promise.all([claimDuePages(dbs.service, 10), claimDuePages(dbs.service, 10)]);
    expect([...a, ...b].sort()).toHaveLength(2);
    expect(new Set([...a, ...b]).size).toBe(2);
  });

  it('respects the limit', async () => {
    expect(await claimDuePages(dbs.service, 1)).toHaveLength(1);
  });
});
