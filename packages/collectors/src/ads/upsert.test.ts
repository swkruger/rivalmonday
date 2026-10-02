import { ad, capture } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedAd } from './upsert';
import { upsertAds } from './upsert';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const CAP1 = '00000000-0000-4000-8000-0000000000c1';
const CAP2 = '00000000-0000-4000-8000-0000000000c2';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(capture).values([
    { id: CAP1, competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1' },
    { id: CAP2, competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1' },
  ]);
});

const makeAd = (over: Partial<NormalizedAd> = {}): NormalizedAd => ({
  externalId: 'c1',
  advertiserId: 'AR1',
  format: 'image',
  title: 'Smith HVAC',
  text: null,
  mediaUrls: ['https://img/c1.png'],
  landingUrl: null,
  publisherPlatforms: ['google'],
  startedAt: new Date('2026-09-01T00:00:00Z'),
  endedAt: null,
  isActive: true,
  ...over,
});

describe('upsertAds', () => {
  it('collapses a duplicate externalId within one batch instead of erroring (ON CONFLICT DO UPDATE cannot affect a row twice)', async () => {
    const result = await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd(), makeAd({ title: 'Smith HVAC 2' })], { markMissingInactive: false });
    expect(result).toEqual({ upserted: 1, deactivated: 0 });
    const rows = await dbs.service.select().from(ad);
    expect(rows).toHaveLength(1);
  });

  it('keeps firstSeenAt/firstCaptureId and advances lastSeenAt/lastCaptureId on a second upsert', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd()], { markMissingInactive: false, now: new Date('2026-09-01T00:00:00Z') });
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP2, [makeAd()], { markMissingInactive: false, now: new Date('2026-09-10T00:00:00Z') });
    const rows = await dbs.service.select().from(ad);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstCaptureId: CAP1, lastCaptureId: CAP2 });
    expect(rows[0]?.firstSeenAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(rows[0]?.lastSeenAt.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('marks ads of that competitor/platform missing from the batch inactive when markMissingInactive is set', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd({ externalId: 'c1' }), makeAd({ externalId: 'c2' })], {
      markMissingInactive: false,
      now: new Date('2026-09-01T00:00:00Z'),
    });
    const result = await upsertAds(dbs.service, IDS.competitorX, 'google', CAP2, [makeAd({ externalId: 'c1' })], {
      markMissingInactive: true,
      now: new Date('2026-09-10T00:00:00Z'),
    });
    expect(result).toEqual({ upserted: 1, deactivated: 1 });
    const rows = await dbs.service.select().from(ad);
    const c1 = rows.find((r) => r.externalId === 'c1');
    const c2 = rows.find((r) => r.externalId === 'c2');
    expect(c1).toMatchObject({ isActive: true });
    expect(c2).toMatchObject({ isActive: false });
    expect(c2?.endedAt?.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('adopts a legacy null-advertiser row into the page that lists it, so other pages no longer end it', async () => {
    await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', advertiserId: null, isActive: true });
    await upsertAds(dbs.service, IDS.competitorX, 'meta', CAP1, [makeAd({ externalId: 'm1', advertiserId: '99', publisherPlatforms: ['facebook'] })], { markMissingInactive: true, advertiserId: '99' });
    const [adopted] = await dbs.service.select().from(ad).where(eq(ad.externalId, 'm1'));
    expect(adopted).toMatchObject({ advertiserId: '99', isActive: true });
    const r = await upsertAds(dbs.service, IDS.competitorX, 'meta', CAP2, [], { markMissingInactive: true, advertiserId: '77' });
    expect(r.deactivated).toBe(0);
    // An already-known advertiser is never overwritten.
    await upsertAds(dbs.service, IDS.competitorX, 'meta', CAP2, [makeAd({ externalId: 'm1', advertiserId: '55' })], { markMissingInactive: false });
    expect((await dbs.service.select().from(ad).where(eq(ad.externalId, 'm1')))[0]?.advertiserId).toBe('99');
  });

  it("never updates another competitor's ad row when a creative id collides across competitors", async () => {
    await dbs.service.insert(ad).values({
      competitorId: IDS.competitorY,
      platform: 'google',
      externalId: 'c9',
      advertiserId: null,
      format: null,
      title: null,
      text: null,
      mediaUrls: [],
      landingUrl: null,
      publisherPlatforms: [],
      startedAt: null,
      endedAt: null,
      isActive: true,
      firstSeenAt: new Date('2026-09-01T00:00:00Z'),
      lastSeenAt: new Date('2026-09-01T00:00:00Z'),
      firstCaptureId: CAP1,
      lastCaptureId: CAP1,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await upsertAds(dbs.service, IDS.competitorX, 'google', CAP2, [makeAd({ externalId: 'c9' })], {
      markMissingInactive: false,
      now: new Date('2026-09-10T00:00:00Z'),
    });
    expect(result).toEqual({ upserted: 0, deactivated: 0 });
    const [row] = await dbs.service.select().from(ad).where(eq(ad.externalId, 'c9'));
    expect(row).toMatchObject({ competitorId: IDS.competitorY, lastCaptureId: CAP1 });
    expect(row?.lastSeenAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('records the capture that ended an ad, scoped to one advertiser when asked', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'meta', CAP1, [makeAd({ externalId: 'p1a', advertiserId: 'P1' }), makeAd({ externalId: 'p2a', advertiserId: 'P2' })], { markMissingInactive: false });
    const r = await upsertAds(dbs.service, IDS.competitorX, 'meta', CAP2, [], { markMissingInactive: true, advertiserId: 'P1' });
    expect(r.deactivated).toBe(1);
    const rows = await dbs.service.select().from(ad);
    expect(rows.find((a) => a.externalId === 'p1a')).toMatchObject({ isActive: false, endedCaptureId: CAP2 });
    expect(rows.find((a) => a.externalId === 'p2a')).toMatchObject({ isActive: true, endedCaptureId: null });
  });

  it('sets ended_capture_id when a seen ad turns inactive, and clears it when the ad comes back', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd()], { markMissingInactive: false });
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP2, [makeAd({ isActive: false, endedAt: new Date('2026-09-10T00:00:00Z') })], { markMissingInactive: false });
    expect((await dbs.service.select().from(ad))[0]).toMatchObject({ isActive: false, endedCaptureId: CAP2 });
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd()], { markMissingInactive: false });
    expect((await dbs.service.select().from(ad))[0]).toMatchObject({ isActive: true, endedCaptureId: null });
  });

  it('never marks an ad that was first seen inactive as ended by that capture', async () => {
    await upsertAds(dbs.service, IDS.competitorX, 'google', CAP1, [makeAd({ isActive: false })], { markMissingInactive: false });
    expect((await dbs.service.select().from(ad))[0]).toMatchObject({ isActive: false, endedCaptureId: null });
  });
});
