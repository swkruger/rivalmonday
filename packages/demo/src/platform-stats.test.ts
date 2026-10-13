import { agencyDailyStat } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { buildPlatformStats, PLATFORM_STAT_DAYS, seedPlatformStats } from './platform-stats';
import { Rng } from './random';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;
let rows: (typeof agencyDailyStat.$inferSelect)[];

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedPlatformStats(ctx);
  rows = await dbs.owner.select().from(agencyDailyStat).where(eq(agencyDailyStat.agencyId, ctx.ids.agencyId));
});

describe('seedPlatformStats', () => {
  it('writes 90 distinct days per agency, ending yesterday', () => {
    expect(rows).toHaveLength(PLATFORM_STAT_DAYS);
    expect(new Set(rows.map((r) => r.day)).size).toBe(PLATFORM_STAT_DAYS);
    const days = rows.map((r) => r.day).sort();
    expect(days.at(-1)).toBe(new Date(ctx.clock.now.getTime() - 86_400_000).toISOString().slice(0, 10));
  });

  it('trends upward and measures every figure (no NULLs)', () => {
    const byDay = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(byDay.slice(-14).map((r) => r.wau!))).toBeGreaterThan(avg(byDay.slice(0, 14).map((r) => r.wau!)));
    expect(avg(byDay.slice(-14).map((r) => Number(r.spendUsd)))).toBeGreaterThan(avg(byDay.slice(0, 14).map((r) => Number(r.spendUsd))));
    expect(byDay.at(-1)!.clientsActive).toBeGreaterThan(byDay[0]!.clientsActive!);
    for (const r of rows) for (const k of ['clientsActive', 'wau', 'askQuestions', 'mcpCalls', 'spendUsd', 'lastActivityAt'] as const) expect(r[k]).not.toBeNull();
  });
});

describe('buildPlatformStats', () => {
  it('is deterministic for the same stream and day', () => {
    const a = buildPlatformStats('00000000-0000-0000-0000-000000000001', '2026-10-13', new Rng(7));
    const b = buildPlatformStats('00000000-0000-0000-0000-000000000001', '2026-10-13', new Rng(7));
    expect(a).toEqual(b);
    expect(a).toHaveLength(90);
  });
});
