import { pricePoint } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { PRICED_SERVICES, round9, seedPricing } from './pricing';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;
let rows: (typeof pricePoint.$inferSelect)[];

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedPricing(ctx);
  rows = await dbs.owner.select().from(pricePoint);
});

const series = () => {
  const m = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) m.set(`${r.competitorId}:${r.serviceId}`, [...(m.get(`${r.competitorId}:${r.serviceId}`) ?? []), r]);
  return m;
};

describe('seedPricing', () => {
  it('prices 8 services over 12 months for every competitor except the one left empty on purpose', () => {
    const s = series();
    expect(new Set(rows.map((r) => r.serviceId))).toEqual(new Set([...PRICED_SERVICES.hvac, ...PRICED_SERVICES.plumbing].map((x) => x.id)));
    expect(s.size).toBe(9 * 4);
    expect(rows.some((r) => r.competitorId === ctx.ids.noData.pricing)).toBe(false);
    const oldest = Math.min(...rows.map((r) => r.firstSeenAt.getTime()));
    expect(ctx.clock.now.getTime() - oldest).toBeGreaterThan(355 * 86_400_000);
  });

  it('has rises and cuts, and one price that is no longer seen', () => {
    let rises = 0;
    let cuts = 0;
    let gone = 0;
    for (const spans of series().values()) {
      const sorted = [...spans].sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime());
      for (let i = 1; i < sorted.length; i++) (sorted[i]!.amount > sorted[i - 1]!.amount ? rises++ : sorted[i]!.amount < sorted[i - 1]!.amount && cuts++);
      if (sorted.every((x) => x.endedAt !== null)) gone++;
      expect(sorted.filter((x) => x.endedAt === null).length).toBeLessThanOrEqual(1);
      for (const x of sorted) expect(x.lastSeenAt.getTime()).toBeGreaterThanOrEqual(x.firstSeenAt.getTime());
    }
    expect(rises).toBeGreaterThan(0);
    expect(cuts).toBeGreaterThan(0);
    expect(gone).toBe(1);
  });

  it('matches the AC tune-up cut in the changes feed: Hill Country Air & Heat now shows a $79 promo', () => {
    const hill = ctx.ids.competitors.loneStar[0]!.id;
    const open = rows.find((r) => r.competitorId === hill && r.serviceId === 'ac_tune_up' && r.endedAt === null)!;
    expect([open.amount, open.promo]).toEqual([79, true]);
  });

  it('matches the two promo events: $59 AC tune-up (competitor 1) and $199 duct cleaning (competitor 0)', () => {
    const open = (idx: number, service: string) =>
      rows.find((r) => r.competitorId === ctx.ids.competitors.loneStar[idx]!.id && r.serviceId === service && r.endedAt === null)!;
    const tune = open(1, 'ac_tune_up');
    const duct = open(0, 'duct_cleaning');
    expect([tune.amount, tune.promo]).toEqual([59, true]);
    expect([duct.amount, duct.promo]).toEqual([199, true]);
    expect(Math.abs(ctx.clock.now.getTime() - tune.firstSeenAt.getTime() - 2.25 * 86_400_000)).toBeLessThan(1000);
    expect(Math.abs(ctx.clock.now.getTime() - duct.firstSeenAt.getTime() - 25.25 * 86_400_000)).toBeLessThan(1000);
  });

  it('rounds prices to end in 9', () => {
    expect([round9(89), round9(101), round9(1320)]).toEqual([89, 99, 1319]);
  });
});
