import { detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { detailsSignature } from '../score/score-stage';
import { buildStructuredSummary } from '../tag/structured';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const SRC = 'tripadvisor';
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, capturedAt: day(7) });
});

const obs = (captureId: string, rating: number | null, reviews: number | null, id = 'g1') =>
  dbs.service.insert(observation).values({ competitorId: IDS.competitorX, captureId, kind: 'tripadvisor', key: 'rating', data: { id, url: 'https://ta.example/x', title: 'X', rating, reviews } });
const changes = () => dbs.service.select().from(detectedChange);
const run = () => diffVendorCapture({ db: dbs.service }, cap1, { now: day(30) });

describe('diffTripadvisor (via diffVendorCapture)', () => {
  it('4.3/88 -> 4.5/95 is one rating_change with the platform details', async () => {
    await obs(cap0, 4.3, 88);
    await obs(cap1, 4.5, 95);
    await run();
    const rows = await changes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'modified', blockKey: 'tripadvisor:rating', source: SRC, beforeText: 'rating 4.3 (88 reviews)', afterText: 'rating 4.5 (95 reviews)' });
    expect(rows[0]?.details).toEqual({ changeType: 'rating_change', platform: 'tripadvisor', field: 'rating', ratingBefore: 4.3, ratingAfter: 4.5, votesBefore: 88, votesAfter: 95 });
  });

  it('a 0.05 move is noise', async () => {
    await obs(cap0, 4.4, 88);
    await obs(cap1, 4.45, 90);
    await run();
    expect(await changes()).toEqual([]);
  });

  it('an implausible review-count drop (113 -> 40) is dropped and counted', async () => {
    await obs(cap0, 4.6, 113);
    await obs(cap1, 4.3, 40);
    expect(await run()).toMatchObject({ ran: true, result: { implausible: 1, changeIds: [] } });
    expect(await changes()).toEqual([]);
  });

  it('no observation on the previous capture means no change', async () => {
    await obs(cap1, 4.5, 95);
    await run();
    expect(await changes()).toEqual([]);
  });

  it('an unmatched pull in between does not lose the move (A -> unmatched -> C)', async () => {
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, capturedAt: day(3) });
    await obs(cap0, 4.0, 50);
    await obs(cap1, 4.6, 60);
    await run();
    const rows = await changes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ beforeCaptureId: cap0, beforeText: 'rating 4 (50 reviews)', afterText: 'rating 4.6 (60 reviews)' });
  });

  it('a null review count renders without a count', async () => {
    await obs(cap0, 4.0, null);
    await obs(cap1, 4.6, null);
    await run();
    expect((await changes())[0]).toMatchObject({ beforeText: 'rating 4', afterText: 'rating 4.6' });
  });

  it('a different listing id (re-match) is not a rating move', async () => {
    await obs(cap0, 4.0, 50, 'g1');
    await obs(cap1, 4.8, 60, 'g2');
    await run();
    expect(await changes()).toEqual([]);
  });
});

describe('platform-aware rating text', () => {
  const g = { ratingBefore: 4.3, ratingAfter: 4.5 } as const;
  it('the signature differs from a Google change with equal values', () => {
    expect(detailsSignature('rating_change', { ...g, platform: 'tripadvisor' })).toBe('rating|tripadvisor|4.3|4.5');
    expect(detailsSignature('rating_change', g)).toBe('rating|4.3|4.5');
  });
  it('the summary names Tripadvisor; Google text is unchanged', () => {
    const d = { changeType: 'rating_change', platform: 'tripadvisor', ratingBefore: 4.3, ratingAfter: 4.5, votesAfter: 95 } as const;
    expect(buildStructuredSummary({ source: SRC, beforeText: null, afterText: null, details: d })).toBe('Tripadvisor rating 4.3 → 4.5 (95 reviews)');
    expect(buildStructuredSummary({ source: 'google_business_profile', beforeText: null, afterText: null, details: { ...d, platform: undefined } })).toBe('Google rating 4.3 → 4.5 (95 reviews)');
  });
});
