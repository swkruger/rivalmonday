import type { DecisionQuestion } from '@cs/ai';
import { competitor, priceBlockMap, pricePoint } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { asc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { choice, createFakeAi, type DecideFn } from '../../test/fake-ai';
import { day, seedPage, seedWebCapture } from '../../test/seed';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import { extractPrices, PRICE_MAX_BLOCKS } from './price-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const store = createMemoryStore();
const page = (tuneUp: string) =>
  `<html><body><main><h2>Our prices</h2><p>AC tune-up starting at ${tuneUp} per system</p><p>$50 off any repair this month</p><p>Water heater installs from $1,299</p></main></body></html>`;

/** Maps a block to a service by its text, like a model would; `low` marks every answer low-confidence. */
const byText = (low = false): DecideFn => (state, questions: Record<string, DecisionQuestion>) => {
  const t = String((state as { text: string }).text);
  const svc = /tune-up/i.test(t) ? 'ac_tune_up' : /water heater/i.test(t) ? 'water_heater' : 'none';
  return { answers: Object.fromEntries(Object.keys(questions).map((k) => [k, choice(svc, low ? 0.5 : 0.95)])), needsReview: low ? Object.keys(questions) : [] };
};

let pageId: string;
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  pageId = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/pricing', 'pricing');
});
const capture = (html: string, at: Date) => seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: pageId, html, capturedAt: at });
const points = () => dbs.owner.select().from(pricePoint).orderBy(asc(pricePoint.amount));

