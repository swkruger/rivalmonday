import { ad, client, competitor, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent, seedVendorCapture } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import { trendSnapshot } from './trend';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();

async function seedReviews(selfId: string): Promise<void> {
  await dbs.service.insert(review).values([
    { competitorId: IDS.competitorX, dedupeKey: 'x-1', rating: 5, postedAt: day(-3) },
    { competitorId: IDS.competitorX, dedupeKey: 'x-2', rating: 3, postedAt: day(-5) },
    { competitorId: selfId, dedupeKey: 'self-1', rating: 4, postedAt: day(-2) },
  ]);
}

async function seedActiveAd(): Promise<void> {
  await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(-10) });
  await dbs.service.insert(ad).values({
    competitorId: IDS.competitorX, platform: 'meta', externalId: 'active-1', isActive: true, firstSeenAt: day(-10), lastSeenAt: day(6),
  });
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('trendSnapshot', () => {
  it('reports 30-day reviews and rating for self and competitors, active ads and the period event count', async () => {
    const [self] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC', placeId: 'self-place' }).returning({ id: competitor.id });
    await dbs.owner.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, IDS.clientA1));
    await seedReviews(self!.id);
    await seedActiveAd();
    await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(2), createdAt: day(2), route: 'archive', score: 10 });
    const t = await trendSnapshot({ db: dbs.service, packs }, IDS.clientA1, { start: day(0), end: day(7) });
    expect(t.windowDays).toBe(30);
    expect(t.events).toBe(1);
    expect(t.businesses[0]).toMatchObject({ self: true, name: 'A1 HVAC', reviews: 1, avgRating: 4, activeAds: null });
    expect(t.businesses.find((b) => b.competitorId === IDS.competitorX)).toMatchObject({ self: false, reviews: 2, avgRating: 4, activeAds: 1 });
  });
});
