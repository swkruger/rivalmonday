import type { DecisionQuestion } from '@cs/ai';
import { metaPageUrl, recordVendorCapture, sha256Hex } from '@cs/collectors';
import { ad, adImage, priceBlockMap, pricePoint } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { choice, createFakeAi, type DecideFn } from '../../test/fake-ai';
import { AD_IMAGE_SINCE } from '../ads/images';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import { AD_PRICE_SINCE, extractAdPrices } from './ad-price-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const store = createMemoryStore();
/** Hours after the cutoff. Only the `at(1)` sweep assertion depends on the clock: at(1) + the 10-minute settle delay is 2026-11-08 01:10Z, in the past for good. */
const at = (h: number) => new Date(AD_PRICE_SINCE.getTime() + h * 3_600_000);

const byText: DecideFn = (state, questions: Record<string, DecisionQuestion>) => {
  const t = String((state as { ad_text: string }).ad_text);
  const svc = /tune-up/i.test(t) ? 'ac_tune_up' : 'none';
  return { answers: Object.fromEntries(Object.keys(questions).map((k) => [k, choice(svc, 0.95)])), needsReview: [] };
};

/** A Meta capture of page 99 whose stored payload lists these ad ids. */
const metaCapture = async (externalIds: string[], capturedAt: Date, opts: { truncated?: boolean } = {}) =>
  (await recordVendorCapture({ db: dbs.service, store, now: () => capturedAt }, {
    competitorId: IDS.competitorX, source: 'meta_ads', collectorVersion: 'meta/1', url: metaPageUrl('99'), status: 'ok',
    payload: { vendor: 'apify', items: externalIds.map((id) => ({ adArchiveID: id, pageID: '99', isActive: true, snapshot: { body: { text: 'x' } } })), truncated: opts.truncated ?? false },
  })).captureId;
