import { ad } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectMetaAds, normalizeMetaAd } from './meta';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const ledger = { recordLlmCall: async () => {}, recordVendorCall: vi.fn(async () => {}) };

const apifyItem = { adArchiveID: 'A1', pageID: '99', isActive: true, startDate: 1790000000, publisherPlatform: ['FACEBOOK', 'INSTAGRAM'], snapshot: { body: { text: '$79 tune-up' }, images: [{ original_image_url: 'https://img/1.jpg' }], linkUrl: 'https://smithhvac.example/specials' } };
const scItem = { ad_archive_id: 'S1', is_active: true, start_date: 1790000000, publisher_platform: ['FACEBOOK'], snapshot: { body: { text: 'Beat the heat' }, videos: [{ video_preview_image_url: 'https://img/v.jpg' }] } };

describe('normalizeMetaAd', () => {
  it('handles both vendor casings', () => {
    expect(normalizeMetaAd(apifyItem)).toMatchObject({ externalId: 'A1', text: '$79 tune-up', mediaUrls: ['https://img/1.jpg'], landingUrl: 'https://smithhvac.example/specials', publisherPlatforms: ['FACEBOOK', 'INSTAGRAM'], isActive: true, startedAt: new Date(1790000000 * 1000) });
    expect(normalizeMetaAd(scItem)).toMatchObject({ externalId: 'S1', text: 'Beat the heat', mediaUrls: ['https://img/v.jpg'] });
    expect(normalizeMetaAd({ foo: 1 })).toBeNull();
  });
});

describe('collectMetaAds', () => {
  it('uses Apify, and marks ads that disappeared as ended', async () => {
    await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId: 'OLD', isActive: true });
    const fetch = vi.fn(async () => new Response(JSON.stringify([apifyItem]), { status: 201 }));
    const r = await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageId: '99' });
    expect(r).toMatchObject({ status: 'ok', ads: 1, deactivated: 1, vendor: 'apify' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.apify.com/v2/actors/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t');
    expect(JSON.parse(init.body as string)).toMatchObject({ urls: [{ url: expect.stringContaining('view_all_page_id=99') }], 'scrapePageAds.activeStatus': 'active', 'scrapePageAds.countryCode': 'US' });
    const rows = await dbs.service.select().from(ad);
    expect(rows.find((a) => a.externalId === 'OLD')).toMatchObject({ isActive: false });
    expect(rows.find((a) => a.externalId === 'A1')).toMatchObject({ isActive: true });
  });

  it('falls back to ScrapeCreators when Apify fails', async () => {
    const fetch = vi.fn(async (u: string) =>
      u.includes('apify') ? new Response('boom', { status: 500 }) : new Response(JSON.stringify({ success: true, results: [scItem], cursor: null }), { status: 200 }),
    );
    const r = await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, scrapeCreators: { apiKey: 'k' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageId: '99' });
    expect(r).toMatchObject({ status: 'ok', ads: 1, vendor: 'scrapecreators' });
    const scCall = fetch.mock.calls.find((c) => String(c[0]).includes('scrapecreators')) as unknown as [string, RequestInit];
    expect(scCall[0]).toContain('/v1/facebook/adLibrary/company/ads?pageId=99');
    expect((scCall[1].headers as Record<string, string>)['x-api-key']).toBe('k');
  });

  it('skips competitors without a Meta page id and reports vendor errors when all vendors fail', async () => {
    expect(await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger }, { id: IDS.competitorX, metaPageId: null })).toEqual({ status: 'skipped' });
    const fetch = vi.fn(async () => new Response('x', { status: 500 }));
    const r = await collectMetaAds({ db: dbs.service, store: createMemoryStore(), ledger, apify: { token: 't' }, fetch: fetch as unknown as typeof globalThis.fetch }, { id: IDS.competitorX, metaPageId: '99' });
    expect(r.status).toBe('vendor_error');
  });
});
