import { ad, capture, citationListing, socialAccount, socialPost, gbpPost, listedEvent, stageRun, client, clientCompetitor, competitor, competitorSignal, evidence, observation, rankScan, rankSnapshot, review, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadVerticalPack } from '@cs/verticals';
import { createPackLoader } from '../tag/tag-stage';
import { postCounts30d } from '../structured/gbp-posts';
import { GBP_EVENTS_URL } from '@cs/collectors';
import { LISTED_EVENTS_STAGE, LISTED_EVENTS_VERSION } from '../listed-events/stage';
import { buildScorecard, median, Scorecard } from './scorecard';
import { scorecardModel } from './scorecard-model';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const base = createPackLoader();
/** Directory definitions live in generic.yaml (DB packs inherit them); the file loader does not, so graft them on. */
const packs = async (id: string) => { const [p, g] = await Promise.all([base(id), loadVerticalPack('generic')]); return { ...p, citations: { ...p.citations, directory_groups: g.citations.directory_groups } }; };
const deps = () => ({ db: dbs.service, packs });
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
    expect(row('A1 HVAC')).toEqual({ rating: null, reviews90d: 2, replyRate: 0.5, mapTop3Share: 0.5, adsActive: null, metaAdsActive: null, googlePosts30d: null, listings: null, upcomingEvents: null, tripadvisorRating: null, socialPosts30d: null });
    expect(row('Rival A')).toEqual({ rating: null, reviews90d: 1, replyRate: 1, mapTop3Share: 0.5, adsActive: 3, metaAdsActive: null, googlePosts30d: null, listings: null, upcomingEvents: null, tripadvisorRating: null, socialPosts30d: null });
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

describe('Google posts (30 days)', () => {
  const postsCapture = async (competitorId: string) => {
    const [c] = await dbs.owner.insert(capture).values({ competitorId, source: 'google_business_profile', url: 'gbp:posts', status: 'ok', collectorVersion: 't', capturedAt: ago(1) }).returning();
    const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
    return { captureId: c!.id, evidenceId: e!.id };
  };
  const post = (competitorId: string, captureId: string, postedAt: Date | null, firstSeenAt: Date, extra: Record<string, unknown> = {}) =>
    dbs.owner.insert(gbpPost).values({ competitorId, externalId: randomUUID(), postedAt, firstCaptureId: captureId, lastCaptureId: captureId, firstSeenAt, lastSeenAt: firstSeenAt, ...extra });

  it('you 3, rival 0, unchecked rival null; 31-day-old not counted; null posted_at counted by first_seen_at; ended counts', async () => {
    const r0 = await addRival('Rival Zero', 'top');
    const r1 = await addRival('Rival Unchecked', 'watch');
    const me = await postsCapture(selfId);
    const z = await postsCapture(r0);
    await post(selfId, me.captureId, ago(2), ago(2));
    await post(selfId, me.captureId, null, ago(5));
    await post(selfId, me.captureId, ago(10), ago(10), { endedAt: ago(3), endedCaptureId: me.captureId });
    await post(selfId, me.captureId, ago(31), ago(31));
    await post(selfId, me.captureId, null, ago(40));
    const counts = await postCounts30d(dbs.service, [selfId, r0, r1], NOW);
    expect([counts.get(selfId), counts.get(r0), counts.get(r1)]).toEqual([3, 0, null]);
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    const v = (n: string) => sc.rows.find((r) => r.name === n)!.values.googlePosts30d;
    expect([v('A1 HVAC'), v('Rival Zero'), v('Rival Unchecked')]).toEqual([3, 0, null]);
    expect(sc.tiles).toHaveLength(4);
    expect(sc.evidenceIds).toEqual(expect.arrayContaining([me.evidenceId, z.evidenceId]));
  });

  it('a scorecard stored before 18b (no googlePosts30d) still parses', async () => {
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    const old = JSON.parse(JSON.stringify(sc));
    for (const r of old.rows) delete r.values.googlePosts30d;
    const parsed = Scorecard.parse(old);
    expect(parsed.rows[0]!.values.googlePosts30d).toBeNull();
  });
});