const metaAd = async (externalId: string, text: string | null, over: Partial<typeof ad.$inferInsert> = {}) => {
  const [row] = await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId, advertiserId: '99', text, isActive: true, ...over }).returning({ id: ad.id });
  return row!.id;
};
const points = () => dbs.owner.select().from(pricePoint).orderBy(asc(pricePoint.firstSeenAt), asc(pricePoint.amount));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('extractAdPrices', () => {
  it('"$79 AC tune-up" creates one span with ad_id', async () => {
    const ai = createFakeAi({ decide: byText });
    const deps = { db: dbs.service, store, ai, packs };
    const c0 = await metaCapture(['A1'], at(1));
    const a1 = await metaAd('A1', '$79 AC tune-up', { firstCaptureId: c0, lastCaptureId: c0 });
    expect(await extractAdPrices(deps, c0)).toEqual({ ran: true, result: { points: 1, ended: 0 } });
    const [p, ...rest] = await points();
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ adId: a1, trackedPageId: null, competitorId: IDS.competitorX, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 79, firstSeenAt: at(1), lastSeenAt: at(1), firstCaptureId: c0, lastCaptureId: c0, endedAt: null });
    expect(ai.calls.decide).toHaveLength(1);
    expect(ai.calls.decide[0]).toMatchObject({ task: 'price_decisions', state: { competitor: 'Smith HVAC', ad_text: '$79 AC tune-up', source: 'meta_ad' } });
    expect(await dbs.owner.select().from(priceBlockMap)).toEqual([expect.objectContaining({ textSha: sha256Hex('$79 AC tune-up'), verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up' })]);

    // A later capture still listing the ad advances the span; the mapping is cached, nothing is re-asked.
    const c1 = await metaCapture(['A1'], at(2));
    expect(await extractAdPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toEqual([expect.objectContaining({ adId: a1, lastSeenAt: at(2), lastCaptureId: c1, endedAt: null })]);
    expect(ai.calls.decide).toHaveLength(1);
  });

  it('"$20 off any repair" creates none', async () => {
    const ai = createFakeAi({ decide: byText });
    const c0 = await metaCapture(['D1', 'T0'], at(1));
    await metaAd('D1', '$20 off any repair', { firstCaptureId: c0 });
    await metaAd('T0', null, { firstCaptureId: c0 });
    expect(await extractAdPrices({ db: dbs.service, store, ai, packs }, c0)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toEqual([]);
    expect(ai.calls.decide).toHaveLength(0); // a discount is never a price, so it is never asked
  });

  it('ad ended in this capture ends its span', async () => {
    const deps = { db: dbs.service, store, ai: createFakeAi({ decide: byText }), packs };
    const c0 = await metaCapture(['A1'], at(1));
    const a1 = await metaAd('A1', '$79 AC tune-up', { firstCaptureId: c0 });
    await extractAdPrices(deps, c0);
    const c1 = await metaCapture([], at(2));
    await dbs.service.update(ad).set({ isActive: false, endedCaptureId: c1 });
    expect(await extractAdPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 1 } });
    expect(await points()).toEqual([expect.objectContaining({ adId: a1, endedAt: at(2), endedCaptureId: c1 })]);
  });

  it('returned ad gets a new span', async () => {
    const deps = { db: dbs.service, store, ai: createFakeAi({ decide: byText }), packs };
    const c0 = await metaCapture(['A1'], at(1));
    const a1 = await metaAd('A1', '$79 AC tune-up', { firstCaptureId: c0 });
    await extractAdPrices(deps, c0);
    const c1 = await metaCapture([], at(2));
    await dbs.service.update(ad).set({ isActive: false, endedCaptureId: c1 });
    await extractAdPrices(deps, c1);
    const c2 = await metaCapture(['A1'], at(3));
    await dbs.service.update(ad).set({ isActive: true, endedCaptureId: null, lastCaptureId: c2 });
    expect(await extractAdPrices(deps, c2)).toEqual({ ran: true, result: { points: 1, ended: 0 } });
    expect((await points()).map((p) => [p.adId, p.firstCaptureId, p.endedCaptureId])).toEqual([[a1, c0, c1], [a1, c2, null]]);
  });

  it('"$99 AC tune-up, call 555-123-4567" yields a 99 span', async () => {
    const ai = createFakeAi({ decide: byText });
    const c0 = await metaCapture(['P1', 'P2'], at(1));
    const p1 = await metaAd('P1', '$99 AC tune-up, call 555-123-4567', { firstCaptureId: c0 });
    // Redacting first would turn "$99 555-123-4567" into "$[phone]" and lose the price.
    const p2 = await metaAd('P2', 'AC tune-up only $99 555-123-4567', { firstCaptureId: c0 });
    expect(await extractAdPrices({ db: dbs.service, store, ai, packs }, c0)).toEqual({ ran: true, result: { points: 2, ended: 0 } });
    const rows = await points();
    expect(rows.map((p) => [p.adId, p.amount, p.serviceId]).sort()).toEqual([[p1, 99, 'ac_tune_up'], [p2, 99, 'ac_tune_up']].sort());
    for (const p of rows) expect(p.context).not.toMatch(/555|4567/);
    for (const c of ai.calls.decide) expect(String((c.state as { ad_text: string }).ad_text)).not.toMatch(/4567/);
  });

  it('ad missing from a later capture ends its span', async () => {
    const deps = { db: dbs.service, store, ai: createFakeAi({ decide: byText }), packs };
    const c0 = await metaCapture(['A1', 'B1'], at(1));
    const a1 = await metaAd('A1', '$79 AC tune-up', { firstCaptureId: c0 });
    await metaAd('B1', 'Beat the heat', { firstCaptureId: c0 });
    // Another page's ad of the same competitor is never ended by page 99's capture.
    const other = await metaAd('O1', '$89 AC tune-up special', { advertiserId: '77' });
    await dbs.service.insert(pricePoint).values({ competitorId: IDS.competitorX, adId: other, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 89, unit: 'USD', qualifier: 'exact', promo: false, raw: '$89', context: 'x', firstSeenAt: at(0), lastSeenAt: at(0), firstCaptureId: c0, lastCaptureId: c0 });
    await extractAdPrices(deps, c0);
    const c1 = await metaCapture(['B1'], at(2)); // A1 not listed, its row still says active (e.g. deactivation skipped)
    expect(await extractAdPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 1 } });
    const rows = await points();
    expect(rows.find((p) => p.adId === a1)).toMatchObject({ endedAt: at(2), endedCaptureId: c1 });
    expect(rows.find((p) => p.adId === other)).toMatchObject({ endedAt: null });
  });

  it('truncated capture ends nothing', async () => {
    const deps = { db: dbs.service, store, ai: createFakeAi({ decide: byText }), packs };
    const c0 = await metaCapture(['A1', 'B1'], at(1));
    const a1 = await metaAd('A1', '$79 AC tune-up', { firstCaptureId: c0 });
    await metaAd('B1', 'Beat the heat', { firstCaptureId: c0 });
    await extractAdPrices(deps, c0);
    const c1 = await metaCapture(['B1'], at(2), { truncated: true });
    expect(await extractAdPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    const c2 = await metaCapture([], at(3)); // an empty response is a possible vendor glitch, too
    expect(await extractAdPrices(deps, c2)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toEqual([expect.objectContaining({ adId: a1, endedAt: null })]);
  });

  it('inactive listed ad gets no span', async () => {
    const ai = createFakeAi({ decide: byText });
    const c0 = await metaCapture(['I1'], at(1));
    await metaAd('I1', '$79 AC tune-up', { firstCaptureId: c0, isActive: false });
    expect(await extractAdPrices({ db: dbs.service, store, ai, packs }, c0)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toEqual([]);
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('capture before AD_PRICE_SINCE is not swept', async () => {
    const old = await metaCapture(['A1'], new Date(AD_PRICE_SINCE.getTime() - 3_600_000));
    const fresh = await metaCapture(['A1'], at(1));
    const work = await findEngineWork(dbs.service, { limit: 50 });
    expect(work.adPrices).toEqual([fresh]);
    expect(work.adPrices).not.toContain(old);
    await extractAdPrices({ db: dbs.service, store, ai: createFakeAi({ decide: byText }), packs }, fresh);
    expect((await findEngineWork(dbs.service, { limit: 50 })).adPrices).toEqual([]);
  });

  it('older capture after a processed newer one is skipped', async () => {
    const ai = createFakeAi({ decide: byText });
    const deps = { db: dbs.service, store, ai, packs };
    const newer = await metaCapture(['A1'], at(5));
    await metaAd('A1', '$79 AC tune-up', { firstCaptureId: newer });
    await extractAdPrices(deps, newer);
    const older = await metaCapture(['A1'], at(2));
    expect(await extractAdPrices(deps, older)).toEqual({ ran: true, result: { points: 0, ended: 0, skipped: 'a newer capture of this Meta page was already processed' } });
    expect(await points()).toEqual([expect.objectContaining({ lastCaptureId: newer, lastSeenAt: at(5) })]);
  });

  it('refuses a web capture', async () => {
    const g = (await recordVendorCapture({ db: dbs.service, store, now: () => at(1) }, { competitorId: IDS.competitorX, source: 'places', collectorVersion: 'p/1', status: 'ok', payload: { items: [] } })).captureId;
    await expect(extractAdPrices({ db: dbs.service, store, ai: createFakeAi({ decide: byText }), packs }, g)).rejects.toThrow(/not an ok meta_ads or google_ads capture/);
    expect((await findEngineWork(dbs.service, { limit: 50 })).adPrices).toEqual([]);
  });
});

describe('extractAdPrices, Google path (R14)', () => {
  const GURL = 'google-ads:smithhvac.example';
  const gCapture = async (capturedAt: Date, url: string | null = GURL) =>
    (await recordVendorCapture({ db: dbs.service, store, now: () => capturedAt }, { competitorId: IDS.competitorX, source: 'google_ads', collectorVersion: 'dfs/1', url: url ?? undefined, status: 'ok', payload: { items: [] } })).captureId;
  const gAd = async (externalId: string, over: Partial<typeof ad.$inferInsert> = {}) =>
    (await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'google', externalId, isActive: true, ...over }).returning({ id: ad.id }))[0]!.id;
  const imageSpan = async (adId: string, firstCaptureId: string, firstSeen: Date) => {
    const [img] = await dbs.owner.insert(adImage).values({ adId, competitorId: IDS.competitorX, sourceUrlSha: sha256Hex(`img-${adId}`) }).returning({ id: adImage.id });
    await dbs.owner.insert(pricePoint).values({ competitorId: IDS.competitorX, trackedPageId: null, adId, adImageId: img!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 79, unit: 'USD', qualifier: 'exact', raw: '$79', context: '$79 tune-up', firstSeenAt: firstSeen, lastSeenAt: firstSeen, firstCaptureId, lastCaptureId: firstCaptureId });
  };
  const deps = () => ({ db: dbs.service, store, ai: createFakeAi({ decide: byText }), packs });
  const gat = (h: number) => new Date(AD_IMAGE_SINCE.getTime() + h * 3_600_000);

  it('google capture advances a listed ad image span', async () => {
    const c0 = await gCapture(gat(1));
    const a1 = await gAd('G1', { firstCaptureId: c0, lastCaptureId: c0 });
    await imageSpan(a1, c0, gat(1));
    const c1 = await gCapture(gat(2));
    await dbs.service.update(ad).set({ lastCaptureId: c1 }).where(eq(ad.id, a1));
    const d = deps();
    expect(await extractAdPrices(d, c1)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toEqual([expect.objectContaining({ adId: a1, lastSeenAt: gat(2), lastCaptureId: c1, endedAt: null })]);
    expect(d.ai.calls.decide).toHaveLength(0);
  });

  it('ad ended by this capture => span ended', async () => {
    const c0 = await gCapture(gat(1));
    const a1 = await gAd('G1', { firstCaptureId: c0, lastCaptureId: c0 });
    await imageSpan(a1, c0, gat(1));
    const c1 = await gCapture(gat(2));
    await dbs.service.update(ad).set({ isActive: false, endedCaptureId: c1 }).where(eq(ad.id, a1));
    expect(await extractAdPrices(deps(), c1)).toEqual({ ran: true, result: { points: 0, ended: 1 } });
    expect(await points()).toEqual([expect.objectContaining({ endedAt: gat(2), endedCaptureId: c1, lastSeenAt: gat(1) })]);
  });

  it('pinned-mode retired ad (inactive, no ended_capture_id) => span ended', async () => {
    const c0 = await gCapture(gat(1));
    const a1 = await gAd('G1', { firstCaptureId: c0, lastCaptureId: c0 });
    await imageSpan(a1, c0, gat(1));
    const c1 = await gCapture(gat(2));
    await dbs.service.update(ad).set({ isActive: false }).where(eq(ad.id, a1));
    expect(await extractAdPrices(deps(), c1)).toEqual({ ran: true, result: { points: 0, ended: 1 } });
    expect(await points()).toEqual([expect.objectContaining({ endedAt: gat(2), endedCaptureId: c1 })]);
  });

  it('older google capture after a newer done one => no-op', async () => {
    const newer = await gCapture(gat(5));
    const a1 = await gAd('G1', { firstCaptureId: newer, lastCaptureId: newer });
    await imageSpan(a1, newer, gat(5));
    await extractAdPrices(deps(), newer);
    const older = await gCapture(gat(2));
    await dbs.service.update(ad).set({ isActive: false }).where(eq(ad.id, a1));
    expect(await extractAdPrices(deps(), older)).toEqual({ ran: true, result: { points: 0, ended: 0, skipped: 'a newer capture of this Google ad set was already processed' } });
    expect(await points()).toEqual([expect.objectContaining({ endedAt: null, lastSeenAt: gat(5) })]);
  });
});
