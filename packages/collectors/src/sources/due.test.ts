import { competitorSource } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDueSources, markSourceResult, releaseSources } from './due';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(competitorSource).values([
    { competitorId: IDS.competitorX, source: 'gbp', nextDueAt: sql`now() - interval '1 minute'` },
    { competitorId: IDS.competitorX, source: 'reviews', nextDueAt: sql`now() + interval '1 day'` },
    { competitorId: IDS.competitorY, source: 'gbp', active: false, nextDueAt: sql`now() - interval '1 day'` },
  ]);
});

describe('claimDueSources', () => {
  it('claims due active sources once', async () => {
    expect(await claimDueSources(dbs.service, 10)).toEqual([{ competitorId: IDS.competitorX, source: 'gbp' }]);
    expect(await claimDueSources(dbs.service, 10)).toEqual([]);
    await markSourceResult(dbs.service, IDS.competitorX, 'gbp', 'ok');
    const rows = (await dbs.service.execute(sql`SELECT last_status FROM competitor_source WHERE source = 'gbp' AND competitor_id = ${IDS.competitorX}`)) as unknown as { last_status: string }[];
    expect(rows[0]?.last_status).toBe('ok');
  });
});

describe('releaseSources', () => {
  it('resets a claimed source back to due-now and records the failure status', async () => {
    // Simulate claimDueSources's 7-day advance on a source that then failed to post.
    await dbs.service.insert(competitorSource).values([{ competitorId: IDS.competitorX, source: 'ads_meta', nextDueAt: sql`now() + interval '7 days'` }]);
    await releaseSources(dbs.service, [{ competitorId: IDS.competitorX, source: 'ads_meta' }], 'post_failed');
    const rows = (await dbs.service.execute(
      sql`SELECT (next_due_at <= now()) AS due, last_status FROM competitor_source WHERE source = 'ads_meta' AND competitor_id = ${IDS.competitorX}`,
    )) as unknown as { due: boolean; last_status: string }[];
    expect(rows[0]?.due).toBe(true);
    expect(rows[0]?.last_status).toBe('post_failed');
  });

  it('is a no-op for an empty list', async () => {
    await expect(releaseSources(dbs.service, [], 'post_failed')).resolves.toBeUndefined();
  });
});
