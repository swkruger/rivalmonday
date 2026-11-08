import { observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { backfillMetaPageObservations, pageReadingFrom, writeMetaPageObservation } from './meta-page';
import { metaPageUrl } from './meta';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const fixture = (f: string) => JSON.parse(readFileSync(new URL(`../../test/fixtures/vendors/${f}`, import.meta.url), 'utf8')) as unknown;
const apifyItems = fixture('apify-meta-ad.json') as unknown[];
const scItems = (fixture('scrapecreators-meta-ads.json') as { results: unknown[] }).results;

describe('pageReadingFrom', () => {
  it('apify item yields likes and page name', () => {
    expect(pageReadingFrom(apifyItems, '193259817196676')).toEqual({ pageId: '193259817196676', pageName: 'Main Street Plumbing', likes: 73 });
  });
  it('scrapecreators item yields the same reading shape', () => {
    expect(pageReadingFrom(scItems, '1825453601028298')).toEqual({ pageId: '1825453601028298', pageName: 'Aire Serv of Granbury', likes: 367 });
  });
  it('no numeric like count → null', () => {
    expect(pageReadingFrom([{ page_id: '1', snapshot: { page_like_count: '5' } }, {}, null], '1')).toBeNull();
    expect(pageReadingFrom(apifyItems, 'other-page')).toBeNull();
    expect(pageReadingFrom([], '1')).toBeNull();
  });
});

describe('writeMetaPageObservation', () => {
  it('second write for the same capture is a no-op', async () => {
    const store = createMemoryStore();
    const { captureId, capturedAt } = await recordVendorCapture({ db: dbs.service, store }, { competitorId: IDS.competitorX, source: 'meta_ads', collectorVersion: 'meta/1', status: 'ok', payload: { vendor: 'x', items: [] } });
    const r = { pageId: '99', pageName: 'P', likes: 10 };
    await writeMetaPageObservation(dbs.service, { competitorId: IDS.competitorX, captureId, capturedAt }, r);
    await writeMetaPageObservation(dbs.service, { competitorId: IDS.competitorX, captureId, capturedAt }, { ...r, likes: 11 });
    const rows = await dbs.service.select().from(observation);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'meta_page', key: '99', data: r, observedAt: capturedAt });
  });
});

describe('backfillMetaPageObservations', () => {
  it('writes from stored payloads, is idempotent and skips unreadable captures', async () => {
    const store = createMemoryStore();
    const deps = { db: dbs.service, store };
    const rec = (pageId: string, items: unknown[]) => recordVendorCapture(deps, { competitorId: IDS.competitorX, source: 'meta_ads', collectorVersion: 'meta/1', url: metaPageUrl(pageId), status: 'ok', payload: { vendor: 'apify', items, truncated: false } });
    await rec('193259817196676', apifyItems);
    await rec('555', []);
    expect(await backfillMetaPageObservations(deps, { dryRun: true })).toEqual({ captures: 2, written: 1, skipped: 1 });
    expect(await dbs.service.select().from(observation)).toHaveLength(0);
    expect(await backfillMetaPageObservations(deps)).toEqual({ captures: 2, written: 1, skipped: 1 });
    await backfillMetaPageObservations(deps);
    expect(await dbs.service.select().from(observation)).toHaveLength(1);
  });
});
