import { BriefReport } from '@cs/core';
import { ad, alert, capture, changeEvent, client, clientCompetitor, competitor, move, moveEvent, observation, rankMapImage, rankScan, rankSnapshot, recommendation, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import type { BriefClient } from './gather';
import { buildBriefReport } from './report';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const deps = () => ({ db: dbs.service, packs: createPackLoader() });
const period = { start: day(0), end: day(7) };
const clientOf = (id: string): BriefClient => ({
  id, agencyId: IDS.agencyA, name: 'A1 HVAC', verticalId: 'hvac_plumbing', verticalName: 'HVAC', services: ['ac_tune_up'], serviceNames: ['AC tune-up'],
  towns: [], zips: [], competitorNames: ['Smith HVAC'], briefThreshold: 40,
});
const ev = (o: Partial<Parameters<typeof seedScoredEvent>[1]> = {}) =>
  seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(3), ...o });
const finite = (x: unknown): void => {
  if (typeof x === 'number') expect(Number.isFinite(x)).toBe(true);
  else if (Array.isArray(x)) x.forEach(finite);
  else if (x && typeof x === 'object') Object.values(x).forEach(finite);
};

let selfId: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [s] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC listing', placeId: 'PSELF' }).returning({ id: competitor.id });
  selfId = s!.id;
  await dbs.owner.update(client).set({ selfCompetitorId: selfId, services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.update(competitor).set({ placeId: 'PX' }).where(eq(competitor.id, IDS.competitorX));
});

async function seedWeek(): Promise<{ scanId: string }> {
  await ev({ score: 80, route: 'alert' });
  await ev({ score: 45, route: 'brief', changeType: 'promo', occurredAt: day(4) });
  await ev({ score: 10, route: 'archive', changeType: 'content', occurredAt: day(5) });
  // Ratings: GBP profiles and monthly reviews.
  for (const [id, rating] of [[selfId, 4.8], [IDS.competitorX, 4.2]] as const) {
    const [cap] = await dbs.owner.insert(capture).values({ competitorId: id, source: 'google_business_profile', status: 'ok', collectorVersion: 't', capturedAt: day(2) }).returning();
    await dbs.owner.insert(observation).values({ competitorId: id, captureId: cap!.id, kind: 'gbp_profile', key: 'profile', data: { rating, votes: 10 }, observedAt: day(2) });
    await dbs.owner.insert(review).values({ competitorId: id, dedupeKey: randomUUID(), rating: 5, text: 't', postedAt: day(1) });
  }
  // Ads: first check two weeks before the period, one live ad.
  await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 't', capturedAt: day(-14) });
  await dbs.owner.insert(ad).values({ competitorId: IDS.competitorX, platform: 'google', externalId: 'a1', isActive: true, firstSeenAt: day(-14), lastSeenAt: day(7) });
  // Rankings: previous and latest scans, plus a scan after asOf that must be ignored.
  const [prev] = await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: day(-6), finishedAt: day(-6) }).returning();
  const [cur] = await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: day(6), finishedAt: day(6) }).returning();
  const [later] = await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: day(9), finishedAt: day(9) }).returning();
  const res = (placeId: string, rank: number) => ({ rank, placeId, cid: null, domain: null, title: placeId });
  const snap = (scanId: string, keyword: string, lat: number, results: ReturnType<typeof res>[]) =>
    dbs.owner.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId, keyword, lat, lng: -80, results });
  await snap(prev!.id, 'ac repair', 40, [res('PSELF', 5), res('PX', 1)]);
  await snap(cur!.id, 'ac repair', 40, [res('PSELF', 2), res('PX', 1)]);
  await snap(cur!.id, 'ac repair', 40.01, [res('PX', 3)]);
  await snap(cur!.id, 'furnace', 40, [res('PSELF', 1)]);
  await snap(later!.id, 'zzz later', 40, [res('PSELF', 1)]);
  await dbs.owner.insert(rankMapImage).values({
    clientId: IDS.clientA1, agencyId: IDS.agencyA, settingsHash: 'h', objectKey: 'rank-map/a1/h.png', bounds: { west: -81, south: 39, east: -79, north: 41 }, width: 600, height: 400,
  });
  return { scanId: cur!.id };
}

