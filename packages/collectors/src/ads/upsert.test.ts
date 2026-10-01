import { ad, capture } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
});
