import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { ad, capture, competitorSource, competitorSuggestion, observation, rankSnapshot, review, vendorTask } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const CAP_X = '00000000-0000-4000-8000-0000000000c1';
const CAP_Y = '00000000-0000-4000-8000-0000000000c2';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(capture).values([
    { id: CAP_X, competitorId: IDS.competitorX, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' },
    { id: CAP_Y, competitorId: IDS.competitorY, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' },
  ]);
  await dbs.service.insert(review).values([
    { competitorId: IDS.competitorX, source: 'google', dedupeKey: 'id:1', rating: 2, text: 'slow', firstCaptureId: CAP_X },
    { competitorId: IDS.competitorY, source: 'google', dedupeKey: 'id:2', rating: 5, text: 'great', firstCaptureId: CAP_Y },
  ]);
  await dbs.service.insert(ad).values([
    { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1' },
    { competitorId: IDS.competitorY, platform: 'google', externalId: 'g1' },
  ]);
  await dbs.service.insert(observation).values([
    { competitorId: IDS.competitorX, captureId: CAP_X, kind: 'gbp_profile', key: 'profile', data: { title: 'Smith' } },
    { competitorId: IDS.competitorY, captureId: CAP_Y, kind: 'gbp_profile', key: 'profile', data: { title: 'Bright' } },
  ]);
  await dbs.service.insert(competitorSource).values([{ competitorId: IDS.competitorX, source: 'gbp' }]);
  await dbs.service.insert(vendorTask).values([{ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: 't-1', competitorId: IDS.competitorX }]);
  await dbs.service.insert(competitorSuggestion).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'Cool Air', placeId: 'p1', appearances: 3, overlapScore: 0.5 },
    { agencyId: IDS.agencyA, clientId: IDS.clientA2, name: 'Dent Co', placeId: 'p2', appearances: 1, overlapScore: 0.1 },
  ]);
  await dbs.service.insert(rankSnapshot).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, keyword: 'ac repair', lat: 33.9, lng: -84.3, results: [] },
    { agencyId: IDS.agencyB, clientId: IDS.clientB1, keyword: 'ac repair', lat: 33.9, lng: -84.3, results: [] },
  ]);
});

describe('vendor data visibility', () => {
  it('global rows follow the client-competitor link', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect((await tx.select().from(review)).map((r) => r.dedupeKey)).toEqual(['id:1']);
      expect((await tx.select().from(ad)).map((r) => r.externalId)).toEqual(['m1']);
      expect((await tx.select().from(observation)).map((r) => r.competitorId)).toEqual([IDS.competitorX]);
      expect(await tx.select().from(competitorSource)).toEqual([]);
      expect(await tx.select().from(vendorTask)).toEqual([]);
    });
  });

  it('tenant rows follow agency and client scope', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect((await tx.select().from(competitorSuggestion)).map((s) => s.placeId)).toEqual(['p1']);
      expect((await tx.select().from(rankSnapshot)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, async (tx) => {
      expect((await tx.select().from(competitorSuggestion)).map((s) => s.placeId).sort()).toEqual(['p1', 'p2']);
      expect((await tx.select().from(rankSnapshot)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
    });
  });

  it('lets app_user update only in-scope suggestions and never insert them', async () => {
    const n = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      const r = await tx.update(competitorSuggestion).set({ status: 'dismissed' }).returning();
      return r.length;
    });
    expect(n).toBe(1);
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'x', appearances: 1, overlapScore: 0 }),
      ),
    );
    expect(text).toMatch(/permission denied/i);
  });
});