describe('Directory listings (18c-2 D3)', () => {
  const row = (competitorId: string, host: string, status: 'listed' | 'not_found' | 'not_checked', inCatalogue = true) =>
    dbs.owner.insert(citationListing).values({ competitorId, host, status, inCatalogue, checkedAt: NOW });

  it('counts only in-catalogue listed rows per business; never audited is null; audited with none listed is 0', async () => {
    const audited = await addRival('Rival Audited', 'top');
    const none = await addRival('Rival None', 'watch');
    const never = await addRival('Rival Never', 'minor');
    await row(selfId, 'facebook.com', 'listed');
    await row(selfId, 'bbb.org', 'listed');
    await row(selfId, 'angi.com', 'not_found');
    await row(selfId, 'houzz.com', 'listed', false);
    await row(audited, 'facebook.com', 'listed');
    await row(none, 'facebook.com', 'not_found');
    await row(none, 'bbb.org', 'not_checked');
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    const v = (n: string) => sc.rows.find((r) => r.name === n)!.values.listings;
    expect([v('A1 HVAC'), v('Rival Audited'), v('Rival None'), v('Rival Never')]).toEqual([2, 1, 0, null]);
    expect(never).toBeTruthy();
  });

  it('only counts hosts in the client catalogue and never banned hosts', async () => {
    await row(selfId, 'facebook.com', 'listed');
    await row(selfId, 'findadentist.ada.org', 'listed'); // dental host: not in the HVAC client's catalogue
    await row(selfId, 'yelp.com', 'listed'); // banned
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    expect(sc.rows.find((r) => r.self)!.values.listings).toBe(1);
  });

  it('evidence ids include the evidence of a counted listing, not of an uncounted one', async () => {
    const mk = async () => {
      const [c] = await dbs.owner.insert(capture).values({ competitorId: selfId, source: 'citation_audit', status: 'ok', collectorVersion: 't' }).returning();
      const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
      return { captureId: c!.id, evidenceId: e!.id };
    };
    const counted = await mk();
    const uncounted = await mk();
    await dbs.owner.insert(citationListing).values({ competitorId: selfId, host: 'facebook.com', status: 'listed', captureId: counted.captureId, checkedAt: NOW });
    await dbs.owner.insert(citationListing).values({ competitorId: selfId, host: 'bbb.org', status: 'not_found', captureId: uncounted.captureId, checkedAt: NOW });
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    expect(sc.evidenceIds).toContain(counted.evidenceId);
    expect(sc.evidenceIds).not.toContain(uncounted.evidenceId);
  });

  it('a scorecard stored before 18c-2 (no listings) still parses as null', async () => {
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    const old = JSON.parse(JSON.stringify(sc));
    for (const r of old.rows) delete r.values.listings;
    expect(Scorecard.parse(old).rows[0]!.values.listings).toBeNull();
  });
});

