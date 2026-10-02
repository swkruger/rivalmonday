import { ad, capture } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/errors';
import { collectGoogleAds, GOOGLE_UNSEEN_DAYS, googleAdsCaptureUrl, normalizeGoogleAd } from './google';

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
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    expect(r).toEqual({ status: 'ok', ads: 1, dropped: 0, ended: 0 });
    expect(dfs.calls[0]?.body).toEqual([{ target: 'smithhvac.example', location_code: 2840, depth: 40 }]);
    expect((await dbs.service.select().from(ad)).map((a) => [a.platform, a.externalId])).toEqual([['google', 'c1']]);
  });

  it('skips competitors without a domain', async () => {
    expect(await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs: fakeDfs(() => []) }, { id: IDS.competitorX, domain: null, name: 'Smith HVAC' })).toEqual({ status: 'skipped' });
  });

  it('records vendor errors as captures', async () => {
    const dfs = fakeDfs(() => {
      throw new VendorError('dataforseo', 40100, 'not authorized', false);
    });
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    expect(r).toEqual({ status: 'vendor_error' });
  });

  it('records a vendor_error capture (never an empty ok capture) when the task itself failed inside an OK envelope', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { statusCode: 40400, statusMessage: 'Not Found.' })]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    expect(r).toEqual({ status: 'vendor_error' });
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(cap).toMatchObject({ status: 'vendor_error', error: '40400 Not Found.' });
    expect(await dbs.service.select().from(ad)).toHaveLength(0);
  });

  it('records a vendor_error capture when the envelope is OK but no task comes back', async () => {
    const dfs = fakeDfs(() => []);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    expect(r).toEqual({ status: 'vendor_error' });
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(cap).toMatchObject({ status: 'vendor_error', error: 'empty task' });
    expect(await dbs.service.select().from(ad)).toHaveLength(0);
  });

  it('keeps only creatives whose advertiser matches the competitor name (live ads_search fixture)', async () => {
    const result = JSON.parse(readFileSync(fileURLToPath(new URL('../../test/fixtures/vendors/dfs-ads-search-live.json', import.meta.url)), 'utf8'));
    const dfs = fakeDfs(() => [dfsTask(result)]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // Competitor X is renamed to the live brand so the fixture's advertiser names apply.
      const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'aireserv.com', name: 'Aire Serv' });
      expect(r).toEqual({ status: 'ok', ads: 2, dropped: 1, ended: 0 });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('dropped 1 of 3'));
    } finally {
      log.mockRestore();
    }
    const rows = await dbs.service.select().from(ad);
    expect(rows.map((a) => a.advertiserId).sort()).toEqual(['AR09867956064303972353', 'AR11447192921745391617']);
    expect(rows.some((a) => a.advertiserId === 'AR16418047126489006081')).toBe(false); // "Mr Rooter of Sioux Falls"
  });
});

describe('google ads attribution and activity (Phase 3b)', () => {
  it('queries pinned advertiser ids instead of the domain and keeps only their creatives', async () => {
    const other = { ...item('c9', '2026-09-29 00:00:00 +00:00'), advertiser_id: 'AR9' };
    const dfs = fakeDfs(() => [dfsTask([{ items: [item('c1', '2026-09-29 00:00:00 +00:00'), other] }])]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC', googleAdvertiserIds: ['AR1'] });
    expect(r).toMatchObject({ status: 'ok', ads: 1, dropped: 1 });
    expect(dfs.calls[0]?.body?.[0]).toEqual({ advertiser_ids: ['AR1'], location_code: 2840, depth: 120 });
  });

  it('collects pinned advertisers even when the competitor has no domain', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    expect(await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: null, name: 'Smith HVAC', googleAdvertiserIds: ['AR1'] })).toMatchObject({ status: 'ok' });
  });

  it('ends a creative we have not seen for GOOGLE_UNSEEN_DAYS and records the capture that ended it', async () => {
    const stale = new Date(Date.now() - (GOOGLE_UNSEEN_DAYS + 1) * 86_400_000);
    await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'google', externalId: 'gone', isActive: true, lastSeenAt: stale });
    const dfs = fakeDfs(() => [dfsTask([{ items: [item('c1', '2026-09-29 00:00:00 +00:00')] }])]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    expect(r).toMatchObject({ status: 'ok', ended: 1 });
    const [gone] = await dbs.service.select().from(ad).where(eq(ad.externalId, 'gone'));
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.source, 'google_ads'));
    expect(gone).toMatchObject({ isActive: false, endedCaptureId: cap!.id, endedAt: stale });
  });

  it('records the request identity as the capture url so a change of query mode starts a new baseline', async () => {
    expect(googleAdsCaptureUrl(['AR2', 'AR1'], 'smithhvac.example')).toBe('google-ads:advertisers=AR1,AR2');
    expect(googleAdsCaptureUrl([], 'smithhvac.example')).toBe('google-ads:domain=smithhvac.example');
    const store = createMemoryStore();
    await collectGoogleAds({ db: dbs.service, store, dfs: fakeDfs(() => [dfsTask([{ items: [] }])]) }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    await collectGoogleAds({ db: dbs.service, store, dfs: fakeDfs(() => [dfsTask([{ items: [] }])]) }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC', googleAdvertiserIds: ['AR2', 'AR1'] });
    await collectGoogleAds({ db: dbs.service, store, dfs: fakeDfs(() => []) }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC', googleAdvertiserIds: ['AR1'] });
    const caps = await dbs.service.select().from(capture).where(eq(capture.source, 'google_ads'));
    expect(caps.map((c) => [c.status, c.url]).sort()).toEqual([
      ['ok', 'google-ads:advertisers=AR1,AR2'],
      ['ok', 'google-ads:domain=smithhvac.example'],
      ['vendor_error', 'google-ads:advertisers=AR1'],
    ]);
  });

  it('when pinned, silently ends active ads of other advertisers and only ends pinned ones after GOOGLE_UNSEEN_DAYS', async () => {
    const stale = new Date(Date.now() - (GOOGLE_UNSEEN_DAYS + 1) * 86_400_000);
    const fresh = new Date(Date.now() - 86_400_000);
    await dbs.service.insert(ad).values([
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'domainOld', advertiserId: 'AR9', isActive: true, lastSeenAt: stale },
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'domainFresh', advertiserId: null, isActive: true, lastSeenAt: fresh },
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'pinnedGone', advertiserId: 'AR1', isActive: true, lastSeenAt: stale },
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'pinnedRecent', advertiserId: 'AR1', isActive: true, lastSeenAt: fresh },
    ]);
    const dfs = fakeDfs(() => [dfsTask([{ items: [item('c1', '2026-09-29 00:00:00 +00:00')] }])]);
    const r = await collectGoogleAds({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC', googleAdvertiserIds: ['AR1'] });
    expect(r).toMatchObject({ status: 'ok', ended: 1, retired: 2 });
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.source, 'google_ads'));
    const rows = new Map((await dbs.service.select().from(ad)).map((a) => [a.externalId, a]));
    expect(rows.get('pinnedGone')).toMatchObject({ isActive: false, endedCaptureId: cap!.id, endedAt: stale });
    expect(rows.get('pinnedRecent')).toMatchObject({ isActive: true, endedCaptureId: null });
    expect(rows.get('domainOld')).toMatchObject({ isActive: false, endedCaptureId: null, endedAt: stale });
    expect(rows.get('domainFresh')).toMatchObject({ isActive: false, endedCaptureId: null, endedAt: fresh });
    expect(rows.get('c1')).toMatchObject({ isActive: true });
  });
});
