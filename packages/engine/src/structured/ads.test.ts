import { ad, detectedChange, stageRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { metaPageUrl } from '@cs/collectors';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const now = day(30);
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', url: metaPageUrl('99'), capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', url: metaPageUrl('99'), capturedAt: day(7) });
});

const metaAd = (externalId: string, over: Partial<typeof ad.$inferInsert> = {}) =>
  dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId, advertiserId: '99', text: `Ad ${externalId}: AC tune-up $79`, isActive: true, startedAt: day(5), ...over });

describe('diffVendorCapture — ads', () => {
  it('treats the first capture of a page as a silent baseline', async () => {
    await metaAd('A0', { firstCaptureId: cap0 });
    const r = await diffVendorCapture({ db: dbs.service }, cap0, { now });
    expect(r).toEqual({ ran: true, result: { baseline: true, changeIds: [] } });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('groups ads started and stopped in a capture into one change each', async () => {
    await metaAd('NEW', { firstCaptureId: cap1, lastCaptureId: cap1 });
    await metaAd('OLDCREATIVE', { firstCaptureId: cap1, startedAt: day(-200) }); // old creative newly in view: not news
    await metaAd('BORN_DEAD', { firstCaptureId: cap1, isActive: false }); // first seen already inactive
    await metaAd('ENDED', { firstCaptureId: cap0, isActive: false, endedCaptureId: cap1 });
    const r = await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(r.ran && r.result.changeIds).toHaveLength(2);
    const rows = (await dbs.service.select().from(detectedChange)).sort((a, b) => a.kind.localeCompare(b.kind));
    expect(rows.map((c) => [c.kind, c.blockKey, c.source, c.beforeCaptureId, c.afterCaptureId])).toEqual([
      ['added', 'ads:meta:started', 'meta_ads', cap0, cap1],
      ['removed', 'ads:meta:stopped', 'meta_ads', cap0, cap1],
    ]);
    expect(rows[0]?.details).toMatchObject({ changeType: 'ad_started', count: 1, pageId: '99', items: [{ id: 'NEW', label: 'Ad NEW: AC tune-up $79' }] });
    expect(rows[0]?.afterText).toBe('Ad NEW: AC tune-up $79');
    expect(rows[1]?.details).toMatchObject({ changeType: 'ad_stopped', count: 1, items: [{ id: 'ENDED' }] });
    expect(rows[1]?.beforeText).toBe('Ad ENDED: AC tune-up $79');
  });

  it('compares each Meta page with its own history (a new page starts as a baseline)', async () => {
    const page77 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', url: metaPageUrl('77'), capturedAt: day(8) });
    await metaAd('P77', { advertiserId: '77', firstCaptureId: page77 });
    expect(await diffVendorCapture({ db: dbs.service }, page77, { now })).toEqual({ ran: true, result: { baseline: true, changeIds: [] } });
  });

  it('refuses to diff a capture younger than the settle delay, without claiming it', async () => {
    const r = await diffVendorCapture({ db: dbs.service }, cap1, { now: new Date(day(7).getTime() + 5 * 60_000) });
    expect(r).toEqual({ ran: false });
    expect(await dbs.service.select().from(stageRun)).toEqual([]);
  });

  it('is idempotent', async () => {
    await metaAd('NEW', { firstCaptureId: cap1 });
    await diffVendorCapture({ db: dbs.service }, cap1, { now });
    expect(await diffVendorCapture({ db: dbs.service }, cap1, { now })).toEqual({ ran: false });
    expect(await dbs.service.select().from(detectedChange)).toHaveLength(1);
  });
});
