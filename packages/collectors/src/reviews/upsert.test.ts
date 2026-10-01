import { capture, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { upsertReviews } from './upsert';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const CAP = '00000000-0000-4000-8000-0000000000c1';
const salt = 's'.repeat(32);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, source: 'google_reviews', status: 'ok', collectorVersion: 'dfs/1' });
});

const item = (over: Record<string, unknown> = {}) => ({
  type: 'google_reviews_search', review_id: 'r1', rating: { value: 2 }, review_text: 'Slow. Call 404-555-0199', timestamp: '2026-09-20 10:00:00 +00:00',
  profile_name: 'Jane Doe', profile_url: 'https://maps.google.com/contrib/1', profile_image_url: 'https://x/img.jpg', owner_answer: null, ...over,
});

describe('upsertReviews', () => {
  it('stores pseudonymised, redacted reviews without reviewer identity or review photos', async () => {
    expect(await upsertReviews(dbs.service, IDS.competitorX, CAP, [item({ images: [{ url: 'https://x/review-photo.jpg' }] }), { junk: true }], salt)).toEqual({ upserted: 1, skipped: 1 });
    const [r] = await dbs.service.select().from(review);
    expect(r).toMatchObject({ dedupeKey: 'id:r1', externalId: 'r1', rating: 2, text: 'Slow. Call [phone]', firstCaptureId: CAP });
    expect(r?.reviewerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r)).not.toMatch(/Jane|contrib|img\.jpg|review-photo/);
    expect(r?.postedAt?.toISOString()).toBe('2026-09-20T10:00:00.000Z');
  });

  it('dedupes repeated pulls and picks up a later owner reply', async () => {
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item()], salt, new Date('2026-09-21T00:00:00Z'));
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item({ owner_answer: 'Sorry Jane! Email us at help@smith.example', owner_timestamp: '2026-09-22 09:00:00 +00:00' })], salt, new Date('2026-09-28T00:00:00Z'));
    const rows = await dbs.service.select().from(review);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerAnswer: 'Sorry [name]! Email us at [email]' });
    expect(rows[0]?.lastSeenAt.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(rows[0]?.firstSeenAt.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('falls back to a content hash when review_id is missing', async () => {
    await upsertReviews(dbs.service, IDS.competitorX, CAP, [item({ review_id: null })], salt);
    const [r] = await dbs.service.select().from(review);
    expect(r?.dedupeKey).toMatch(/^h:[0-9a-f]{64}$/);
  });

  it('collapses duplicate dedupeKeys within one batch instead of erroring (ON CONFLICT DO UPDATE cannot affect a row twice)', async () => {
    const result = await upsertReviews(dbs.service, IDS.competitorX, CAP, [item(), item()], salt);
    expect(result).toEqual({ upserted: 1, skipped: 1 });
    const rows = await dbs.service.select().from(review);
    expect(rows).toHaveLength(1);
  });

  it('includes the rating in the content-hash key, so text-less items with the same name/timestamp but different ratings are distinct reviews', async () => {
    const noText = (rating: number) => item({ review_id: null, review_text: null, rating: { value: rating } });
    const result = await upsertReviews(dbs.service, IDS.competitorX, CAP, [noText(4), noText(5)], salt);
    expect(result).toEqual({ upserted: 2, skipped: 0 });
    const rows = await dbs.service.select().from(review);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rating).sort()).toEqual([4, 5]);
  });
});
