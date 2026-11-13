import { sha256Hex } from '@cs/collectors';
import { ad, adImage, capture, changeEvent, client, clientCompetitor, detectedChange, eventScore, evidence, rankScan, review, stageRun, trackedPage } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AD_IMAGE_READ_STAGE, AD_IMAGE_SINCE, AD_IMAGE_TRIAGE_STAGE, adImageSubjectId } from './ads/images';
import { scoreEvent } from './score/score-stage';
import { MAX_STAGE_ATTEMPTS } from './stage';
import { findEngineWork } from './sweep';
import { createPackLoader } from './tag/tag-stage';
import { loadVerticalPack } from '@cs/verticals';
const generic = () => loadVerticalPack('generic');

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const PAGE = '00000000-0000-4000-8000-0000000000e1';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/', pageType: 'home', source: 'manual', cadence: 'daily' });
});

describe('findEngineWork', () => {
  it('finds undiffed ok web captures oldest first, skipping done, exhausted and non-web captures', async () => {
    await dbs.service.insert(capture).values([
      { id: id(1), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: new Date('2026-10-02') },
      { id: id(2), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: new Date('2026-10-01') },
      { id: id(3), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'unchanged', collectorVersion: 'web/1' },
      { id: id(4), competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1' },
      { id: id(5), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(6), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(7), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: new Date('2026-10-03') },
    ]);
    await dbs.service.insert(stageRun).values([
      { stage: 'web_diff', stageVersion: 1, subjectId: id(5), status: 'done' },
      { stage: 'web_diff', stageVersion: 1, subjectId: id(6), status: 'failed', attempts: MAX_STAGE_ATTEMPTS },
      { stage: 'web_diff', stageVersion: 1, subjectId: id(7), status: 'failed', attempts: 1 },
    ]);
    expect((await findEngineWork(dbs.service, { limit: 10 })).diff).toEqual([id(2), id(1), id(7)]);
    expect((await findEngineWork(dbs.service, { limit: 10, competitorId: IDS.competitorY })).diff).toEqual([]);
  });

  it('backs off a failed run exponentially (30 * 2^(attempts-1) minutes) from finished_at, oldest first', async () => {
    await dbs.service.insert(capture).values([
      { id: id(1), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(2), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
      { id: id(3), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' },
    ]);
    await dbs.service.insert(stageRun).values([
      // attempts 1, finished just now: within the 30-minute backoff — not yet eligible.
      { stage: 'web_diff', stageVersion: 1, subjectId: id(1), status: 'failed', attempts: 1, finishedAt: new Date() },
      // attempts 1, finished 31 minutes ago: past the 30-minute backoff — eligible again.
      { stage: 'web_diff', stageVersion: 1, subjectId: id(2), status: 'failed', attempts: 1, finishedAt: minutesAgo(31) },
      // attempts 2, finished 31 minutes ago: backoff is 60 minutes — not yet eligible.
      { stage: 'web_diff', stageVersion: 1, subjectId: id(3), status: 'failed', attempts: 2, finishedAt: minutesAgo(31) },
    ]);
    expect((await findEngineWork(dbs.service, { limit: 10 })).diff).toEqual([id(2)]);
  });

  it('finds pending changes and events missing a client score', async () => {
    await dbs.service.insert(capture).values({ id: id(1), competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1' });
    await dbs.service.insert(detectedChange).values([
      { id: id(11), competitorId: IDS.competitorX, source: 'web', kind: 'added', afterCaptureId: id(1), blockKey: 'p#0', stageVersion: 1 },
      { id: id(12), competitorId: IDS.competitorX, source: 'web', kind: 'added', afterCaptureId: id(1), blockKey: 'p#1', stageVersion: 1, status: 'event' },
    ]);
    await dbs.service.insert(stageRun).values({ stage: 'web_diff', stageVersion: 1, subjectId: id(1), status: 'done' });
    await dbs.service.insert(changeEvent).values([
      { id: id(21), competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date() },
      // Old on both counts (occurred and created long ago): outside the window itself, and the client link
      // (seeded "now") is not late enough to need the lookback path either since occurredAt is also old.
      { id: id(22), competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date('2025-01-01'), createdAt: new Date('2025-01-01') },
    ]);
    const factors = { typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 1 };
    await dbs.service.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: id(21), score: 1, route: 'archive', factors, packVersion: 1 });
    const w = await findEngineWork(dbs.service, { limit: 10 });
    expect(w).toEqual({ diff: [], tag: [id(11)], score: [id(21)], rankDiff: [], reviews: [], prices: [id(1)], adPrices: [], postPrices: [], siteFeatures: [], listedEvents: [], reask: [], adImages: [], adImageReads: [] }); // B1 still lacks a score for 21; 22 is outside the window
  });

  it('google_ads capture before AD_IMAGE_SINCE is not listed for ad prices', async () => {
    const [row] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1', capturedAt: new Date(AD_IMAGE_SINCE.getTime() - 3_600_000) }).returning({ id: capture.id });
    expect((await findEngineWork(dbs.service, { limit: 50 })).adPrices).not.toContain(row!.id);
  });

  // The settle delay compares with the database clock, so the test passes a past cutoff through the adImageSince seam.
  it('google_ads capture from AD_IMAGE_SINCE listed, earlier not', async () => {
    const since = new Date(Date.now() - 86_400_000);
    const mk = async (capturedAt: Date) => (await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1', capturedAt }).returning({ id: capture.id }))[0]!.id;
    const early = await mk(new Date(since.getTime() - 3_600_000));
    const from = await mk(new Date(since.getTime() + 60_000));
    const w = await findEngineWork(dbs.service, { limit: 50, adImageSince: since });
    expect(w.adPrices).toContain(from);
    expect(w.adPrices).not.toContain(early);
  });

  it('offers settled vendor captures of sources that have a differ, and nothing else', async () => {
    const mk = async (source: string, minutesAgo: number) => {
      const [row] = await dbs.service
        .insert(capture)
        .values({ competitorId: IDS.competitorX, source, status: 'ok', collectorVersion: 'test/1', capturedAt: new Date(Date.now() - minutesAgo * 60_000) })
        .returning({ id: capture.id });
      return row!.id;
    };
    const settled = await mk('meta_ads', 15);
    const fresh = await mk('meta_ads', 2);
    const unknown = await mk('instagram', 15);
    const w = await findEngineWork(dbs.service, { limit: 50 });
    expect(w.diff).toContain(settled);
    expect(w.diff).not.toContain(fresh);
    expect(w.diff).not.toContain(unknown);
  });

  it('offers a tenant event for scoring only while its own client lacks a score', async () => {
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, agencyId: IDS.agencyA, clientId: IDS.clientA1, changeType: 'rank_change', summary: 'r', confidence: 1, occurredAt: new Date() })
      .returning({ id: changeEvent.id });
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).toContain(ev!.id);
    await scoreEvent({ db: dbs.service, generic, packs: createPackLoader() }, ev!.id);
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).not.toContain(ev!.id); // B1 tracks X but is not owed this score
  });

  it('agrees with analyzeReview\'s JS trim on whitespace-only padding ("ok" + newlines), not bare SQL btrim (spaces only)', async () => {
    const [r] = await dbs.service
      .insert(review)
      .values({ competitorId: IDS.competitorX, dedupeKey: 'd1', text: 'ok\n\n\n\n\n\n\n\n', postedAt: new Date() })
      .returning({ id: review.id });
    // length('ok\n\n\n\n\n\n\n\n') is 10 (>= MIN_REVIEW_CHARS), but there are no leading/trailing spaces for bare
    // btrim to strip, so a naive `length(btrim(r.text)) >= 10` check would offer this review; JS `.trim()`
    // (what analyzeReview itself checks) strips the newlines too, leaving "ok" (2 chars) — never offer it.
    expect((await findEngineWork(dbs.service, { limit: 50 })).reviews).not.toContain(r!.id);
  });

  it('does not offer a complaint spike to clients of another vertical (3c carry-over)', async () => {
    // A2 is dental and tracks Y; a hvac complaint spike on Y has no hvac client to score it for.
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorY, changeType: 'review_spike', summary: 's', confidence: 1, occurredAt: new Date(), details: { verticalId: 'hvac_plumbing', topic: 'response_time' } })
      .returning({ id: changeEvent.id });
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(ev!.id);
  });

  it('offers recent history to a newly linked client, but not events older than the lookback', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const ancient = new Date(Date.now() - 120 * 86_400_000);
    const [recentish] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorY, changeType: 'promo', summary: 's', confidence: 1, occurredAt: old, createdAt: old }).returning({ id: changeEvent.id });
    const [tooOld] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorY, changeType: 'promo', summary: 's', confidence: 1, occurredAt: ancient, createdAt: ancient }).returning({ id: changeEvent.id });
    await dbs.owner.update(clientCompetitor).set({ createdAt: old }).where(eq(clientCompetitor.competitorId, IDS.competitorY));
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(recentish!.id); // link is old too
    await dbs.owner.update(clientCompetitor).set({ createdAt: new Date() }).where(eq(clientCompetitor.competitorId, IDS.competitorY));
    const work = (await findEngineWork(dbs.service, { limit: 10 })).score;
    expect(work).toContain(recentish!.id);
    expect(work).not.toContain(tooOld!.id);
  });

  it('offers rank scans of active clients only, and picks up a converted prospect’s scan (5b-2 decision 9)', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    const done = { status: 'done', startedAt: minutesAgo(10), finishedAt: minutesAgo(5) } as const;
    const [active] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyA, clientId: IDS.clientA1 }).returning({ id: rankScan.id });
    const [prospect] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyA, clientId: IDS.clientA2 }).returning({ id: rankScan.id });
    expect((await findEngineWork(dbs.service, { limit: 10 })).rankDiff).toEqual([active!.id]);
    await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientA2));
    expect((await findEngineWork(dbs.service, { limit: 10 })).rankDiff.sort()).toEqual([active!.id, prospect!.id].sort());
  });
});

