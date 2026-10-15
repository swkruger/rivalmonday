import { capture, client, clientCompetitor, competitor, evidence, observation, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { monthKeys, ratingTrend } from './rating-trend';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-15T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function captureWithEvidence(competitorId: string, source: string): Promise<{ captureId: string; evidenceId: string }> {
  const [c] = await dbs.owner.insert(capture).values({ competitorId, source, status: 'ok', collectorVersion: 't' }).returning();
  const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
  return { captureId: c!.id, evidenceId: e!.id };
}

describe('monthKeys', () => {
  it('lists UTC months ending with the current one', () => {
    expect(monthKeys(new Date('2026-01-15T12:00:00Z'), 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('ratingTrend', () => {
  it('gives rating, 90-day reviews, reply rate and the evidence ids behind them, self first', async () => {
    const [s] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC' }).returning();
    await dbs.owner.update(client).set({ selfCompetitorId: s!.id }).where(eq(client.id, IDS.clientA1));
    const gbp = await captureWithEvidence(s!.id, 'google_business_profile');
    await dbs.owner.insert(observation).values({ competitorId: s!.id, captureId: gbp.captureId, kind: 'gbp_profile', key: 'profile', data: { rating: 4.6, votes: 12 }, observedAt: ago(1) });
    const rc = await captureWithEvidence(IDS.competitorX, 'google_reviews');
    await dbs.owner.insert(review).values([
      { competitorId: IDS.competitorX, dedupeKey: 'a', rating: 4, postedAt: ago(5), ownerAnswer: 'ty', firstCaptureId: rc.captureId },
      { competitorId: IDS.competitorX, dedupeKey: 'b', rating: 5, postedAt: ago(8), firstCaptureId: rc.captureId },
      { competitorId: IDS.competitorX, dedupeKey: 'c', rating: 5, postedAt: ago(200), firstCaptureId: null },
    ]);
    const t = await ratingTrend({ db: dbs.service }, IDS.clientA1, { now: NOW });
    expect(t.businesses).toEqual([
      { competitorId: s!.id, name: 'A1 HVAC', self: true, rating: 4.6, reviews90d: 0, replyRate: null, evidenceIds: [gbp.evidenceId] },
      { competitorId: IDS.competitorX, name: 'Smith HVAC', self: false, rating: null, reviews90d: 2, replyRate: 0.5, evidenceIds: [rc.evidenceId] },
    ]);
  });

  it('is empty for a client with no businesses', async () => {
    await dbs.owner.delete(clientCompetitor);
    expect(await ratingTrend({ db: dbs.service }, IDS.clientA1, { now: NOW })).toEqual({ businesses: [] });
  });
});
