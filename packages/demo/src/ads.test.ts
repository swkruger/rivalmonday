import { ad, capture } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAds } from './ads';
import { adItemIds, EVENT_SPECS } from './changes';
import { createSeedContext, type SeedContext } from './context';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedAds(ctx);
});

describe('seedAds', () => {
  it('writes about 30 Google and Meta ads, active and ended, exactly one without a title', async () => {
    const rows = await dbs.owner.select().from(ad);
    expect(rows).toHaveLength(31);
    expect(new Set(rows.map((r) => r.platform))).toEqual(new Set(['google', 'meta']));
    expect(rows.some((r) => r.isActive && r.endedAt === null)).toBe(true);
    const ended = rows.filter((r) => !r.isActive);
    expect(ended.length).toBeGreaterThan(0);
    for (const r of ended) {
      expect(r.endedAt).not.toBeNull();
      expect(r.endedAt!.getTime()).toBeGreaterThan(r.firstSeenAt.getTime());
    }
    expect(rows.filter((r) => r.title === null)).toHaveLength(1);
    for (const r of rows) expect(r.lastSeenAt.getTime()).toBeGreaterThanOrEqual(r.firstSeenAt.getTime());
  });

  it('has matching ad rows for every ad event, by external id and timing', async () => {
    const rows = await dbs.owner.select().from(ad);
    const specs = EVENT_SPECS.filter((s) => s.type === 'ad_started' || s.type === 'ad_stopped');
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      const comp = ctx.ids.competitors[spec.client][spec.comp]!;
      const platform = spec.source === 'google_ads' ? 'google' : 'meta';
      const ids = adItemIds(spec);
      expect(ids.length).toBeGreaterThan(0);
      const at = ctx.clock.daysAgo(spec.days + 0.25).getTime();
      for (const id of ids) {
        const r = rows.find((x) => x.externalId === id);
        expect(r, id).toBeDefined();
        expect(r!.competitorId).toBe(comp.id);
        expect(r!.platform).toBe(platform);
        if (spec.type === 'ad_started') expect(Math.abs(r!.firstSeenAt.getTime() - at)).toBeLessThanOrEqual(1000);
        else {
          expect(r!.isActive).toBe(false);
          expect(Math.abs(r!.endedAt!.getTime() - at)).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it('leaves one competitor with no ads and no ad checks on purpose', async () => {
    expect(await dbs.owner.select().from(ad).where(eq(ad.competitorId, ctx.ids.noData.ads))).toHaveLength(0);
    expect(await dbs.owner.select().from(capture).where(and(eq(capture.competitorId, ctx.ids.noData.ads), inArray(capture.source, ['google_ads', 'meta_ads'])))).toHaveLength(0);
  });

  it('starts each other competitor’s ad history with an ok ad capture before its first ad', async () => {
    const rows = await dbs.owner.select().from(ad);
    for (const competitorId of new Set(rows.map((r) => r.competitorId))) {
      const caps = await dbs.owner.select().from(capture).where(and(eq(capture.competitorId, competitorId), inArray(capture.source, ['google_ads', 'meta_ads']), eq(capture.status, 'ok')));
      const firstCheck = Math.min(...caps.map((c) => c.capturedAt.getTime()));
      const firstAd = Math.min(...rows.filter((r) => r.competitorId === competitorId).map((r) => r.firstSeenAt.getTime()));
      expect(firstCheck).toBeLessThan(firstAd);
    }
  });
});
