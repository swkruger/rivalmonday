import { ad, capture, client, competitor, competitorSignal, competitorSource, competitorSuggestion, observation, rankScan, rankSnapshot, review } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pack } from '../rivals/test/helpers';
import { computeTrackedSignals, listSignalClients } from './tracked';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const CAP = '00000000-0000-4000-8000-0000000000c1';
const deps = () => ({ db: dbs.service, packs: async () => ({ discovery: pack }) as unknown as VerticalPack });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(competitor).set({ placeId: 'p-y', cid: 'cid-y' }).where(eq(competitor.id, IDS.competitorY));
  await dbs.service.insert(capture).values({ id: CAP, competitorId: IDS.competitorY, source: 'google_business_profile', status: 'ok', collectorVersion: 'test' });
});

const rev = (key: string, posted: Date, ownerAnswer: string | null = null) => ({ competitorId: IDS.competitorY, dedupeKey: key, postedAt: posted, ownerAnswer });
const gAd = (id: string, o: { active: boolean; firstSeen: Date; platform?: 'google' | 'meta' }) => ({
  competitorId: IDS.competitorY, platform: o.platform ?? 'google', externalId: id, isActive: o.active, firstSeenAt: o.firstSeen,
});

describe('computeTrackedSignals', () => {
  it('computes tracked signals from seeded ads, reviews and observations', async () => {
    await dbs.owner.update(competitor).set({ googleAdvertiserIds: ['AR1'] }).where(eq(competitor.id, IDS.competitorY));
    await dbs.service.insert(observation).values([
      { competitorId: IDS.competitorY, captureId: CAP, kind: 'gbp_profile', key: 'old', data: { rating: 4.0, votes: 10, isClaimed: false }, observedAt: daysAgo(40) },
      { competitorId: IDS.competitorY, captureId: CAP, kind: 'gbp_profile', key: 'profile', data: { rating: 4.6, votes: 120, isClaimed: true }, observedAt: daysAgo(2) },
    ]);
    await dbs.service.insert(review).values([
      rev('a', daysAgo(1), 'Thanks!'), rev('b', daysAgo(5)), rev('c', daysAgo(20)), rev('d', daysAgo(60), 'Thank you'), rev('e', daysAgo(200), 'Old'),
    ]);
    await dbs.service.insert(ad).values([
      gAd('g1', { active: true, firstSeen: daysAgo(10) }), gAd('g2', { active: true, firstSeen: daysAgo(100) }), gAd('g3', { active: false, firstSeen: daysAgo(5) }),
      gAd('m1', { active: true, firstSeen: daysAgo(3), platform: 'meta' }),
    ]);
    await dbs.service.insert(competitorSource).values([
      { competitorId: IDS.competitorY, source: 'ads_google', lastStatus: 'ok' },
      { competitorId: IDS.competitorY, source: 'ads_meta', lastStatus: 'ok' },
    ]);
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, name: 'Bright Smiles', placeId: 'p-y', appearances: 5, overlapScore: 0.7, overlap: 0.7 });

    const rows = await computeTrackedSignals(deps(), IDS.clientA2, NOW);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r).toMatchObject({ clientId: IDS.clientA2, agencyId: IDS.agencyA, competitorId: IDS.competitorY, overlap: 0.7, tier: 'top' });
    expect(r.signals).toMatchObject({
      rating: 4.6, votes: 120, claimed: true, reviews30d: 3, reviews90d: 4, replyRate: 0.5,
      googleAdsActive: 2, googleAdsNew30d: 2, googleAccount: 'matched', metaPage: 'none', metaAdsActive: 1, presence: null,
    });
    // 0.35·0.8 + 0.25·(1/3) + 0.3·(3/6) + 0.1·1
    expect(r.activity).toBeCloseTo(0.28 + 0.25 / 3 + 0.15 + 0.1, 5);
    const stored = await dbs.service.select().from(competitorSignal).where(eq(competitorSignal.clientId, IDS.clientA2));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ competitorId: IDS.competitorY, tier: 'top' });

    // Re-running upserts in place.
    await computeTrackedSignals(deps(), IDS.clientA2, NOW);
    expect(await dbs.service.select().from(competitorSignal).where(eq(competitorSignal.clientId, IDS.clientA2))).toHaveLength(1);
  });

  it('no ads source run → googleAdsActive null', async () => {
    const [r] = await computeTrackedSignals(deps(), IDS.clientA2, NOW);
    expect(r!.signals).toMatchObject({
      googleAdsActive: null, googleAdsNew30d: null, googleAccount: null, metaPage: null, metaAdsActive: null,
      rating: null, votes: null, claimed: null, reviews30d: null, reviews90d: null, replyRate: null,
    });
    expect(r).toMatchObject({ overlap: null, activity: null, tier: 'minor' });
  });

  it('last ads run vendor_error and no ad rows → googleAdsActive null', async () => {
    await dbs.service.insert(competitorSource).values({ competitorId: IDS.competitorY, source: 'ads_google', lastStatus: 'vendor_error' });
    const [r] = await computeTrackedSignals(deps(), IDS.clientA2, NOW);
    expect(r!.signals).toMatchObject({ googleAdsActive: null, googleAdsNew30d: null, googleAccount: null });
  });

  it('an ok ads run with no ads is zero, not null; collected reviews with none recent are zero', async () => {
    await dbs.service.insert(competitorSource).values({ competitorId: IDS.competitorY, source: 'ads_google', lastStatus: 'ok' });
    await dbs.service.insert(review).values(rev('old', daysAgo(300)));
    const [r] = await computeTrackedSignals(deps(), IDS.clientA2, NOW);
    expect(r!.signals).toMatchObject({ googleAdsActive: 0, googleAdsNew30d: 0, googleAccount: 'none', reviews30d: 0, reviews90d: 0, replyRate: null });
  });

  it('overlap falls back to presence in the latest rank snapshot set', async () => {
    const res = (rank: number, placeId: string | null) => ({ rank, placeId, cid: null, domain: null, title: 'x' });
    const [old] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, status: 'done', startedAt: daysAgo(40) }).returning();
    const [latest] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, status: 'done', startedAt: daysAgo(3) }).returning();
    const [running] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, status: 'running', startedAt: daysAgo(1) }).returning();
    const snap = (scanId: string, at: Date, results: ReturnType<typeof res>[]) => ({ agencyId: IDS.agencyA, clientId: IDS.clientA2, keyword: 'dentist', lat: 0, lng: 0, scanId, results, capturedAt: at });
    await dbs.service.insert(rankSnapshot).values([
      snap(old!.id, daysAgo(40), [res(1, 'p-y')]), snap(old!.id, daysAgo(40), [res(1, 'p-y')]),
      snap(latest!.id, daysAgo(3), [res(1, 'p-y'), res(2, 'p-z')]), snap(latest!.id, daysAgo(3), [res(1, 'p-z'), res(4, 'p-y')]),
      snap(latest!.id, daysAgo(3), [res(1, 'p-z')]), snap(latest!.id, daysAgo(3), []),
      snap(running!.id, daysAgo(1), [res(1, 'p-y')]), // unfinished scan: ignored
    ]);
    const [r] = await computeTrackedSignals(deps(), IDS.clientA2, NOW);
    // (w(1) + w(4)) / 4 = (1 + 0.5) / 4
    expect(r!.overlap).toBeCloseTo(0.375, 5);
    expect(r!.signals).toMatchObject({ presence: { searches: 4, appeared: 2, bestRank: 1 } });
    expect(r!.tier).toBe('watch');
  });

  it('deletes rows for competitors no longer tracked', async () => {
    await dbs.service.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX, tier: 'top', signals: {} });
    await computeTrackedSignals(deps(), IDS.clientA2, NOW);
    const rows = await dbs.service.select().from(competitorSignal).where(eq(competitorSignal.clientId, IDS.clientA2));
    expect(rows.map((r) => r.competitorId)).toEqual([IDS.competitorY]);
  });
});

describe('listSignalClients', () => {
  it('prospect clients skipped by signals-weekly', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect((await listSignalClients(dbs.service)).sort()).toEqual([IDS.clientA2, IDS.clientB1].sort());
  });

  it('skips a read_only or suspended agency; another agency still runs (9a)', async () => {
    await pauseAgency(dbs.owner, IDS.agencyA);
    expect(await listSignalClients(dbs.service)).toEqual([IDS.clientB1]);
    await pauseAgency(dbs.owner, IDS.agencyA, 'suspended');
    expect(await listSignalClients(dbs.service)).toEqual([IDS.clientB1]);
  });

  it('skips a paused client; its unpaused sibling still runs (9b)', async () => {
    await pauseClient(dbs.owner, IDS.clientA1);
    expect((await listSignalClients(dbs.service)).sort()).toEqual([IDS.clientA2, IDS.clientB1].sort());
  });
});
