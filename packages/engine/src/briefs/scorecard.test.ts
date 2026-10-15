import { ad, capture, client, clientCompetitor, competitor, competitorSignal, evidence, observation, rankScan, rankSnapshot, review, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPackLoader } from '../tag/tag-stage';
import { buildScorecard, median, Scorecard } from './scorecard';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const deps = () => ({ db: dbs.service, packs: createPackLoader() });
const NOW = new Date('2026-10-15T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
let selfId: string;

async function addRival(name: string, tier: 'top' | 'watch' | 'minor' | null, signals: Record<string, unknown> = {}, placeId: string | null = null): Promise<string> {
  const [c] = await dbs.owner.insert(competitor).values({ name, placeId }).returning({ id: competitor.id });
  await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: c!.id });
  if (tier) await dbs.owner.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: c!.id, tier, signals });
  return c!.id;
}
const rev = (competitorId: string, rating: number, postedAt: Date, answered = false) =>
  dbs.owner.insert(review).values({ competitorId, dedupeKey: randomUUID(), rating, text: 't', postedAt, ownerAnswer: answered ? 'thanks' : null });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [s] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC', placeId: 'PSELF' }).returning({ id: competitor.id });
  selfId = s!.id;
  await dbs.owner.update(client).set({ selfCompetitorId: selfId }).where(eq(client.id, IDS.clientA1));
});

describe('median', () => {
  it('median ignores null', () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([1, 2, null, 3, 10])).toBe(2.5);
    expect(median([null, null])).toBeNull();
    expect(median([])).toBeNull();
  });
});

