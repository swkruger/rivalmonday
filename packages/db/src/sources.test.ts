import { eq } from 'drizzle-orm';
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
    { agencyId: IDS.agencyB, clientId: IDS.clientB1, name: 'Breeze Air', placeId: 'p3', appearances: 2, overlapScore: 0.2 },
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

  it('tenant rows follow agency and client scope, and never leak across agencies', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect((await tx.select().from(competitorSuggestion)).map((s) => s.placeId)).toEqual(['p1']);
      expect((await tx.select().from(rankSnapshot)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, async (tx) => {
      // Agency B's suggestion (p3, seeded above) must never show up here even under full client scope.
      expect((await tx.select().from(competitorSuggestion)).map((s) => s.placeId).sort()).toEqual(['p1', 'p2']);
      expect((await tx.select().from(rankSnapshot)).map((r) => r.clientId)).toEqual([IDS.clientA1]);
    });
  });

  it('lets app_user update only the status of in-scope suggestions, and never insert them', async () => {
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

  it('never lets app_user rewrite system-computed suggestion columns (only status is grantable)', async () => {
    const placeIdText = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) =>
        tx.update(competitorSuggestion).set({ placeId: 'evil' }).where(eq(competitorSuggestion.placeId, 'p1')),
      ),
    );
    expect(placeIdText).toMatch(/permission denied/i);

    const clientIdText = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) =>
        tx.update(competitorSuggestion).set({ clientId: IDS.clientA2 }).where(eq(competitorSuggestion.placeId, 'p1')),
      ),
    );
    expect(clientIdText).toMatch(/permission denied/i);
  });

  it('rejects a status value outside the allowed set', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) =>
        tx.update(competitorSuggestion).set({ status: 'bogus' }).where(eq(competitorSuggestion.placeId, 'p1')),
      ),
    );
    expect(text).toMatch(/check constraint/i);
  });

  it('lets agency B update its own status, but updating agency A rows by id affects zero rows', async () => {
    const ownRows = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, async (tx) => {
      const r = await tx.update(competitorSuggestion).set({ status: 'accepted' }).where(eq(competitorSuggestion.placeId, 'p3')).returning();
      return r.length;
    });
    expect(ownRows).toBe(1);

    const crossAgencyRows = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, async (tx) => {
      const r = await tx.update(competitorSuggestion).set({ status: 'dismissed' }).where(eq(competitorSuggestion.placeId, 'p1')).returning();
      return r.length;
    });
    expect(crossAgencyRows).toBe(0);
  });

  it('never lets app_user delete competitor_suggestion rows', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.delete(competitorSuggestion).where(eq(competitorSuggestion.placeId, 'p1')),
      ),
    );
    expect(text).toMatch(/permission denied/i);
  });

  it('shows nothing without tenant context', async () => {
    expect(await dbs.app.select().from(review)).toEqual([]);
    expect(await dbs.app.select().from(ad)).toEqual([]);
    expect(await dbs.app.select().from(observation)).toEqual([]);
    expect(await dbs.app.select().from(competitorSuggestion)).toEqual([]);
    expect(await dbs.app.select().from(rankSnapshot)).toEqual([]);
  });
});
