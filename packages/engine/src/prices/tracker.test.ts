import { metaPageUrl } from '@cs/collectors';
import { ad, adImage, capture, evidence, gbpPost, pricePoint } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedPage } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import { dailySeries, priceHistory, priceMatrix } from './tracker';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
let pageId: string;
let capId: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  pageId = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/pricing', 'pricing');
  const [c] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, trackedPageId: pageId, source: 'web', status: 'ok', collectorVersion: 'web/1' }).returning({ id: capture.id });
  capId = c!.id;
  const base = { competitorId: IDS.competitorX, trackedPageId: pageId, verticalId: 'hvac_plumbing', unit: 'USD', raw: '$', context: 'c', firstCaptureId: capId, lastCaptureId: capId };
  await dbs.service.insert(pricePoint).values([
    { ...base, serviceId: 'ac_tune_up', amount: 99, qualifier: 'exact', firstSeenAt: day(0), lastSeenAt: day(1), endedAt: day(2), endedCaptureId: capId },
    { ...base, serviceId: 'ac_tune_up', amount: 89, qualifier: 'exact', promo: true, firstSeenAt: day(2), lastSeenAt: day(3) },
    { ...base, serviceId: 'water_heater', amount: 1299, qualifier: 'from', firstSeenAt: day(0), lastSeenAt: day(3) },
  ]);
});

describe('pricing tracker', () => {
  it('priceMatrix: current prices per competitor × service, services in pack order', async () => {
    const m = await priceMatrix({ db: dbs.service, packs }, IDS.clientA1);
    expect(m.services).toEqual([{ id: 'ac_tune_up', name: 'AC tune-up' }, { id: 'water_heater', name: 'Water heater repair & install' }]);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({ competitorId: IDS.competitorX, name: 'Smith HVAC' });
    expect(m.rows[0]!.cells.ac_tune_up).toEqual([{ amount: 89, unit: 'USD', qualifier: 'exact', promo: true, since: day(2), pageUrl: 'https://smithhvac.example/pricing', source: 'web', evidenceIds: [] }]);
    expect(m.rows[0]!.cells.water_heater?.[0]).toMatchObject({ amount: 1299, qualifier: 'from' });
  });

  it('priceHistory + dailySeries: spans and a daily min/max line', async () => {
    const spans = await priceHistory(dbs.service, { competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', since: day(-10) });
    expect(spans.map((s) => [s.amount, s.from, s.to])).toEqual([[99, day(0), day(2)], [89, day(2), null]]);
    expect(dailySeries(spans, day(0), day(3))).toEqual([
      { date: '2026-10-01', min: 99, max: 99 },
      { date: '2026-10-02', min: 99, max: 99 },
      { date: '2026-10-03', min: 89, max: 99 },
      { date: '2026-10-04', min: 89, max: 89 },
    ]);
  });

  it('priceMatrix lists an ad price with source meta_ad and its Ad Library url; priceHistory ignores it', async () => {
    const [a] = await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', advertiserId: '777', text: '$49 tune-up' }).returning({ id: ad.id });
    await dbs.service.insert(pricePoint).values({ competitorId: IDS.competitorX, adId: a!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 49, unit: 'USD', qualifier: 'exact', raw: '$49', context: 'c', firstCaptureId: capId, lastCaptureId: capId, firstSeenAt: day(2), lastSeenAt: day(3) });
    const m = await priceMatrix({ db: dbs.service, packs }, IDS.clientA1);
    expect(m.rows[0]!.cells.ac_tune_up).toEqual([
      { amount: 49, unit: 'USD', qualifier: 'exact', promo: false, since: day(2), pageUrl: metaPageUrl('777'), source: 'meta_ad', evidenceIds: [] },
      expect.objectContaining({ amount: 89, source: 'web' }),
    ]);
    const spans = await priceHistory(dbs.service, { competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', since: day(-10) });
    expect(spans.map((x) => x.amount)).toEqual([99, 89]);
  });

  it('post price: source gbp_post with the post url, not in history', async () => {
    const [g] = await dbs.service.insert(gbpPost).values({ competitorId: IDS.competitorX, externalId: 'gp1', url: 'https://posts.example/gp1', firstCaptureId: capId, lastCaptureId: capId, firstSeenAt: day(2), lastSeenAt: day(3) }).returning({ id: gbpPost.id });
    await dbs.service.insert(pricePoint).values({ competitorId: IDS.competitorX, gbpPostId: g!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 29, unit: 'USD', qualifier: 'exact', promo: true, raw: '$29', context: 'c', firstCaptureId: capId, lastCaptureId: capId, firstSeenAt: day(2), lastSeenAt: day(3) });
    const m = await priceMatrix({ db: dbs.service, packs }, IDS.clientA1);
    expect(m.rows[0]!.cells.ac_tune_up![0]).toEqual({ amount: 29, unit: 'USD', qualifier: 'exact', promo: true, since: day(2), pageUrl: 'https://posts.example/gp1', source: 'gbp_post', evidenceIds: [] });
    const spans = await priceHistory(dbs.service, { competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', since: day(-10) });
    expect(spans.map((x) => x.amount)).toEqual([99, 89]);
  });

  it('image price: source ad_image, evidenceIds [id], Google library pageUrl, not in history', async () => {
    const [a] = await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'google', externalId: 'g1', advertiserId: 'AR9', title: 'Tune-up' }).returning({ id: ad.id });
    const [ic] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: 'ad_image', status: 'ok', collectorVersion: 't' }).returning({ id: capture.id });
    const [ev] = await dbs.service.insert(evidence).values({ captureId: ic!.id, kind: 'image', objectKey: 'k/img.webp', sha256: 'x', bytes: 1, contentType: 'image/webp' }).returning({ id: evidence.id });
    const [img] = await dbs.service.insert(adImage).values({ adId: a!.id, competitorId: IDS.competitorX, sourceUrlSha: 's1', status: 'triaged', evidenceId: ev!.id }).returning({ id: adImage.id });
    await dbs.service.insert(pricePoint).values({ competitorId: IDS.competitorX, adId: a!.id, adImageId: img!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 39, unit: 'USD', qualifier: 'exact', raw: '$39', context: 'c', firstCaptureId: ic!.id, lastCaptureId: ic!.id, firstSeenAt: day(2), lastSeenAt: day(3) });
    const m = await priceMatrix({ db: dbs.service, packs }, IDS.clientA1);
    expect(m.rows[0]!.cells.ac_tune_up![0]).toEqual({
      amount: 39, unit: 'USD', qualifier: 'exact', promo: false, since: day(2), source: 'ad_image', evidenceIds: [ev!.id],
      pageUrl: 'https://adstransparency.google.com/advertiser/AR9/creative/g1',
    });
    const spans = await priceHistory(dbs.service, { competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', since: day(-10) });
    expect(spans.map((x) => x.amount)).toEqual([99, 89]);
  });
});
