import type { DecisionQuestion } from '@cs/ai';
import { GBP_POSTS_URL, sha256Hex } from '@cs/collectors';
import { capture, client, competitor, gbpPost, priceBlockMap, pricePoint } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { choice, createFakeAi, type DecideFn } from '../../test/fake-ai';
import { seedVendorCapture } from '../../test/seed';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import { POST_PRICE_MAX, POST_PRICE_SINCE, extractPostPrices } from './post-price-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const store = createMemoryStore();
const SRC = 'google_business_profile';
const at = (h: number) => new Date(POST_PRICE_SINCE.getTime() + h * 3_600_000);

const byText: DecideFn = (state, questions: Record<string, DecisionQuestion>) => {
  const t = String((state as { post_text: string }).post_text);
  const svc = /tune-up/i.test(t) ? 'ac_tune_up' : 'none';
  return { answers: Object.fromEntries(Object.keys(questions).map((k) => [k, choice(svc, 0.95)])), needsReview: [] };
};
const postsCapture = (capturedAt: Date, competitorId: string = IDS.competitorX) => seedVendorCapture(dbs.service, { competitorId, source: SRC, url: GBP_POSTS_URL, capturedAt });
const post = async (externalId: string, text: string | null, cap: string, over: Partial<typeof gbpPost.$inferInsert> = {}, competitorId: string = IDS.competitorX) => {
  const [row] = await dbs.service.insert(gbpPost).values({ competitorId, externalId, text, firstCaptureId: cap, lastCaptureId: cap, firstSeenAt: at(0), lastSeenAt: at(0), ...over }).returning({ id: gbpPost.id });
  return row!.id;
};
const points = () => dbs.owner.select().from(pricePoint).orderBy(asc(pricePoint.firstSeenAt), asc(pricePoint.amount));
const mkDeps = (ai = createFakeAi({ decide: byText })) => ({ db: dbs.service, store, ai, packs });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('extractPostPrices', () => {
  it('a priced offer post gets one span with gbp_post_id; a later capture advances it', async () => {
    const ai = createFakeAi({ decide: byText });
    const deps = mkDeps(ai);
    const c0 = await postsCapture(at(1));
    const text = 'Spring special: $79 AC tune-up, call 555-123-4567';
    const p1 = await post('P1', text, c0);
    expect(await extractPostPrices(deps, c0)).toEqual({ ran: true, result: { points: 1, ended: 0 } });
    const [p, ...rest] = await points();
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ gbpPostId: p1, adId: null, trackedPageId: null, competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 79, promo: true, firstSeenAt: at(1), lastSeenAt: at(1), firstCaptureId: c0, endedAt: null });
    expect(p!.context).not.toMatch(/555|4567/);
    expect(ai.calls.decide).toHaveLength(1);
    expect(ai.calls.decide[0]).toMatchObject({ task: 'price_decisions', state: { competitor: 'Smith HVAC', source: 'gbp_post' } });
    expect(String((ai.calls.decide[0]!.state as { post_text: string }).post_text)).not.toMatch(/4567/);
    expect(await dbs.owner.select().from(priceBlockMap)).toEqual([expect.objectContaining({ textSha: sha256Hex(text), serviceId: 'ac_tune_up' })]);

    const c1 = await postsCapture(at(2));
    await dbs.service.update(gbpPost).set({ lastCaptureId: c1, lastSeenAt: at(2) });
    expect(await extractPostPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toEqual([expect.objectContaining({ gbpPostId: p1, lastSeenAt: at(2), lastCaptureId: c1, endedAt: null })]);
    expect(ai.calls.decide).toHaveLength(1);
  });

  it('a post without a price or without text makes no span and no model call', async () => {
    const ai = createFakeAi({ decide: byText });
    const c0 = await postsCapture(at(1));
    await post('P1', 'Stay cool this summer', c0);
    await post('P2', null, c0);
    expect(await extractPostPrices(mkDeps(ai), c0)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('a post the collector ended (unlisted by a non-empty capture) ends its span', async () => {
    const deps = mkDeps();
    const c0 = await postsCapture(at(1));
    const p1 = await post('P1', '$79 AC tune-up', c0);
    await post('P2', 'Open late', c0);
    await extractPostPrices(deps, c0);
    const c1 = await postsCapture(at(2));
    await dbs.service.update(gbpPost).set({ endedCaptureId: c1, endedAt: at(2) }).where(eq(gbpPost.id, p1));
    expect(await extractPostPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 1 } });
    expect(await points()).toEqual([expect.objectContaining({ gbpPostId: p1, endedAt: at(2), endedCaptureId: c1 })]);
  });

  it('an empty capture ends nothing', async () => {
    const deps = mkDeps();
    const c0 = await postsCapture(at(1));
    await post('P1', '$79 AC tune-up', c0);
    await extractPostPrices(deps, c0);
    const c1 = await postsCapture(at(2)); // the collector ends no post on an empty capture
    expect(await extractPostPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toEqual([expect.objectContaining({ endedAt: null })]);
  });

  it('a capture older than the newest processed one is skipped', async () => {
    const deps = mkDeps();
    const c1 = await postsCapture(at(5));
    await post('P1', '$79 AC tune-up', c1, { firstSeenAt: at(5) });
    await extractPostPrices(deps, c1);
    const c0 = await postsCapture(at(1));
    expect(await extractPostPrices(deps, c0)).toMatchObject({ ran: true, result: { points: 0, ended: 0, skipped: expect.stringMatching(/newer/) } });
    expect(await points()).toHaveLength(1);
  });

  it('a capture before POST_PRICE_SINCE is skipped', async () => {
    const ai = createFakeAi({ decide: byText });
    const c0 = await postsCapture(new Date(POST_PRICE_SINCE.getTime() - 3_600_000));
    await post('P1', '$79 AC tune-up', c0);
    expect(await extractPostPrices(mkDeps(ai), c0)).toMatchObject({ ran: true, result: { points: 0, skipped: expect.any(String) } });
    expect(await points()).toEqual([]);
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('a self-only competitor (not in client_competitor) is not priced', async () => {
    const own = '00000000-0000-4000-8000-0000000000f9';
    await dbs.owner.insert(competitor).values({ id: own, name: 'A1 HVAC (self)', domain: 'a1.example' });
    await dbs.owner.update(client).set({ selfCompetitorId: own }).where(eq(client.id, IDS.clientA1));
    const ai = createFakeAi({ decide: byText });
    const c0 = await postsCapture(at(1), own);
    await post('S1', '$79 AC tune-up', c0, {}, own);
    expect(await extractPostPrices(mkDeps(ai), c0)).toMatchObject({ ran: true, result: { points: 0, skipped: expect.any(String) } });
    expect(await points()).toEqual([]);
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('maps at most POST_PRICE_MAX priced posts per capture', async () => {
    const ai = createFakeAi({ decide: byText });
    const c0 = await postsCapture(at(1));
    for (let i = 0; i < POST_PRICE_MAX + 3; i++) await post('M' + i, '$' + (50 + i) + ' AC tune-up deal ' + i, c0);
    expect(await extractPostPrices(mkDeps(ai), c0)).toEqual({ ran: true, result: { points: POST_PRICE_MAX, ended: 0 } });
  });

  it('throws for a non-posts capture', async () => {
    const info = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, url: 'gbp:info', capturedAt: at(1) });
    const meta = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', url: GBP_POSTS_URL, capturedAt: at(1) });
    await expect(extractPostPrices(mkDeps(), info)).rejects.toThrow(/posts capture/);
    await expect(extractPostPrices(mkDeps(), meta)).rejects.toThrow(/posts capture/);
  });

  it('the sweep lists only gbp:posts captures from the cutoff', async () => {
    const [info] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: SRC, url: 'gbp:info', status: 'ok', collectorVersion: 't/1', capturedAt: at(1) }).returning({ id: capture.id });
    const early = await postsCapture(new Date(POST_PRICE_SINCE.getTime() - 3_600_000));
    const good = await postsCapture(at(1));
    // The settle delay compares with the database clock and the cutoff is in the future until deploy, so only the filters are asserted.
    const w = await findEngineWork(dbs.service, { limit: 50 });
    expect(w.postPrices).not.toContain(info!.id);
    expect(w.postPrices).not.toContain(early);
    expect(w.postPrices.every((id) => id === good)).toBe(true);
  });
});