describe('extractPrices', () => {
  it('opens a span per service price, ends it when the price changes, and maps each block text only once', async () => {
    const ai = createFakeAi({ decide: byText() });
    const deps = { db: dbs.service, store, ai, packs };
    const c0 = await capture(page('$89'), day(0));
    expect(await extractPrices(deps, c0)).toEqual({ ran: true, result: { points: 2, ended: 0 } });
    expect(ai.calls.decide).toHaveLength(2); // the "$50 off" block is not a price, so it is never asked
    expect(ai.calls.decide.every((c) => c.task === 'price_decisions')).toBe(true);
    expect((await points()).map((p) => [p.serviceId, p.amount, p.unit, p.qualifier, p.endedAt])).toEqual([
      ['ac_tune_up', 89, 'USD/system', 'from', null],
      ['water_heater', 1299, 'USD', 'from', null],
    ]);

    const c1 = await capture(page('$79'), day(1));
    expect(await extractPrices(deps, c1)).toEqual({ ran: true, result: { points: 1, ended: 1 } });
    expect(ai.calls.decide).toHaveLength(3); // only the changed tune-up block is new
    const [p79, p89, heater] = await points();
    expect(p79).toMatchObject({ amount: 79, firstCaptureId: c1, endedAt: null });
    expect(p89).toMatchObject({ amount: 89, endedAt: day(1), endedCaptureId: c1 });
    expect(heater).toMatchObject({ amount: 1299, lastSeenAt: day(1), lastCaptureId: c1, endedAt: null });

    const c2 = await capture(page('$79'), day(2));
    expect(await extractPrices(deps, c2)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(ai.calls.decide).toHaveLength(3);
  });

  it('an older capture processed late changes nothing', async () => {
    const deps = { db: dbs.service, store, ai: createFakeAi({ decide: byText() }), packs };
    await extractPrices(deps, await capture(page('$89'), day(5)));
    const late = await capture(page('$59'), day(1));
    expect(await extractPrices(deps, late)).toEqual({ ran: true, result: { points: 0, ended: 0, skipped: 'a newer capture of this page was already processed' } });
    expect((await points()).map((p) => [p.amount, p.endedAt])).toEqual([[89, null], [1299, null]]);
  });

  it('a capture that ends spans without observing anything still advances the watermark, so a late older capture is still a no-op', async () => {
    const ai = createFakeAi({ decide: byText() });
    const deps = { db: dbs.service, store, ai, packs };
    const c0 = await capture(page('$89'), day(0));
    expect(await extractPrices(deps, c0)).toEqual({ ran: true, result: { points: 2, ended: 0 } });

    // A blank pricing section: this capture observes nothing, so it never touches price_point.last_seen_at —
    // the old (wrong) watermark would stay at c0's capture time, letting a later-arriving older capture through.
    const blank = '<html><body><main><h2>Welcome</h2><p>Please call for current rates.</p></main></body></html>';
    const c2 = await capture(blank, day(5));
    expect(await extractPrices(deps, c2)).toEqual({ ran: true, result: { points: 0, ended: 2 } });

    const c1 = await capture(page('$59'), day(3));
    expect(await extractPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 0, skipped: 'a newer capture of this page was already processed' } });
    expect((await points()).map((p) => p.endedAt)).toEqual([day(5), day(5)]); // still ended by c2, not reopened by c1
  });

  it('a low-confidence mapping is cached as "no service" and never re-asked', async () => {
    const ai = createFakeAi({ decide: byText(true) });
    const deps = { db: dbs.service, store, ai, packs };
    await extractPrices(deps, await capture(page('$89'), day(0)));
    expect(await points()).toEqual([]);
    expect((await dbs.owner.select().from(priceBlockMap)).every((m) => m.serviceId === null && m.needsReview)).toBe(true);
    await extractPrices(deps, await capture(page('$89'), day(1)));
    expect(ai.calls.decide).toHaveLength(2);
  });

  it('skips a competitor nobody tracks, and the sweep offers only tracked competitors', async () => {
    const [z] = await dbs.owner.insert(competitor).values({ name: 'Nobody HVAC', domain: 'nobody.example' }).returning({ id: competitor.id });
    const zPage = await seedPage(dbs.service, z!.id, 'https://nobody.example/', 'home');
    const zCap = await seedWebCapture(dbs.service, store, { competitorId: z!.id, trackedPageId: zPage, html: page('$89'), capturedAt: day(0) });
    const xCap = await capture(page('$89'), day(0));
    const work = await findEngineWork(dbs.service, { limit: 50 });
    expect(work.prices).toEqual([xCap]);
    const deps = { db: dbs.service, store, ai: createFakeAi({ decide: byText() }), packs };
    expect(await extractPrices(deps, zCap)).toEqual({ ran: true, result: { points: 0, ended: 0, skipped: 'no client tracks this competitor' } });
    await extractPrices(deps, xCap);
    expect((await findEngineWork(dbs.service, { limit: 50 })).prices).toEqual([]);
  });

  it('a catalogue page past PRICE_MAX_BLOCKS never ends the spans its blocks were never re-mapped from', async () => {
    const n = PRICE_MAX_BLOCKS + 2;
    const catalog = `<html><body><main><h2>Our prices</h2>${Array.from({ length: n }, (_, i) => `<p>Service ${i} tune-up $${100 + i}</p>`).join('')}</main></body></html>`;
    const allAcTuneUp: DecideFn = (_state, questions) => ({
      answers: Object.fromEntries(Object.keys(questions).map((k) => [k, choice('ac_tune_up', 0.95)])),
      needsReview: [],
    });
    const ai = createFakeAi({ decide: allAcTuneUp });
    const deps = { db: dbs.service, store, ai, packs };
    const c0 = await capture(catalog, day(0));
    expect(await extractPrices(deps, c0)).toEqual({ ran: true, result: { points: PRICE_MAX_BLOCKS, ended: 0 } });
    expect(await points()).toHaveLength(PRICE_MAX_BLOCKS);

    // Same page, nothing changed: the first PRICE_MAX_BLOCKS spans are re-observed, but the ones beyond the
    // cap were simply never looked at this capture — they must not be ended as if the price disappeared.
    const c1 = await capture(catalog, day(1));
    expect(await extractPrices(deps, c1)).toEqual({ ran: true, result: { points: 0, ended: 0 } });
    expect(await points()).toHaveLength(PRICE_MAX_BLOCKS);
  });
});
