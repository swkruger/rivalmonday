import { type FetchBytes, HostRateLimiter, type RobotsPolicy, sha256Hex } from '@cs/collectors';
import { ad, adImage, capture, changeEvent, detectedChange, eventScore, evidence } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, tagResult } from '../test/fake-ai';
import { day, fixture, seedPage, seedWebCapture } from '../test/seed';
import { drainEngine } from './drain';
import { createPackLoader } from './tag/tag-stage';
import { loadVerticalPack } from '@cs/verticals';
const generic = () => loadVerticalPack('generic');

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('drainEngine', () => {
  it('runs capture → diff → tag → score end to end and then finds nothing left', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v1.html'), capturedAt: day(0) });
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v2.html'), capturedAt: day(1) });
    const ai = createFakeAi({ decide: tagResult({ meaningful: true, type: 'price_change', services: { hvac_plumbing: 'ac_tune_up' } }) });
    const deps = { db: dbs.service, store, ai, packs: createPackLoader(), generic };
    // The first capture has a successor, so site_features baselines it (no tools in the fixtures, no change).
    // The HVAC fixtures each have one priced block (the AC tune-up), so the drain also runs price_extract
    // on both captures: $89 opens a span, then $69 ends it and opens a new one (2 price points).
    expect(await drainEngine(deps)).toEqual({ diffs: 2, changes: 1, tagged: 1, events: 1, scored: 2, rankDiffs: 0, reviews: 0, prices: 2, adPrices: 0, siteFeatures: 1, reasked: 0, adImages: 0, adImageReads: 0, errors: 0 });
    expect(await dbs.owner.select().from(changeEvent)).toHaveLength(1);
    expect(await dbs.owner.select().from(eventScore)).toHaveLength(2);
    expect(await drainEngine(deps)).toEqual({ diffs: 0, changes: 0, tagged: 0, events: 0, scored: 0, rankDiffs: 0, reviews: 0, prices: 0, adPrices: 0, siteFeatures: 0, reasked: 0, adImages: 0, adImageReads: 0, errors: 0 });
  });

  it('counts errors and keeps going when tagging fails, then backs off instead of retrying immediately', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v1.html'), capturedAt: day(0) });
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v2.html'), capturedAt: day(1) });
    const ai = createFakeAi({ decide: () => { throw new Error('down'); } });
    const deps = { db: dbs.service, store, ai, packs: createPackLoader(), generic };
    // Round 1 diffs both captures, creating one pending change, and also attempts price_extract on
    // both (the fixtures each have one priced block) — both fail once since `decide` always throws.
    // Round 2 attempts to tag the pending change and fails once too (attempts 1 of MAX_STAGE_ATTEMPTS
    // each, 3 failures total). Engine stage jobs run with retryLimit 0, so the sweep's exponential
    // backoff (RETRY_BACKOFF_MINUTES) is the only retry path: it blocks any further retry within this
    // same call — findEngineWork then finds nothing more, so the loop stops after exactly those three
    // failures instead of burning the whole attempts budget in seconds.
    const r = await drainEngine(deps, { maxRounds: 3 });
    expect(r).toMatchObject({ diffs: 2, changes: 1, events: 0, prices: 0, errors: 3 });
    const [change] = await dbs.owner.select().from(detectedChange);
    expect(change?.status).toBe('pending');
    // No time has passed, so a second drain call is still inside the backoff window and retries nothing.
    expect(await drainEngine(deps, { maxRounds: 3 })).toMatchObject({ diffs: 0, tagged: 0, errors: 0 });
  });

  it('without adMedia the image lists are not run; with it they are', async () => {
    const since = new Date(Date.now() - 86_400_000);
    const firstSeenAt = new Date(Date.now() - 3_600_000);
    const [gcap] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_ads', status: 'ok', collectorVersion: 'dfs/1', capturedAt: firstSeenAt }).returning();
    const mkAd = async () =>
      (await dbs.service
        .insert(ad)
        .values({
          competitorId: IDS.competitorX, platform: 'google', externalId: `CR${randomUUID()}`, format: 'image', mediaUrls: [`https://tpc.googlesyndication.com/simgad/${randomUUID()}`], isActive: true,
          firstSeenAt, lastCaptureId: gcap!.id,
        })
        .returning())[0]!;
    const candidate = await mkAd();
    const stored = await mkAd();
    const store = createMemoryStore();
    const [cap] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: 'ad_image', status: 'ok', collectorVersion: 'ad-image/1' }).returning();
    await store.put(`k/${cap!.id}`, new Uint8Array([1, 2, 3]), 'image/webp');
    const [ev] = await dbs.service.insert(evidence).values({ captureId: cap!.id, kind: 'image', objectKey: `k/${cap!.id}`, sha256: 'e'.repeat(64), bytes: 3, contentType: 'image/webp' }).returning();
    const [img] = await dbs.service
      .insert(adImage)
      .values({ adId: stored.id, competitorId: IDS.competitorX, sourceUrlSha: sha256Hex(stored.mediaUrls[0]!), status: 'triaged', showsPerson: false, showsPrice: true, showsOffer: false, sourceSha256: 's'.repeat(64), evidenceId: ev!.id, triagedAt: new Date() })
      .returning();
    const fetched: string[] = [];
    const fetchBytes: FetchBytes = async (url) => {
      fetched.push(url);
      throw new Error('no network in tests');
    };
    const adMedia = { fetchBytes, robots: { peek: () => ({ allowed: true }), check: async () => ({ allowed: true }) } as unknown as RobotsPolicy, limiter: new HostRateLimiter({ sleep: async () => {} }) };
    const ai = createFakeAi({ chat: () => JSON.stringify({ price_lines: [] }) });
    const deps = { db: dbs.service, store, ai, packs: createPackLoader(), generic };

    const off = await drainEngine(deps, { adImages: true, adImageSince: since, maxRounds: 2 });
    expect(off).toMatchObject({ adImages: 0, adImageReads: 0, errors: 0 });
    expect(fetched).toEqual([]);
    expect(ai.calls.chat).toEqual([]);
    expect(await dbs.owner.select().from(adImage).where(eq(adImage.adId, candidate.id))).toEqual([]);

    // With media deps the read runs (no_price); the triage of a pre-AD_IMAGE_SINCE ad skips before any fetch.
    const on = await drainEngine({ ...deps, adMedia }, { adImages: true, adImageSince: since, maxRounds: 2 });
    expect(on).toMatchObject({ adImages: 0, adImageReads: 1, errors: 0 });
    expect(ai.calls.chat).toHaveLength(1);
    expect((await dbs.owner.select().from(adImage).where(eq(adImage.id, img!.id)))[0]).toMatchObject({ readStatus: 'no_price' });
  });
});