describe('buildBriefReport', () => {
  it('builds a report for a client with no competitors', async () => {
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA2));
    const r = await buildBriefReport(deps(), clientOf(IDS.clientA2), period, new Set());
    expect(BriefReport.parse(r)).toEqual(r);
    expect(r.asOf).toBe(period.end.toISOString());
    expect(r.changes.lines).toEqual([]);
    expect(r.changes.totals).toEqual({ major: 0, notable: 0, minor: 0 });
    expect(r.rating.months).toHaveLength(12);
    expect(r.rating.series).toEqual([]);
    expect(r.ads.weeks).toHaveLength(12);
    expect(r.ads.series).toEqual([]);
    expect(r.rankings).toBeNull();
    expect(r.pressure).toEqual([]);
    expect(r.kpis).toMatchObject({ changes7d: 0, alerts7d: 0, priceMoves7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, ratingSelf: null, ratingAvg: null });
    expect(r.kpis.weekly.changes).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.moves).toEqual([]);
    expect(r.recommendations).toEqual([]);
    expect(r.alerts).toEqual([]);
    finite(r);
  });

  it('report parses with the zod schema for a seeded week', async () => {
    const { scanId } = await seedWeek();
    const r = await buildBriefReport(deps(), clientOf(IDS.clientA1), period, new Set());
    expect(BriefReport.parse(r)).toEqual(r);
    finite(r);
    expect(r.changes.lines.flatMap((l) => l.eventIds)).toHaveLength(3);
    expect(r.kpis).toMatchObject({ changes7d: 2, alerts7d: 1, priceMoves7d: 1, priceCuts7d: 1, activeAds: 1, activeAds7dAgo: 1, ratingSelf: 4.8, ratingAvg: 4.2 });
    expect(r.pressure).toHaveLength(1);
    expect(r.pressure[0]).toMatchObject({ competitorId: IDS.competitorX, name: 'Smith HVAC' });
    expect(typeof r.pressure[0]!.reason).toBe('string');
    // Rating: unfolded, self first with `you`.
    expect(r.rating.months[11]).toBe('2026-10');
    expect(r.rating.series.map((s) => [s.key, s.name, s.you ?? false])).toEqual([[selfId, 'A1 HVAC', true], [IDS.competitorX, 'Smith HVAC', false]]);
    expect(r.rating.series[0]!.points[11]).toBe(5);
    expect(r.ads.weeks[11]).toBe(period.end.toISOString().slice(0, 10));
    expect(r.ads.series).toEqual([{ key: IDS.competitorX, name: 'Smith HVAC', points: [...Array(8).fill(null), 1, 1, 1, 1] }]);
    expect(r.kpis.weekly.activeAds).toEqual([null, null, null, null, 1, 1, 1, 1]);
    // Rankings: the latest scan at or before asOf vs the one before it.
    expect(r.rankings).not.toBeNull();
    expect(r.rankings!.scanAt).toBe(day(6).toISOString());
    expect(r.rankings!.prevScanAt).toBe(day(-6).toISOString());
    expect(r.rankings!.keywords.map((k) => k.keyword)).toEqual(['ac repair', 'furnace']);
    const ac = r.rankings!.keywords[0]!;
    expect(ac.you).toEqual({ avgRank: 11.5, top3Share: 0.5, points: 2 });
    expect(ac.prev).toEqual({ avgRank: 5, top3Share: 0, points: 1 });
    expect(ac.rivals).toEqual([{ name: 'Smith HVAC', metric: { avgRank: 2, top3Share: 1, points: 2 } }]);
    expect(r.rankings!.keywords[1]!.prev).toBeNull();
    expect(r.rankings!.map).toMatchObject({ keyword: 'ac repair', objectKey: 'rank-map/a1/h.png', width: 600, height: 400 });
    expect(r.rankings!.map!.points).toEqual([{ lat: 40.01, lng: -80, rank: 21 }, { lat: 40, lng: -80, rank: 2 }]);
    expect(scanId).toBeTruthy();
    // Deterministic: a second build is identical.
    expect(await buildBriefReport(deps(), clientOf(IDS.clientA1), period, new Set())).toEqual(r);
  });

  it('moves are open, live and labelled', async () => {
    const live = await ev();
    const gone = await ev();
    await dbs.service.update(changeEvent).set({ retractedAt: day(4), retractionReason: 'r' }).where(eq(changeEvent.id, gone.eventId));
    const mk = async (moveType: string, status: string, eventId: string, closed = false) => {
      const [m] = await dbs.owner.insert(move).values({
        agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType, status, confidence: 0.7, summary: 's', ruleVersion: 1,
        firstDetectedAt: day(2), lastHeldAt: day(5), lastEvidenceAt: day(5), closedAt: closed ? day(6) : null,
      }).returning({ id: move.id });
      await dbs.owner.insert(moveEvent).values({ moveId: m!.id, eventId });
      return m!.id;
    };
    const open = await mk('price_war', 'active', live.eventId);
    await mk('ad_surge', 'active', gone.eventId);
    await mk('promo_blitz', 'fading', live.eventId);
    await mk('hiring_push', 'active', live.eventId, true);
    const r = await buildBriefReport(deps(), clientOf(IDS.clientA1), period, new Set());
    expect(r.moves).toEqual([{ id: open, competitorName: 'Smith HVAC', moveType: 'price_war', label: 'Price war', status: 'active', firstDetectedAt: day(2).toISOString() }]);
  });

  it('recommendations never carry upsell_tag', async () => {
    const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, rationale: 'r', effort: 'M', impact: 'M', owner: 'client', source: 'brief', upsellTag: 'ppc' };
    await dbs.owner.insert(recommendation).values([
      { ...base, title: 'Old todo', status: 'todo', createdAt: day(-10) },
      { ...base, title: 'New todo', status: 'todo', createdAt: day(5) },
      { ...base, title: 'Doing', status: 'in_progress', createdAt: day(-3) },
      { ...base, title: 'Done', status: 'done', createdAt: day(5) },
      { ...base, title: 'Dismissed', status: 'dismissed', createdAt: day(5) },
    ]);
    const r = await buildBriefReport(deps(), clientOf(IDS.clientA1), period, new Set());
    expect(r.recommendations.map((x) => [x.title, x.status, x.createdThisWeek])).toEqual([
      ['Doing', 'in_progress', false], ['New todo', 'todo', true], ['Old todo', 'todo', false],
    ]);
    for (const x of r.recommendations) expect(Object.keys(x).sort()).toEqual(['createdThisWeek', 'id', 'status', 'title']);
    expect(JSON.stringify(r)).not.toMatch(/upsell|ppc/i);
  });

  it('alerts only from the period, delivered only', async () => {
    const e = await ev({ score: 80, route: 'alert' });
    const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e.eventId, score: 80, mode: 'direct', body: 'b' };
    await dbs.owner.insert(alert).values([
      { ...base, headline: 'In period', status: 'delivered', deliveredAt: day(3) },
      { ...base, headline: 'Later in period', status: 'delivered', deliveredAt: day(6) },
      { ...base, headline: 'Before period', status: 'delivered', deliveredAt: day(-1) },
      { ...base, headline: 'After period', status: 'delivered', deliveredAt: day(8) },
      { ...base, headline: 'Pending', status: 'pending_review', deliveredAt: null },
      { ...base, headline: 'Withdrawn', status: 'withdrawn', deliveredAt: day(4) },
    ]);
    const r = await buildBriefReport(deps(), clientOf(IDS.clientA1), period, new Set());
    expect(r.alerts).toEqual([
      { headline: 'Later in period', competitorName: 'Smith HVAC', deliveredAt: day(6).toISOString() },
      { headline: 'In period', competitorName: 'Smith HVAC', deliveredAt: day(3).toISOString() },
    ]);
  });

  it('retracted events never counted in kpis or lines', async () => {
    const keep = await ev({ score: 80, route: 'alert' });
    const gone = await ev({ score: 90, route: 'alert' });
    await dbs.service.update(changeEvent).set({ retractedAt: day(4), retractionReason: 'r' }).where(eq(changeEvent.id, gone.eventId));
    const r = await buildBriefReport(deps(), clientOf(IDS.clientA1), period, new Set());
    expect(r.changes.lines.flatMap((l) => l.eventIds)).toEqual([keep.eventId]);
    expect(r.kpis).toMatchObject({ changes7d: 1, alerts7d: 1, priceMoves7d: 1 });
    expect(r.kpis.weekly.changes[7]).toBe(1);
    expect(r.kpis.weekly.priceMoves[7]).toBe(1);
    expect(JSON.stringify(r)).not.toContain(gone.eventId);
  });

  it('untracked competitor drops out of every section', async () => {
    await seedWeek();
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    const r = await buildBriefReport(deps(), clientOf(IDS.clientA1), period, new Set());
    expect(r.changes.lines).toEqual([]);
    expect(r.pressure).toEqual([]);
    expect(r.ads.series).toEqual([]);
    expect(r.rating.series.map((s) => s.key)).toEqual([selfId]);
    expect(r.rankings!.keywords[0]!.rivals).toEqual([]);
  });
});
