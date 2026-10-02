import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { ad, capture, competitor, rankScan, rankSnapshot, review, reviewRevision } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const CAP = '00000000-0000-4000-8000-0000000000c1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' });
});

describe('vendor history tables', () => {
  it('competitors carry several Meta pages and pinned Google advertiser ids (empty by default)', async () => {
    await dbs.service.update(competitor).set({ metaPageIds: ['111', '222'], googleAdvertiserIds: ['AR1'] }).where(eq(competitor.id, IDS.competitorX));
    const [x] = await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX));
    const [y] = await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorY));
    expect(x).toMatchObject({ metaPageIds: ['111', '222'], googleAdvertiserIds: ['AR1'] });
    expect(y).toMatchObject({ metaPageIds: [], googleAdvertiserIds: [] });
  });

  it('review revisions follow competitor visibility and only the service role writes them', async () => {
    const [r] = await dbs.service.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: 'id:r1', rating: 5, text: 'Great' }).returning({ id: review.id });
    await dbs.service.insert(reviewRevision).values({ reviewId: r!.id, competitorId: IDS.competitorX, rating: 5, text: 'Great', replacedByCaptureId: CAP });
    const seen = (clientScope: 'all' | string[]) => withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope }, (tx) => tx.select().from(reviewRevision));
    expect(await seen([IDS.clientA1])).toHaveLength(1);
    expect(await seen([IDS.clientA2])).toHaveLength(0);
    expect(
      await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(reviewRevision).values({ reviewId: r!.id, competitorId: IDS.competitorX, rating: 1, text: 'x' }))),
    ).toMatch(/permission denied/i);
  });

  it('rank scans group snapshots and are private to the client tenant', async () => {
    const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1 }).returning();
    expect(scan).toMatchObject({ status: 'running', snapshots: 0, failed: 0, finishedAt: null });
    await dbs.service.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId: scan!.id, keyword: 'ac repair', lat: 1, lng: 2, results: [] });
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(rankScan))).toHaveLength(1);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(rankScan))).toHaveLength(0);
    expect(await errorText(dbs.service.insert(rankScan).values({ agencyId: IDS.agencyB, clientId: IDS.clientA1 }))).toMatch(/foreign key/i);
  });

  it('an ad records the capture that ended it', async () => {
    const [row] = await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', isActive: false, endedCaptureId: CAP }).returning();
    expect(row?.endedCaptureId).toBe(CAP);
  });
});
