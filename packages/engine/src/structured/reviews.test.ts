import { detectedChange, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { reviewVelocity } from './reviews';
import { diffVendorCapture } from './vendor-diff';

describe('reviewVelocity', () => {
  it('scales the window to a weekly rate and floors the deviation at 1', () => {
    expect(reviewVelocity(8, 7, Array(12).fill(1))).toEqual({ perWeek: 8, mean: 1, sd: 0, z: 7 });
    expect(reviewVelocity(4, 14, [2, 2, 2, 2])).toMatchObject({ perWeek: 2, z: 0 });
    expect(reviewVelocity(10, 7, [0, 10, 0, 10]).z).toBeCloseTo(1, 5); // mean 5, sd 5
  });
});

describe('diffVendorCapture — google_reviews', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  let cap0: string;
  let cap1: string;
  let n = 0;
  const reviews = (count: number, postedAt: (i: number) => Date, rating = 5) =>
    dbs.service.insert(review).values(Array.from({ length: count }, (_, i) => ({ competitorId: IDS.competitorX, dedupeKey: `id:r${n++}`, rating, text: `secret review text ${i}`, postedAt: postedAt(i) })));

  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(0) });
    cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(7) });
    await reviews(12, (i) => day(-7 * i - 3)); // one review a week for the 12 weeks before the previous pull
  });

  it('flags a spike of reviews since the previous pull, with counts only (no review text)', async () => {
    await reviews(8, (i) => day(1 + (i % 5)), 1);
    await diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });
    const [c] = await dbs.service.select().from(detectedChange);
    expect(c).toMatchObject({ kind: 'modified', blockKey: 'reviews:velocity', source: 'google_reviews', beforeCaptureId: cap0 });
    expect(c?.details).toMatchObject({ changeType: 'review_spike', count: 8, windowDays: 7, baselineMean: 1, z: 7, avgRating: 1 });
    expect(`${c?.beforeText} ${c?.afterText}`).not.toMatch(/secret/);
  });

  it('ignores fewer than REVIEW_SPIKE_MIN reviews, and a normal week', async () => {
    await reviews(3, (i) => day(1 + i));
    await diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });
});