describe('findEngineWork and billing state (9a)', () => {
  it('offers no score or rank-diff work for a read_only agency’s clients; other agencies are still served', async () => {
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await dbs.service.insert(changeEvent).values({ id: id(31), competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date() });
    const done = { status: 'done', startedAt: minutesAgo(10), finishedAt: minutesAgo(5) } as const;
    const [scanA] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyA, clientId: IDS.clientA1 }).returning({ id: rankScan.id });
    const [scanB] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyB, clientId: IDS.clientB1 }).returning({ id: rankScan.id });
    await pauseAgency(dbs.owner, IDS.agencyA);
    const w = await findEngineWork(dbs.service, { limit: 10 });
    expect(w.rankDiff).toEqual([scanB!.id]); // B has no billing row
    expect(w.score).toContain(id(31)); // still offered through agency B's client
    await pauseAgency(dbs.owner, IDS.agencyB, 'suspended');
    const paused = await findEngineWork(dbs.service, { limit: 10 });
    expect(paused.score).not.toContain(id(31));
    expect(paused.rankDiff).not.toContain(scanA!.id);
    expect(paused.rankDiff).toEqual([]);
  });
});

describe('findEngineWork and a paused client (9b)', () => {
  it('offers no score or rank-diff work for paused clients', async () => {
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await dbs.service.insert(changeEvent).values({ id: id(32), competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date() });
    const done = { status: 'done', startedAt: minutesAgo(10), finishedAt: minutesAgo(5) } as const;
    const [scanA] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyA, clientId: IDS.clientA1 }).returning({ id: rankScan.id });
    const [scanB] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyB, clientId: IDS.clientB1 }).returning({ id: rankScan.id });
    await pauseClient(dbs.owner, IDS.clientA1);
    const w = await findEngineWork(dbs.service, { limit: 10 });
    expect(w.rankDiff).toEqual([scanB!.id]);
    expect(w.score).toContain(id(32));
    await pauseClient(dbs.owner, IDS.clientB1);
    await pauseClient(dbs.owner, IDS.clientA2);
    const paused = await findEngineWork(dbs.service, { limit: 10 });
    expect(paused.score).not.toContain(id(32));
    expect(paused.rankDiff).not.toContain(scanA!.id);
    expect(paused.rankDiff).toEqual([]);
  });
});