describe('buildScorecard', () => {
  it('no competitors → rivalMedian null', async () => {
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    await rev(selfId, 5, ago(3));
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    expect(Scorecard.parse(sc)).toBeTruthy();
    expect(sc.rows.map((r) => r.self)).toEqual([true]);
    expect(sc.tiles.map((t) => t.metric)).toEqual(['rating', 'reviews90d', 'replyRate', 'mapTop3Share']);
    expect(sc.tiles.every((t) => t.rivalMedian === null && t.deltaSinceStart === null)).toBe(true);
    expect(sc.tiles[1]!.you).toBe(1);
  });

  it('tier ordering of rows: self, then top, watch, minor, unrated, then name', async () => {
    await addRival('Zed', 'top');
    await addRival('Alpha', 'watch');
    await addRival('Beta', 'top');
    await addRival('Gamma', null);
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    // Smith HVAC (competitorX) is tracked without a signal row: unrated.
    expect(sc.rows.map((r) => [r.name, r.tier])).toEqual([['A1 HVAC', null], ['Beta', 'top'], ['Zed', 'top'], ['Alpha', 'watch'], ['Gamma', null], ['Smith HVAC', null]]);
  });

  it('computes values, rival medians, ads (self null when never checked) and map share from the latest done scan', async () => {
    const a = await addRival('Rival A', 'top', { googleAdsActive: 3, metaAdsActive: null }, 'PA');
    const b = await addRival('Rival B', 'watch', { googleAdsActive: 1, metaAdsActive: 2 }, 'PB');
    await rev(selfId, 5, ago(2), true);
    await rev(selfId, 3, ago(4));
    await rev(a, 4, ago(3), true);
    await rev(b, 4, ago(5));
    await rev(b, 4, ago(6));
    await rev(b, 4, ago(7));
    const cap = (await dbs.owner.insert(capture).values({ competitorId: selfId, source: 'google_maps_rank', status: 'ok', collectorVersion: 't' }).returning())[0]!;
    const [ev] = await dbs.owner.insert(evidence).values({ captureId: cap.id, kind: 'vendor_json', objectKey: 'k', sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
    const [old] = await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: ago(20), finishedAt: ago(20) }).returning();
    const [cur] = await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: ago(1), finishedAt: ago(1) }).returning();
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'running', startedAt: ago(0) });
    const res = (placeId: string, rank: number) => ({ rank, placeId, cid: null, domain: null, title: placeId });
    const snap = (scanId: string, lat: number, results: ReturnType<typeof res>[], captureId: string | null) =>
      dbs.owner.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId, keyword: 'ac repair', lat, lng: 1, results, captureId });
    await snap(old!.id, 1, [res('PA', 1)], null);
    await snap(cur!.id, 1, [res('PSELF', 1), res('PA', 2)], cap.id);
    await snap(cur!.id, 2, [res('PB', 1), res('PSELF', 5)], cap.id);
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    const row = (n: string) => sc.rows.find((r) => r.name === n)!.values;
    expect(row('A1 HVAC')).toEqual({ rating: null, reviews90d: 2, replyRate: 0.5, mapTop3Share: 0.5, adsActive: null, metaAdsActive: null });
    expect(row('Rival A')).toEqual({ rating: null, reviews90d: 1, replyRate: 1, mapTop3Share: 0.5, adsActive: 3, metaAdsActive: null });
    expect(row('Rival B')).toMatchObject({ reviews90d: 3, replyRate: 0, mapTop3Share: 0.5, adsActive: 1, metaAdsActive: 2 });
    expect(sc.tiles).toEqual([
      { metric: 'rating', you: null, rivalMedian: null, deltaSinceStart: null },
      { metric: 'reviews90d', you: 2, rivalMedian: 2, deltaSinceStart: null }, // rivals 1, 3; Smith HVAC never collected: null, ignored
      { metric: 'replyRate', you: 0.5, rivalMedian: 0.5, deltaSinceStart: null }, // rivals 1, 0 (Smith has no reviews: null)
      { metric: 'mapTop3Share', you: 0.5, rivalMedian: 0.5, deltaSinceStart: null }, // Smith has no place id: null
    ]);
    expect(sc.evidenceIds).toEqual([ev!.id]);
  });

  it('self ads count active rows once an ads source was checked', async () => {
    await dbs.owner.insert(capture).values({ competitorId: selfId, source: 'google_ads', status: 'ok', collectorVersion: 't' });
    const sc0 = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    expect(sc0.rows[0]!.values).toMatchObject({ adsActive: 0, metaAdsActive: null });
    await dbs.owner.insert(ad).values([
      { competitorId: selfId, platform: 'google', externalId: 'g1', isActive: true },
      { competitorId: selfId, platform: 'google', externalId: 'g2', isActive: false },
    ]);
    const sc1 = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    expect(sc1.rows[0]!.values.adsActive).toBe(1);
  });

  it('deltaSinceStart computed against baseline', async () => {
    await dbs.owner.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: 't-self', competitorId: selfId, status: 'done' }); // reviews collected: 0, not null
    const base = await buildScorecard(deps(), IDS.clientA1, { now: ago(30) });
    await rev(selfId, 5, ago(3));
    await rev(selfId, 4, ago(4));
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW, baseline: base });
    expect(sc.tiles.map((t) => t.deltaSinceStart)).toEqual([null, 2, null, null]);
  });

  it('caps evidence ids at 50 by source quota: GBP and map-pack evidence survive, reviews fill the rest', async () => {
    const mk = async (competitorId: string, source: string) => {
      const [c] = await dbs.owner.insert(capture).values({ competitorId, source, status: 'ok', collectorVersion: 't' }).returning();
      const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
      return { captureId: c!.id, evidenceId: e!.id };
    };
    const gbp = await mk(selfId, 'google_business_profile');
    await dbs.owner.insert(observation).values({ competitorId: selfId, captureId: gbp.captureId, kind: 'gbp_profile', key: 'profile', data: { rating: 4.5, votes: 3 }, observedAt: ago(1) });
    const [scan] = await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: ago(1), finishedAt: ago(1) }).returning();
    const rankEv = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = await mk(selfId, 'google_maps_rank');
      rankEv.add(r.evidenceId);
      await dbs.owner.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId: scan!.id, keyword: 'k', lat: i, lng: 0, results: [], captureId: r.captureId });
    }
    const ids = [selfId, await addRival('R1', 'top'), await addRival('R2', 'top'), await addRival('R3', 'watch'), await addRival('R4', 'watch'), await addRival('R5', 'minor'), await addRival('R6', 'minor')];
    for (const id of ids) {
      for (let i = 0; i < 10; i++) {
        const r = await mk(id, 'google_reviews');
        await dbs.owner.insert(review).values({ competitorId: id, dedupeKey: randomUUID(), rating: 5, text: 't', postedAt: ago(i + 1), firstCaptureId: r.captureId });
      }
    }
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    expect(sc.evidenceIds).toHaveLength(50);
    expect(new Set(sc.evidenceIds).size).toBe(50);
    expect(sc.evidenceIds).toContain(gbp.evidenceId);
    expect(sc.evidenceIds.filter((id) => rankEv.has(id))).toHaveLength(15);
  });

  it('passes openFirstMoves through', async () => {
    const moves = [{ recommendationId: randomUUID(), title: 'Ask for reviews' }];
    expect((await buildScorecard(deps(), IDS.clientA1, { now: NOW, openFirstMoves: moves })).openFirstMoves).toEqual(moves);
  });
});