describe('Events listed and Tripadvisor rating (18d)', () => {
  const vendorCapture = async (competitorId: string, source: string, url: string | null, capturedAt: Date) => {
    const [c] = await dbs.owner.insert(capture).values({ competitorId, source, url, status: 'ok', collectorVersion: 't', capturedAt }).returning();
    const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
    return { captureId: c!.id, evidenceId: e!.id };
  };
  const panel = async (competitorId: string) => {
    const c = await vendorCapture(competitorId, 'google_business_profile', GBP_EVENTS_URL, ago(1));
    await dbs.owner.insert(stageRun).values({ stage: LISTED_EVENTS_STAGE, stageVersion: LISTED_EVENTS_VERSION, subjectId: c.captureId, status: 'done' });
    return c;
  };
  const event = (competitorId: string, captureId: string, firstSeenAt: Date) =>
    dbs.owner.insert(listedEvent).values({ competitorId, eventKey: randomUUID(), name: 'Jazz', nameNorm: 'jazz', startDate: '2026-11-01', sources: ['google_panel'], firstCaptureId: captureId, lastCaptureId: captureId, firstSeenAt, lastSeenAt: firstSeenAt });
  const tripadvisor = async (competitorId: string, rating: number | null, at: Date) => {
    const c = await vendorCapture(competitorId, 'tripadvisor', null, at);
    if (rating !== null) await dbs.owner.insert(observation).values({ competitorId, captureId: c.captureId, kind: 'tripadvisor', key: 'rating', observedAt: at, data: { id: 't1', url: 'https://www.tripadvisor.com/x', title: 'X', rating, reviews: 10 } });
    return c;
  };

  it('fills events counts (measured only) with their evidence, and the latest Tripadvisor rating', async () => {
    const r = await addRival('Rival Venue', 'top');
    const me = await panel(selfId);
    const theirs = await panel(r);
    await event(r, theirs.captureId, ago(2));
    await event(r, theirs.captureId, ago(3));
    const stale = await addRival('Rival Stale', 'watch');
    await tripadvisor(stale, 4.8, ago(22)); // older than 21 days: no longer shown
    await tripadvisor(r, 4.0, ago(9));
    const ta = await tripadvisor(r, 4.5, ago(2));
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    const v = (n: string) => sc.rows.find((x) => x.name === n)!.values;
    expect([v('A1 HVAC').upcomingEvents, v('Rival Venue').upcomingEvents, v('Smith HVAC').upcomingEvents]).toEqual([0, 2, null]);
    expect([v('A1 HVAC').tripadvisorRating, v('Rival Venue').tripadvisorRating, v('Rival Stale').tripadvisorRating]).toEqual([null, 4.5, null]);
    expect(sc.evidenceIds).toEqual(expect.arrayContaining([me.evidenceId, theirs.evidenceId, ta.evidenceId]));
    expect(scorecardModel(sc, { clientName: 'A1 HVAC' }).table.headers.slice(-2)).toEqual(['Upcoming events', 'Tripadvisor rating']);
  });

  it('tripadvisorRating null when unmatched, column dropped', async () => {
    const r = await addRival('Rival Unmatched', 'top');
    await tripadvisor(r, null, ago(1)); // no exactly-one match: capture without an observation
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    expect(sc.rows.every((x) => x.values.tripadvisorRating === null && x.values.upcomingEvents === null)).toBe(true);
    const headers = scorecardModel(sc, { clientName: 'A1 HVAC' }).table.headers;
    expect(headers).not.toContain('Tripadvisor rating');
    expect(headers).not.toContain('Upcoming events');
  });

  it('a scorecard stored before 18d (no events/Tripadvisor keys) still parses as null', async () => {
    const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
    const old = JSON.parse(JSON.stringify(sc));
    for (const r of old.rows) { delete r.values.upcomingEvents; delete r.values.tripadvisorRating; }
    const parsed = Scorecard.parse(old);
    expect([parsed.rows[0]!.values.upcomingEvents, parsed.rows[0]!.values.tripadvisorRating]).toEqual([null, null]);
  });

  describe('socialPosts30d (18e)', () => {
    const account = (competitorId: string, status: 'confirmed' | 'suggested' | 'rejected', handle = 'acme', gated = false) =>
      dbs.owner.insert(socialAccount).values({ competitorId, network: 'facebook', handle, url: `https://facebook.com/${handle}`, status, gated });
    const posts = async (competitorId: string, n: number, handle = 'acme', daysAgo = 3) => {
      const c = await vendorCapture(competitorId, 'social', `social:facebook:${handle}`, ago(1));
      for (let i = 0; i < n; i++) {
        await dbs.owner.insert(socialPost).values({ competitorId, network: 'facebook', postId: randomUUID(), postedAt: ago(daysAgo + i), text: 't', url: 'https://fb.example/p', firstCaptureId: c.captureId, firstSeenAt: ago(1) });
      }
      return c;
    };

    it('suggested account never counted in socialPosts30d', async () => {
      const r = await addRival('Rival Social', 'top');
      await account(r, 'suggested');
      await posts(r, 5);
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
      expect(sc.rows.find((x) => x.name === 'Rival Social')!.values.socialPosts30d).toBeNull();
    });

    it('counts confirmed-account posts of the last 30 days; a confirmed account with none is 0', async () => {
      const r = await addRival('Rival Social', 'top');
      await account(r, 'confirmed');
      const cap = await posts(r, 4, 'acme', 2);
      await dbs.owner.insert(socialPost).values({ competitorId: r, network: 'facebook', postId: 'old', postedAt: ago(40), text: 't', url: 'u', firstCaptureId: cap.captureId, firstSeenAt: ago(1) });
      await account(selfId, 'confirmed', 'me');
      await vendorCapture(selfId, 'social', 'social:facebook:me', ago(2));
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
      const v = (n: string) => sc.rows.find((x) => x.name === n)!.values;
      expect([v('Rival Social').socialPosts30d, v('A1 HVAC').socialPosts30d]).toEqual([4, 0]);
      expect(sc.evidenceIds).toContain(cap.evidenceId);
      expect(scorecardModel(sc, { clientName: 'A1 HVAC' }).table.headers).toContain('Social posts (30 days)');
    });

    it('rejected account capture never cited', async () => {
      const r = await addRival('Rival Social', 'top');
      await account(r, 'rejected', 'wrong');
      await account(r, 'confirmed', 'right');
      const wrong = await posts(r, 2, 'wrong');
      const right = await posts(r, 2, 'right');
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
      expect(sc.evidenceIds).toContain(right.evidenceId);
      expect(sc.evidenceIds).not.toContain(wrong.evidenceId);
    });

    it('a confirmed self account never pulled is null, and social_gap cannot cite it (I2)', async () => {
      await account(selfId, 'confirmed', 'me');
      const r = await addRival('Rival Social', 'top');
      await account(r, 'confirmed');
      await posts(r, 5);
      let ev: Record<string, string[]> = {};
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW, onSocialEvidence: (e) => { ev = e; } });
      expect(sc.rows.find((x) => x.name === 'A1 HVAC')!.values.socialPosts30d).toBeNull();
      expect(ev[selfId]).toBeUndefined();
    });

    it('a pull older than 8 days is stale → null', async () => {
      const r = await addRival('Rival Social', 'top');
      await account(r, 'confirmed');
      await vendorCapture(r, 'social', 'social:facebook:acme', ago(9));
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
      expect(sc.rows.find((x) => x.name === 'Rival Social')!.values.socialPosts30d).toBeNull();
    });

    it('a gated account is null and never cited (I2)', async () => {
      const r = await addRival('Rival Social', 'top');
      await account(r, 'confirmed', 'acme', true);
      const cap = await posts(r, 5);
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
      expect(sc.rows.find((x) => x.name === 'Rival Social')!.values.socialPosts30d).toBeNull();
      expect(sc.evidenceIds).not.toContain(cap.evidenceId);
    });

    it('no confirmed account → null, column dropped', async () => {
      await addRival('Rival Quiet', 'top');
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
      expect(sc.rows.every((x) => x.values.socialPosts30d === null)).toBe(true);
      expect(scorecardModel(sc, { clientName: 'A1 HVAC' }).table.headers).not.toContain('Social posts (30 days)');
    });

    it('a scorecard stored before 18e (no socialPosts30d key) still parses as null', async () => {
      const sc = await buildScorecard(deps(), IDS.clientA1, { now: NOW });
      const old = JSON.parse(JSON.stringify(sc));
      for (const r of old.rows) delete r.values.socialPosts30d;
      expect(Scorecard.parse(old).rows[0]!.values.socialPosts30d).toBeNull();
    });
  });
});
