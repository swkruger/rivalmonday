import { platformCostItem, platformCostSnapshot } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { seedPlatformCosts } from './platform-costs';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
});

describe('seedPlatformCosts', () => {
  it('writes 14 days of two services (DataForSEO under its threshold) and three manual items, and is idempotent', async () => {
    await seedPlatformCosts(ctx);
    await seedPlatformCosts(ctx);
    const snaps = await dbs.owner.select().from(platformCostSnapshot);
    expect(snaps.filter((s) => s.service === 'openrouter')).toHaveLength(14);
    const dfs = snaps.filter((s) => s.service === 'dataforseo').sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
    expect(dfs).toHaveLength(14);
    expect(Number(dfs[0]!.amountUsd)).toBeCloseTo(8.2, 2);
    const items = await dbs.owner.select().from(platformCostItem).where(eq(platformCostItem.createdBy, 'demo-seed'));
    expect(items.map((i) => `${i.name}:${i.amountUsd}:${i.period}`).sort()).toEqual(['Namecheap domain:15.00:yearly', 'Vercel Pro:20.00:monthly', 'Worker host:7.00:monthly']);
  });
});
