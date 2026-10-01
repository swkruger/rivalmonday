import { ad, capture } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/errors';
import { collectGoogleAds, normalizeGoogleAd } from './google';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const now = new Date('2026-09-30T00:00:00Z');
const item = (creative: string, lastShown: string) => ({
  type: 'ads_search',
  advertiser_id: 'AR1',
  creative_id: creative,
  title: 'Smith HVAC',
  url: 'https://adstransparency.google.com/x',
  format: 'image',
  preview_image: { url: `https://img/${creative}.png` },
  first_shown: '2026-09-01 00:00:00 +00:00',
  last_shown: lastShown,
});

describe('google ads', () => {
  it('normalises creatives and derives activity from last_shown', () => {
    expect(normalizeGoogleAd(item('c1', '2026-09-29 00:00:00 +00:00'), now)).toMatchObject({
      externalId: 'c1',
      isActive: true,
      endedAt: null,
      mediaUrls: ['https://img/c1.png'],
      format: 'image',
    });
    expect(normalizeGoogleAd(item('c2', '2026-08-01 00:00:00 +00:00'), now)).toMatchObject({
      isActive: false,
      endedAt: new Date('2026-08-01T00:00:00Z'),
    });
    expect(normalizeGoogleAd({ type: 'ads_search' }, now)).toBeNull();
  });

  it('collects by domain and upserts ads', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [item('c1', '2026-09-29 00:00:00 +00:00')] }])]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    expect(r).toEqual({ status: 'ok', ads: 1 });
    expect(dfs.calls[0]?.body).toEqual([{ target: 'smithhvac.example', location_code: 2840, depth: 40 }]);
    expect((await dbs.service.select().from(ad)).map((a) => [a.platform, a.externalId])).toEqual([['google', 'c1']]);
  });

  it('skips competitors without a domain', async () => {
    expect(await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs: fakeDfs(() => []) }, { id: IDS.competitorX, domain: null })).toEqual({ status: 'skipped' });
  });

  it('records vendor errors as captures', async () => {
    const dfs = fakeDfs(() => {
      throw new VendorError('dataforseo', 40100, 'not authorized', false);
    });
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    expect(r).toEqual({ status: 'vendor_error' });
  });

  it('records a vendor_error capture (never an empty ok capture) when the task itself failed inside an OK envelope', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { statusCode: 40400, statusMessage: 'Not Found.' })]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    expect(r).toEqual({ status: 'vendor_error' });
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(cap).toMatchObject({ status: 'vendor_error', error: '40400 Not Found.' });
    expect(await dbs.service.select().from(ad)).toHaveLength(0);
  });

  it('records a vendor_error capture when the envelope is OK but no task comes back', async () => {
    const dfs = fakeDfs(() => []);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    expect(r).toEqual({ status: 'vendor_error' });
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(cap).toMatchObject({ status: 'vendor_error', error: 'empty task' });
    expect(await dbs.service.select().from(ad)).toHaveLength(0);
  });
});
