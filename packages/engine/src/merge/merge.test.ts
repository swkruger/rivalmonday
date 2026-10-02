import { capture, changeEvent, detectedChange, eventChange, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { asc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, type DecideFn, noul, structuredResult, tagResult } from '../../test/fake-ai';
import { day, seedVendorCapture } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader, tagChange } from '../tag/tag-stage';
import { conflictingServices, sharesService } from './merge';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const PAGE = '00000000-0000-4000-8000-0000000000e1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/specials', pageType: 'promo', source: 'manual', cadence: 'daily' });
});

async function webCapture(at: number) {
  const [row] = await dbs.service
    .insert(capture)
    .values({ competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: day(at) })
    .returning({ id: capture.id });
  return row!.id;
}

async function webChange(captureId: string, blockKey: string, before: string | null, after: string) {
  const [row] = await dbs.service
    .insert(detectedChange)
    .values({
      competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', kind: before ? 'modified' : 'added', afterCaptureId: captureId, blockKey, beforeText: before, afterText: after,
      numericChanges: diffFacts(before ? extractNumericFacts(before) : [], extractNumericFacts(after)), flags: ['numeric'], stageVersion: 1,
    })
    .returning({ id: detectedChange.id });
  return row!.id;
}

async function adChange(at: number, text: string) {
  const prev = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(at - 7) });
  const cap = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(at) });
  const [row] = await dbs.service
    .insert(detectedChange)
    .values({
      competitorId: IDS.competitorX, source: 'meta_ads', kind: 'added', beforeCaptureId: prev, afterCaptureId: cap, blockKey: 'ads:meta:started', afterText: text,
      details: { changeType: 'ad_started', count: 1, items: [{ id: 'A1', label: text }] }, stageVersion: 1,
    })
    .returning({ id: detectedChange.id });
  return row!.id;
}

/** Tag questions → web tagResult; structured questions → structuredResult; same_<i> → the given Noul. */
const decide = (type: string, same: boolean, confidence = 0.95): DecideFn => (state, q) => {
  const keys = Object.keys(q);
  if (keys.every((k) => k.startsWith('same_'))) return { answers: Object.fromEntries(keys.map((k) => [k, noul(same, confidence)])), needsReview: [] };
  if ('meaningful' in q) return tagResult({ meaningful: true, type, services: { hvac_plumbing: 'ac_tune_up' } })(state, q);
  return structuredResult({ services: { hvac_plumbing: 'ac_tune_up' }, offer: true })(state, q);
};
const askedSame = (ai: ReturnType<typeof createFakeAi>) => ai.calls.decide.filter((c) => Object.keys(c.questions).some((k) => k.startsWith('same_'))).length;
const events = () => dbs.owner.select().from(changeEvent).orderBy(asc(changeEvent.occurredAt));

describe('cross-channel merge', () => {
  it('merges the same price shown in two blocks of one capture without asking a model', async () => {
    const cap = await webCapture(1);
    const a = await webChange(cap, 'div.hero#0', 'AC Tune-Up $89', 'AC Tune-Up $69');
    const b = await webChange(cap, 'li.price#2', 'Tune-up: $89', 'Tune-up: $69');
    const ai = createFakeAi({ decide: decide('price_change', false) });
    await tagChange({ db: dbs.service, ai, packs }, a);
    const r = await tagChange({ db: dbs.service, ai, packs }, b);
    expect(r).toMatchObject({ ran: true, result: { merged: true } });
    const evs = await events();
    expect(evs).toHaveLength(1);
    expect((await dbs.owner.select().from(eventChange)).map((l) => l.eventId)).toEqual([evs[0]!.id, evs[0]!.id]);
    expect(askedSame(ai)).toBe(0);
  });

  it('merges a web promo and a Meta ad for the same offer when the model says it is the same offer', async () => {
    const web = await webChange(await webCapture(1), 'div.promo#0', null, 'Spring special: AC tune-up with a free filter');
    const ad = await adChange(4, 'Spring special — AC tune-up + free filter');
    const ai = createFakeAi({ decide: decide('promo', true) });
    await tagChange({ db: dbs.service, ai, packs }, web);
    await tagChange({ db: dbs.service, ai, packs }, ad);
    const evs = await events();
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ changeType: 'promo', channels: ['meta_ads', 'web'] });
    expect(await dbs.owner.select().from(eventChange)).toHaveLength(2);
    expect(askedSame(ai)).toBe(1);
    expect(JSON.stringify(ai.calls.decide.at(-1)!.state)).toContain('existing_0');
  });

  it.each([
    ['the model says it is a different offer', false, 0.95],
    ['the model is not confident enough', true, 0.6],
  ])('keeps two events when %s', async (_label, same, confidence) => {
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: decide('promo', same, confidence) }), packs }, await webChange(await webCapture(1), 'div.promo#0', null, 'Spring special: AC tune-up with a free filter'));
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: decide('promo', same, confidence) }), packs }, await adChange(4, 'Free filter with every tune-up'));
    expect(await events()).toHaveLength(2);
  });

  it('never merges two price changes with different numbers (a second price cut is news)', async () => {
    const ai = createFakeAi({ decide: decide('price_change', true) });
    await tagChange({ db: dbs.service, ai, packs }, await webChange(await webCapture(1), 'div.hero#0', 'AC Tune-Up $100', 'AC Tune-Up $80'));
    await tagChange({ db: dbs.service, ai, packs }, await webChange(await webCapture(5), 'div.hero#0', 'AC Tune-Up $80', 'AC Tune-Up $60'));
    expect(await events()).toHaveLength(2);
    expect(askedSame(ai)).toBe(0);
  });

  it('only looks 14 days around the change', async () => {
    const ai = createFakeAi({ decide: decide('promo', true) });
    await tagChange({ db: dbs.service, ai, packs }, await webChange(await webCapture(1), 'div.promo#0', null, 'Spring special: AC tune-up with a free filter'));
    await tagChange({ db: dbs.service, ai, packs }, await adChange(20, 'Spring special — AC tune-up + free filter'));
    expect(await events()).toHaveLength(2);
    expect(askedSame(ai)).toBe(0);
  });
});

describe('service overlap helpers', () => {
  it('compare per vertical and ignore unmapped services', () => {
    expect(sharesService({ hvac_plumbing: 'ac_tune_up' }, { hvac_plumbing: 'ac_tune_up', dental: null })).toBe(true);
    expect(sharesService({ hvac_plumbing: null }, { hvac_plumbing: null })).toBe(false);
    expect(conflictingServices({ hvac_plumbing: 'ac_tune_up' }, { hvac_plumbing: 'drain_cleaning' })).toBe(true);
    expect(conflictingServices({ hvac_plumbing: 'ac_tune_up' }, { hvac_plumbing: null })).toBe(false);
  });
});
