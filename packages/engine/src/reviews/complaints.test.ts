import { changeEvent, detectedChange, review, reviewAnalysis } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { day, seedVendorCapture } from '../../test/seed';
import { createPackLoader, tagChange } from '../tag/tag-stage';
import { complaintSpike, detectComplaintSpikes } from './complaints';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const now = day(0);
let n = 0;

async function complaint(postedAt: Date, sentiment: number, theme = 'price_transparency') {
  const [r] = await dbs.service.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: `id:${n++}`, rating: 1, text: 'x', postedAt }).returning({ id: review.id });
  await dbs.service.insert(reviewAnalysis).values({ reviewId: r!.id, verticalId: 'hvac_plumbing', competitorId: IDS.competitorX, textSha: 's', asked: [theme], themes: [theme], sentiment, confidence: 0.9, analysisVersion: 1 });
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('complaintSpike', () => {
  it('needs at least 3 complaints and the multiplier over a baseline floored at 1', () => {
    expect(complaintSpike(4, [1, 0, 1], 2)).toEqual({ spike: true, baselineMean: 0.67, z: 3.33 });
    expect(complaintSpike(3, [2, 2, 2], 2).spike).toBe(false);
    expect(complaintSpike(2, [0, 0, 0], 2).spike).toBe(false);
  });
});

describe('detectComplaintSpikes', () => {
  it('writes one review_spike change per spiking theme, citing the latest reviews capture, then cools down', async () => {
    const before = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(-8) });
    const latest = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(-1) });
    for (const d of [-3, -5, -8, -12]) await complaint(day(d), 0);
    await complaint(day(-2), 4); // praise is not a complaint
    await complaint(day(-40), 1);
    await complaint(day(-100), 0);

    const ids = await detectComplaintSpikes({ db: dbs.service, packs }, IDS.competitorX, { now });
    expect(ids).toHaveLength(1);
    const [c] = await dbs.owner.select().from(detectedChange);
    expect(c).toMatchObject({
      source: 'google_reviews', kind: 'modified', beforeCaptureId: before, afterCaptureId: latest, blockKey: 'reviews:complaints:hvac_plumbing:price_transparency', status: 'pending',
      details: { changeType: 'review_spike', theme: 'price_transparency', themeName: 'Price transparency', verticalId: 'hvac_plumbing', count: 4, baselineMean: 0.67, windowDays: 30, z: 3.33 },
    });
    expect(c!.afterText).toBe('4 complaints about Price transparency in the last 30 days');
    expect(await detectComplaintSpikes({ db: dbs.service, packs }, IDS.competitorX, { now })).toEqual([]);

    const r = await tagChange({ db: dbs.service, ai: createFakeAi(), packs }, ids[0]!);
    expect(r.ran).toBe(true);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'review_spike', channels: ['google_reviews'] });
    expect(ev!.summary).toBe('Complaints about Price transparency up: 4 in 30 days vs 0.67 a month before');
  });

  it('does nothing without a reviews capture to cite', async () => {
    for (const d of [-3, -5, -8, -12]) await complaint(day(d), 0);
    expect(await detectComplaintSpikes({ db: dbs.service, packs }, IDS.competitorX, { now })).toEqual([]);
  });
});