describe('findEngineWork and a spend-paused client (7b1)', () => {
  it('offers no score or rank-diff work when every tracker is spend-paused; a workable tracker keeps it offered', async () => {
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await dbs.service.insert(changeEvent).values({ id: id(33), competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 1, occurredAt: new Date() });
    const done = { status: 'done', startedAt: minutesAgo(10), finishedAt: minutesAgo(5) } as const;
    const [scanA] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyA, clientId: IDS.clientA1 }).returning({ id: rankScan.id });
    const [scanB] = await dbs.service.insert(rankScan).values({ ...done, agencyId: IDS.agencyB, clientId: IDS.clientB1 }).returning({ id: rankScan.id });
    await spendPauseClient(dbs.owner, IDS.clientA1);
    const w = await findEngineWork(dbs.service, { limit: 10 });
    expect(w.rankDiff).toEqual([scanB!.id]);
    expect(w.score).toContain(id(33));
    await spendPauseClient(dbs.owner, IDS.clientB1);
    await spendPauseClient(dbs.owner, IDS.clientA2);
    const paused = await findEngineWork(dbs.service, { limit: 10 });
    expect(paused.score).not.toContain(id(33));
    expect(paused.rankDiff).not.toContain(scanA!.id);
    expect(paused.rankDiff).toEqual([]);
  });
});

