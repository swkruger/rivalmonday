import { client, competitor, review, reviewAnalysis, themeProposal } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import { reviewBenchmark, sentimentScore, summarizeWindow } from './benchmark';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const SELF = '00000000-0000-4000-8000-0000000000f9';
const SEED = ['response_time', 'price_transparency', 'technician_professionalism', 'upsell_pressure', 'scheduling', 'fix_quality', 'communication', 'cleanliness'];
const now = day(0);
let n = 0;

async function add(competitorId: string, postedAt: Date, rating: number | null, analysis?: { themes: string[]; sentiment: number | null; asked?: string[] }) {
  const [r] = await dbs.service.insert(review).values({ competitorId, dedupeKey: `id:${n++}`, rating, text: analysis ? 'some review text' : null, postedAt }).returning({ id: review.id });
  if (analysis) {
    await dbs.service.insert(reviewAnalysis).values({
      reviewId: r!.id, verticalId: 'hvac_plumbing', competitorId, textSha: 's', asked: analysis.asked ?? SEED, themes: analysis.themes, sentiment: analysis.sentiment, confidence: 0.9, analysisVersion: 1,
    });
  }
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(competitor).values({ id: SELF, name: 'A1 HVAC (own GBP)', placeId: 'p-a1' });
  await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
});

describe('summarizeWindow', () => {
  it('maps sentiment levels to −1..+1 and computes shares over asked reviews only', () => {
    expect([0, 1, 2, 3, 4].map(sentimentScore)).toEqual([-1, -0.5, 0, 0.5, 1]);
    const w = summarizeWindow(
      [
        { competitorId: 'c', postedAt: now, rating: 2, asked: ['a'], themes: ['a'], sentiment: 0 },
        { competitorId: 'c', postedAt: now, rating: 4, asked: ['a'], themes: [], sentiment: 3 },
        { competitorId: 'c', postedAt: now, rating: null, asked: [], themes: [], sentiment: null },
      ],
      [{ id: 'a', name: 'A', description: 'a' }, { id: 'b', name: 'B', description: 'b' }],
    );
    expect(w).toEqual({
      reviews: 3, avgRating: 3,
      themes: [
        { themeId: 'a', name: 'A', mentions: 1, asked: 2, share: 0.5, sentiment: -1 },
        { themeId: 'b', name: 'B', mentions: 0, asked: 0, share: null, sentiment: null },
      ],
    });
  });
});

describe('reviewBenchmark', () => {
  it('compares the client (self, first) with each competitor over the current and previous 90 days', async () => {
    // Self: two happy reviews about response time.
    await add(SELF, day(-5), 5, { themes: ['response_time'], sentiment: 4 });
    await add(SELF, day(-20), 4, { themes: ['response_time'], sentiment: 3 });
    // Competitor X, current window: two price complaints and one rating-only review.
    await add(IDS.competitorX, day(-3), 2, { themes: ['price_transparency'], sentiment: 0 });
    await add(IDS.competitorX, day(-10), 1, { themes: ['price_transparency'], sentiment: 1 });
    await add(IDS.competitorX, day(-11), 1);
    // Competitor X, previous window: price never mentioned.
    await add(IDS.competitorX, day(-100), 4, { themes: [], sentiment: 3 });
    await add(IDS.competitorX, day(-150), 5, { themes: [], sentiment: 4 });
    // Outside both windows.
    await add(IDS.competitorX, day(-200), 1, { themes: ['price_transparency'], sentiment: 0 });

    const b = await reviewBenchmark({ db: dbs.service, packs }, IDS.clientA1, { now });
    expect(b).toMatchObject({ clientId: IDS.clientA1, verticalId: 'hvac_plumbing', windowDays: 90 });
    expect(b.businesses.map((x) => [x.name, x.self])).toEqual([['A1 HVAC', true], ['Smith HVAC', false]]);
    const [self, x] = b.businesses;
    expect(self!.themes.find((t) => t.themeId === 'response_time')).toMatchObject({ share: 1, sentiment: 0.75 });
    expect(x).toMatchObject({ reviews: 3, avgRating: 1.33, prevReviews: 2, prevAvgRating: 4.5 });
    expect(x!.themes.find((t) => t.themeId === 'price_transparency')).toMatchObject({
      mentions: 2, asked: 2, share: 1, sentiment: -0.75, prevShare: 0, prevSentiment: null, shareDelta: 1, sentimentDelta: null,
    });
  });

  it('a theme approved mid-window counts only reviews where it was asked', async () => {
    await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'warranty', name: 'Warranty', description: 'Honouring warranties', status: 'approved', otherCount: 20, decidedAt: day(-6) });
    await add(IDS.competitorX, day(-3), 2, { themes: ['warranty'], sentiment: 1, asked: [...SEED, 'warranty'] });
    await add(IDS.competitorX, day(-30), 4, { themes: [], sentiment: 3 });
    await add(IDS.competitorX, day(-40), 4, { themes: [], sentiment: 3 });
    const b = await reviewBenchmark({ db: dbs.service, packs }, IDS.clientA1, { now });
    const x = b.businesses.find((y) => !y.self)!;
    expect(x.themes.find((t) => t.themeId === 'warranty')).toMatchObject({ name: 'Warranty', mentions: 1, asked: 1, share: 1 });
  });

  it('a client without a self business benchmarks its competitors only', async () => {
    const b = await reviewBenchmark({ db: dbs.service, packs }, IDS.clientB1, { now });
    expect(b.businesses.map((x) => x.self)).toEqual([false]);
  });
});
