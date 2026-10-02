import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { capture, client, competitor, priceBlockMap, pricePoint, review, reviewAnalysis, themeProposal, trackedPage } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const SELF_A1 = '00000000-0000-4000-8000-0000000000f9';
const PAGE_X = '00000000-0000-4000-8000-0000000000e1';
const CAP_X = '00000000-0000-4000-8000-0000000000c1';
const A1 = { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] };
const B1 = { agencyId: IDS.agencyB, clientScope: [IDS.clientB1] };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(competitor).values({ id: SELF_A1, name: 'A1 HVAC', placeId: 'place-a1' });
  await dbs.owner.update(client).set({ selfCompetitorId: SELF_A1 }).where(eq(client.id, IDS.clientA1));
  const reviews = await dbs.service
    .insert(review)
    .values([
      { competitorId: IDS.competitorX, dedupeKey: 'id:x1', rating: 2, text: 'Hidden fees' },
      { competitorId: SELF_A1, dedupeKey: 'id:s1', rating: 5, text: 'Great service' },
    ])
    .returning({ id: review.id, competitorId: review.competitorId });
  await dbs.service.insert(reviewAnalysis).values(
    reviews.map((r) => ({ reviewId: r.id, verticalId: 'hvac_plumbing', competitorId: r.competitorId, textSha: 'sha', asked: ['price_transparency'], themes: ['price_transparency'], sentiment: 1, confidence: 0.9, analysisVersion: 1 })),
  );
  await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'warranty', name: 'Warranty', description: 'Honouring warranties', otherCount: 25 });
  await dbs.service.insert(priceBlockMap).values({ textSha: 'abc', verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', confidence: 0.95 });
  await dbs.service.insert(trackedPage).values({ id: PAGE_X, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'manual', cadence: 'daily' });
  await dbs.service.insert(capture).values({ id: CAP_X, competitorId: IDS.competitorX, trackedPageId: PAGE_X, source: 'web', status: 'ok', collectorVersion: 'web/1' });
  await dbs.service.insert(pricePoint).values({
    competitorId: IDS.competitorX, trackedPageId: PAGE_X, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 89, unit: 'USD', qualifier: 'from',
    raw: '$89', context: 'AC tune-up from $89', firstSeenAt: new Date(), lastSeenAt: new Date(), firstCaptureId: CAP_X, lastCaptureId: CAP_X,
  });
});

describe('review and price insight tables', () => {
  it('a client sees its own self business and its tracked competitors, nothing else', async () => {
    await withTenant(dbs.app, A1, async (tx) => {
      expect((await tx.select({ id: competitor.id }).from(competitor)).map((c) => c.id).sort()).toEqual([IDS.competitorX, SELF_A1].sort());
      expect((await tx.select().from(review)).map((r) => r.competitorId).sort()).toEqual([IDS.competitorX, SELF_A1].sort());
      expect(await tx.select().from(reviewAnalysis)).toHaveLength(2);
      expect(await tx.select().from(pricePoint)).toHaveLength(1);
    });
    await withTenant(dbs.app, B1, async (tx) => {
      expect((await tx.select().from(review)).map((r) => r.competitorId)).toEqual([IDS.competitorX]);
      expect((await tx.select().from(reviewAnalysis)).map((r) => r.competitorId)).toEqual([IDS.competitorX]);
    });
  });

  it('theme proposals and the price-block cache are service-only', async () => {
    await withTenant(dbs.app, A1, async (tx) => {
      expect(await tx.select().from(themeProposal)).toEqual([]);
      expect(await tx.select().from(priceBlockMap)).toEqual([]);
    });
  });

  it('app_user cannot write any of the new tables', async () => {
    const [r] = await dbs.owner.select({ id: review.id }).from(review).limit(1);
    // One errorText(withTenant(...)) per attempt (not nested inside a withTenant callback): postgres.js's
    // begin() tracks any query error on the transaction via a handler regardless of whether the caller
    // catches it locally, and re-throws it after the callback settles — so catching the insert's rejection
    // *inside* the withTenant callback still leaves the outer withTenant promise rejecting afterwards.
    const fails = async (p: Promise<unknown>) => expect(await errorText(p)).toMatch(/permission denied/);
    await fails(withTenant(dbs.app, A1, (tx) => tx.insert(reviewAnalysis).values({ reviewId: r!.id, verticalId: 'dental', competitorId: IDS.competitorX, textSha: 's', confidence: 1, analysisVersion: 1 })));
    await fails(withTenant(dbs.app, A1, (tx) => tx.insert(priceBlockMap).values({ textSha: 'z', verticalId: 'dental', confidence: 1 })));
    await fails(withTenant(dbs.app, A1, (tx) => tx.update(pricePoint).set({ amount: 1 })));
  });

  it('only one open price point per page/service/unit/qualifier/amount; an ended one may repeat', async () => {
    const again = {
      competitorId: IDS.competitorX, trackedPageId: PAGE_X, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 89, unit: 'USD', qualifier: 'from' as const,
      raw: '$89', context: 'x', firstSeenAt: new Date(), lastSeenAt: new Date(), firstCaptureId: CAP_X, lastCaptureId: CAP_X,
    };
    expect(await errorText(dbs.service.insert(pricePoint).values(again))).toMatch(/price_point_open_unique/);
    await dbs.service.update(pricePoint).set({ endedAt: new Date(), endedCaptureId: CAP_X });
    await dbs.service.insert(pricePoint).values(again);
    expect(await dbs.owner.select().from(pricePoint)).toHaveLength(2);
  });

  it('one live (proposed or approved) proposal per vertical theme id; rejected and none rows may repeat', async () => {
    expect(await errorText(dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'warranty', name: 'W', description: 'd', otherCount: 1 }))).toMatch(
      /theme_proposal_live_unique/,
    );
    await dbs.service.insert(themeProposal).values([
      { verticalId: 'hvac_plumbing', themeId: '', name: '', description: '', status: 'none', otherCount: 20 },
      { verticalId: 'hvac_plumbing', themeId: '', name: '', description: '', status: 'none', otherCount: 21 },
    ]);
  });

  it('at most one proposed proposal per vertical, even for a different theme id; a none row is still insertable while one is pending', async () => {
    // beforeEach already seeded a 'proposed' warranty row for hvac_plumbing.
    expect(
      await errorText(dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'other_theme', name: 'Other', description: 'd', otherCount: 1 })),
    ).toMatch(/theme_proposal_pending_unique/);
    await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: '', name: '', description: '', status: 'none', otherCount: 22 });
  });
});
