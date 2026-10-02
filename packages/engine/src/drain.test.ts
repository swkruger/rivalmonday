import { changeEvent, detectedChange, eventScore } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, tagResult } from '../test/fake-ai';
import { day, fixture, seedPage, seedWebCapture } from '../test/seed';
import { drainEngine } from './drain';
import { createPackLoader } from './tag/tag-stage';

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
    const deps = { db: dbs.service, store, ai, packs: createPackLoader() };
    // The HVAC fixtures each have one priced block (the AC tune-up), so the drain also runs price_extract
    // on both captures: $89 opens a span, then $69 ends it and opens a new one (2 price points).
    expect(await drainEngine(deps)).toEqual({ diffs: 2, changes: 1, tagged: 1, events: 1, scored: 2, rankDiffs: 0, reviews: 0, prices: 2, errors: 0 });
    expect(await dbs.owner.select().from(changeEvent)).toHaveLength(1);
    expect(await dbs.owner.select().from(eventScore)).toHaveLength(2);
    expect(await drainEngine(deps)).toEqual({ diffs: 0, changes: 0, tagged: 0, events: 0, scored: 0, rankDiffs: 0, reviews: 0, prices: 0, errors: 0 });
  });

  it('counts errors and keeps going when tagging fails, then backs off instead of retrying immediately', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v1.html'), capturedAt: day(0) });
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v2.html'), capturedAt: day(1) });
    const ai = createFakeAi({ decide: () => { throw new Error('down'); } });
    const deps = { db: dbs.service, store, ai, packs: createPackLoader() };
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
});
