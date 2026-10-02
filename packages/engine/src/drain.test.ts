import { changeEvent, eventScore } from '@cs/db';
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
    expect(await drainEngine(deps)).toEqual({ diffs: 2, changes: 1, tagged: 1, events: 1, scored: 2, errors: 0 });
    expect(await dbs.owner.select().from(changeEvent)).toHaveLength(1);
    expect(await dbs.owner.select().from(eventScore)).toHaveLength(2);
    expect(await drainEngine(deps)).toEqual({ diffs: 0, changes: 0, tagged: 0, events: 0, scored: 0, errors: 0 });
  });

  it('counts errors and keeps going when tagging fails', async () => {
    const store = createMemoryStore();
    const page = await seedPage(dbs.service, IDS.competitorX);
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v1.html'), capturedAt: day(0) });
    await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: await fixture('hvac-home-v2.html'), capturedAt: day(1) });
    const ai = createFakeAi({ decide: () => { throw new Error('down'); } });
    // Round 1 diffs; rounds 2 and 3 each retry the failed tag (attempts 1 and 2 of MAX_STAGE_ATTEMPTS).
    const r = await drainEngine({ db: dbs.service, store, ai, packs: createPackLoader() }, { maxRounds: 3 });
    expect(r).toMatchObject({ diffs: 2, changes: 1, events: 0, errors: 2 });
  });
});