describe('findEngineWork ad images (18a-3 R2, R12)', () => {
  const SINCE = new Date('2026-01-01T00:00:00Z');
  const imgUrl = () => `https://tpc.googlesyndication.com/simgad/${randomUUID()}`;
  const work = (o: { limit?: number } = {}) => findEngineWork(dbs.service, { limit: 50, adImages: true, adImageSince: SINCE, ...o });
  async function gad(over: Partial<typeof ad.$inferInsert> = {}) {
    const [a] = await dbs.service
      .insert(ad)
      .values({ competitorId: IDS.competitorX, platform: 'google', externalId: `CR${randomUUID()}`, format: 'image', mediaUrls: [imgUrl()], isActive: true, firstSeenAt: minutesAgo(60), ...over })
      .returning();
    return a!;
  }
  async function image(a: typeof ad.$inferSelect, over: Partial<typeof adImage.$inferInsert> = {}) {
    const [row] = await dbs.service.insert(adImage).values({ adId: a.id, competitorId: a.competitorId, sourceUrlSha: sha256Hex(a.mediaUrls[0] ?? ''), ...over }).returning();
    return row!;
  }
  /** A triaged, stored price image waiting for its read. */
  async function readable(over: { adOver?: Partial<typeof ad.$inferInsert>; image?: Partial<typeof adImage.$inferInsert> } = {}) {
    const [gcap] = await dbs.service.insert(capture).values({ competitorId: over.adOver?.competitorId ?? IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1' }).returning();
    const a = await gad({ lastCaptureId: gcap!.id, ...over.adOver });
    const [cap] = await dbs.service.insert(capture).values({ competitorId: a.competitorId, source: 'ad_image', status: 'ok', collectorVersion: 'ad-image/1' }).returning();
    const [ev] = await dbs.service
      .insert(evidence)
      .values({ captureId: cap!.id, kind: 'image', objectKey: `k/${cap!.id}`, sha256: 'e'.repeat(64), bytes: 10, contentType: 'image/webp' })
      .returning();
    return image(a, {
      status: 'triaged', showsPerson: false, showsPrice: true, showsOffer: false, sourceSha256: sha256Hex(randomUUID()), evidenceId: ev!.id, triagedAt: minutesAgo(30), ...over.image,
    });
  }

  it('switch off ⇒ both lists empty', async () => {
    const a = await gad();
    const img = await readable();
    const off = await findEngineWork(dbs.service, { limit: 50, adImageSince: SINCE });
    expect([off.adImages, off.adImageReads]).toEqual([[], []]);
    const on = await work();
    expect(on.adImages).toContain(a.id);
    expect(on.adImageReads).toEqual([img.id]);
  });

  it('candidate rules (video, old, inactive, prospect, finished, rotated URL ⇒ listed again)', async () => {
    const ok = await gad({ firstSeenAt: minutesAgo(90) });
    const nullFormat = await gad({ format: null, firstSeenAt: minutesAgo(80) });
    const video = await gad({ format: 'video' });
    const old = await gad({ firstSeenAt: new Date(SINCE.getTime() - 3_600_000) });
    const unsettled = await gad({ firstSeenAt: minutesAgo(2) });
    const inactive = await gad({ isActive: false });
    const meta = await gad({ platform: 'meta' });
    const noUrl = await gad({ mediaUrls: [] });
    const dataUrl = await gad({ mediaUrls: ['data:image/png;base64,AAAA'] });
    // A2 (made a prospect below) is Y's only tracker.
    const prospect = await gad({ competitorId: IDS.competitorY });
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    const triaged = await gad();
    await image(triaged, { status: 'triaged', showsPerson: true });
    const rejected = await gad();
    await image(rejected, { status: 'rejected', failReason: 'expired' });
    const pendingDone = await gad();
    const pd = await image(pendingDone);
    await dbs.service.insert(stageRun).values({ stage: AD_IMAGE_TRIAGE_STAGE, stageVersion: 1, subjectId: adImageSubjectId(pd.id, pd.sourceUrlSha), status: 'done' });
    const pendingFresh = await gad({ firstSeenAt: minutesAgo(70) });
    await image(pendingFresh); // seeded, never finished ⇒ still a candidate
    // The image URL rotated: the old URL's row is final, the new URL has none.
    const rotated = await gad({ firstSeenAt: minutesAgo(65) });
    await dbs.service
      .insert(adImage)
      .values({ adId: rotated.id, competitorId: rotated.competitorId, sourceUrlSha: sha256Hex('https://tpc.googlesyndication.com/simgad/old'), status: 'rejected', failReason: 'expired' });

    const w = await work();
    expect(w.adImages).toEqual([ok.id, nullFormat.id, pendingFresh.id, rotated.id]);
    for (const a of [video, old, unsettled, inactive, meta, noUrl, dataUrl, prospect, triaged, rejected, pendingDone]) expect(w.adImages).not.toContain(a.id);
    expect((await work({ limit: 2 })).adImages).toEqual([ok.id, nullFormat.id]);
  });

  it('a pending row whose triage failed within the backoff window is not listed; past it, listed again', async () => {
    const waiting = await gad();
    const w1 = await image(waiting);
    const due = await gad();
    const w2 = await image(due);
    await dbs.service.insert(stageRun).values([
      { stage: AD_IMAGE_TRIAGE_STAGE, stageVersion: 1, subjectId: adImageSubjectId(w1.id, w1.sourceUrlSha), status: 'failed', attempts: 1, finishedAt: new Date() },
      { stage: AD_IMAGE_TRIAGE_STAGE, stageVersion: 1, subjectId: adImageSubjectId(w2.id, w2.sourceUrlSha), status: 'failed', attempts: 1, finishedAt: minutesAgo(31) },
    ]);
    expect((await work()).adImages).toEqual([due.id]);
  });

  it('SQL sha = sha256Hex', async () => {
    const url = 'https://tpc.googlesyndication.com/simgad/ünï?x=1&y=€ 2#f';
    const [row] = (await dbs.service.execute(sql`SELECT encode(sha256(convert_to(${url}::text, 'UTF8')), 'hex') AS h`)) as unknown as { h: string }[];
    expect(row!.h).toBe(sha256Hex(url));
    // Through the sweep: a final row keyed by sha256Hex(url) excludes the ad.
    const a = await gad({ mediaUrls: [url] });
    expect((await work()).adImages).toContain(a.id);
    await image(a, { status: 'rejected', failReason: 'bad_type' });
    expect((await work()).adImages).not.toContain(a.id);
  });

  it('read candidates: triaged stored price images of active ads, no twin, not finished, oldest triaged first', async () => {
    const first = await readable({ image: { triagedAt: minutesAgo(50) } });
    const second = await readable({ image: { triagedAt: minutesAgo(40) } });
    const noPrice = await readable({ image: { showsPrice: false, showsOffer: true } });
    const done = await readable({ image: { readStatus: 'no_price', readAt: new Date() } });
    const inactive = await readable({ adOver: { isActive: false } });
    const unlisted = await readable({ adOver: { lastCaptureId: null } });
    const finished = await readable();
    await dbs.service
      .insert(stageRun)
      .values({ stage: AD_IMAGE_READ_STAGE, stageVersion: 1, subjectId: adImageSubjectId(finished.id, finished.sourceUrlSha), status: 'failed', attempts: 1, finishedAt: new Date() });
    // P7: a same-ad twin with the same bytes was already read.
    const twin = await readable();
    await dbs.service
      .insert(adImage)
      .values({ adId: twin.adId, competitorId: twin.competitorId, sourceUrlSha: sha256Hex('other'), status: 'triaged', sourceSha256: twin.sourceSha256, readStatus: 'read', readAt: minutesAgo(5) });
    const w = await work();
    expect(w.adImageReads).toEqual([first.id, second.id]);
    for (const r of [noPrice, done, inactive, unlisted, finished, twin]) expect(w.adImageReads).not.toContain(r.id);
  });

  it('read cap excludes, second tracker re-opens', async () => {
    // A1 also tracks Y; 20 reads on Y fill A1's week. B1 tracks only X and is paused at first.
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorY });
    for (let i = 0; i < 20; i++) {
      const a = await gad({ competitorId: IDS.competitorY, mediaUrls: [] });
      await dbs.service.insert(adImage).values({ adId: a.id, competitorId: IDS.competitorY, sourceUrlSha: sha256Hex(String(i)), status: 'triaged', readStatus: 'read', readAt: new Date() });
    }
    await pauseClient(dbs.owner, IDS.clientA2);
    await pauseClient(dbs.owner, IDS.clientB1);
    const img = await readable();
    expect((await work()).adImageReads).toEqual([]);
    await dbs.owner.update(client).set({ pausedAt: null, pausedBy: null }).where(eq(client.id, IDS.clientB1));
    expect((await work()).adImageReads).toEqual([img.id]);
  });
});
