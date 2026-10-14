import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, openTestDbs, seedPlatformCostServices, truncateAll } from '../test/helpers';
import { platformCostItem, platformCostService, platformCostSnapshot } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedPlatformCostServices(dbs.owner);
});

const item = (over: Partial<typeof platformCostItem.$inferInsert> = {}) => ({
  name: 'Domain',
  kind: 'recurring' as const,
  amountUsd: '12.00',
  period: 'yearly' as const,
  startsOn: '2026-01-01',
  createdBy: 'u1',
  ...over,
});

describe('platform cost tables', () => {
  it('app role cannot select any of the three tables', async () => {
    for (const t of [platformCostService, platformCostSnapshot, platformCostItem]) {
      expect(await errorText(dbs.app.select().from(t))).toMatch(/permission denied/);
    }
  });

  it('service role sees the 6 seeded services with default billing URLs', async () => {
    const rows = await dbs.service.select().from(platformCostService).orderBy(platformCostService.service);
    expect(rows.map((r) => r.service)).toEqual(['anthropic', 'apify', 'dataforseo', 'neon', 'openrouter', 'scrapecreators']);
    expect(rows.every((r) => r.billingUrl?.startsWith('https://') && r.enabled && r.warnDays === 7)).toBe(true);
    expect(rows.find((r) => r.service === 'neon')?.billingUrl).toBe('https://console.neon.tech/app/billing');
  });

  it('seedPlatformCostServices is idempotent', async () => {
    await seedPlatformCostServices(dbs.owner);
    expect(await dbs.service.select().from(platformCostService)).toHaveLength(6);
  });

  it('item checks reject a recurring cost without a period, a one-off with ends_on, and ends_on < starts_on', async () => {
    expect(await errorText(dbs.service.insert(platformCostItem).values(item({ period: null })))).toMatch(/platform_cost_item_period_ck/);
    expect(await errorText(dbs.service.insert(platformCostItem).values(item({ kind: 'one_off', period: null, endsOn: '2026-02-01' })))).toMatch(/platform_cost_item_oneoff_ck/);
    expect(await errorText(dbs.service.insert(platformCostItem).values(item({ endsOn: '2025-12-31' })))).toMatch(/platform_cost_item_dates_ck/);
    await dbs.service.insert(platformCostItem).values(item());
    await dbs.service.insert(platformCostItem).values(item({ kind: 'one_off', period: null }));
    expect(await dbs.service.select().from(platformCostItem)).toHaveLength(2);
  });

  it('snapshot rejects unknown services and over-long errors', async () => {
    const snap = (over: object = {}) => ({ service: 'neon' as const, status: 'ok' as const, kind: 'usage' as const, ...over });
    expect(await errorText(dbs.service.insert(platformCostSnapshot).values(snap({ service: 'nope' })))).toMatch(/foreign key|platform_cost_snapshot/);
    expect(await errorText(dbs.service.insert(platformCostSnapshot).values(snap({ error: 'x'.repeat(121) })))).toMatch(/platform_cost_snapshot_error_check/);
    await dbs.service.insert(platformCostSnapshot).values(snap({ amountUsd: '1.5' }));
    expect(await dbs.service.select().from(platformCostSnapshot).where(eq(platformCostSnapshot.service, 'neon'))).toHaveLength(1);
  });
});
