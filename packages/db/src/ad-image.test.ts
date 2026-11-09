import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { ad, adImage, capture, competitor, evidence, pricePoint, trackedPage } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const A1 = { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] };
const B1 = { agencyId: IDS.agencyB, clientScope: [IDS.clientB1] };
const OTHER = '00000000-0000-4000-8000-0000000000f8';
const AD_1 = '00000000-0000-4000-8000-0000000000a1';
const AD_2 = '00000000-0000-4000-8000-0000000000a2';
const CAP = '00000000-0000-4000-8000-0000000000c1';
const PAGE = '00000000-0000-4000-8000-0000000000b1';
const EV = '00000000-0000-4000-8000-0000000000e1';

const row = (o: Partial<typeof adImage.$inferInsert> = {}): typeof adImage.$inferInsert => ({
  adId: AD_1, competitorId: IDS.competitorX, sourceUrlSha: 'url-sha-1', ...o,
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(competitor).values({ id: OTHER, name: 'Hidden Co' });
  await dbs.service.insert(ad).values([
    { id: AD_1, competitorId: IDS.competitorX, platform: 'meta', externalId: 'x1' },
    { id: AD_2, competitorId: OTHER, platform: 'meta', externalId: 'o1' },
  ]);
  await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, source: 'ad_image', status: 'ok', collectorVersion: 'ad-image/1' });
  await dbs.service.insert(evidence).values({ id: EV, captureId: CAP, kind: 'image', objectKey: 'k/img.webp', sha256: 'img-sha', bytes: 10, contentType: 'image/webp' });
});

describe('ad_image', () => {
  it('ad_image rejects shows_person with evidence_id', async () => {
    expect(await errorText(dbs.service.insert(adImage).values(row({ status: 'triaged', showsPerson: true, evidenceId: EV })))).toContain('ad_image_person_unstored');
    await dbs.service.insert(adImage).values(row({ status: 'triaged', showsPerson: true }));
    await dbs.service.insert(adImage).values(row({ sourceUrlSha: 'url-sha-2', status: 'triaged', showsPerson: false, evidenceId: EV }));
  });

  it('rejected needs a fail_reason and only rejected has one', async () => {
    await expect(dbs.service.insert(adImage).values(row({ status: 'rejected' }))).rejects.toThrow();
    await expect(dbs.service.insert(adImage).values(row({ status: 'pending', failReason: 'expired' }))).rejects.toThrow();
    await expect(dbs.service.insert(adImage).values(row({ status: 'rejected', failReason: 'nope' as never }))).rejects.toThrow();
    await dbs.service.insert(adImage).values(row({ status: 'rejected', failReason: 'too_large' }));
  });

  it('unique (ad_id, source_url_sha)', async () => {
    await dbs.service.insert(adImage).values(row());
    await expect(dbs.service.insert(adImage).values(row())).rejects.toThrow();
    await dbs.service.insert(adImage).values(row({ sourceUrlSha: 'url-sha-2' }));
  });

  it('price_point rejects ad_image_id without ad_id', async () => {
    const [img] = await dbs.service.insert(adImage).values(row()).returning({ id: adImage.id });
    const base = {
      competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 59, unit: 'USD', qualifier: 'exact' as const,
      raw: '$59', context: 'ad', firstSeenAt: new Date(), lastSeenAt: new Date(), firstCaptureId: CAP, lastCaptureId: CAP,
    };
    await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/p', pageType: 'pricing', source: 'manual', cadence: 'daily' });
    // a page-sourced price with an image id: only the has_ad check can refuse it
    expect(await errorText(dbs.service.insert(pricePoint).values({ ...base, trackedPageId: PAGE, adImageId: img!.id }))).toContain('price_point_ad_image_has_ad');
    await dbs.service.insert(pricePoint).values({ ...base, adId: AD_1, adImageId: img!.id });
  });

  it('app_user sees ad_image only for visible competitors and cannot insert', async () => {
    await dbs.service.insert(adImage).values([row(), row({ adId: AD_2, competitorId: OTHER })]);
    await withTenant(dbs.app, A1, async (tx) => {
      expect((await tx.select().from(adImage)).map((r) => r.competitorId)).toEqual([IDS.competitorX]);
    });
    await withTenant(dbs.app, B1, async (tx) => {
      expect((await tx.select().from(adImage)).map((r) => r.competitorId)).toEqual([IDS.competitorX]);
    });
    await expect(withTenant(dbs.app, A1, (tx) => tx.insert(adImage).values(row({ sourceUrlSha: 'zz' })))).rejects.toThrow();
  });
});
