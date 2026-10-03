import { changeEvent, detectedChange, eventChange, eventScore } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { day, seedPage, seedVendorCapture, seedWebCapture } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { findMergeTarget } from '../merge/merge';
import { scoreEvent } from '../score/score-stage';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import { diffWebCapture, WEB_DIFF_VERSION } from '../web/diff-stage';
import { detachChange, retractEvent, supersedePriorChanges } from './retract';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const html = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

async function webCapture() {
  const store = createMemoryStore();
  const page = await seedPage(dbs.service, IDS.competitorX);
  const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: html('<p>AC tune-up only $79 this month</p>'), capturedAt: day(1) });
  return { store, page, cap };
}

async function change(captureId: string, over: Partial<typeof detectedChange.$inferInsert> = {}) {
  const [c] = await dbs.service
    .insert(detectedChange)
    .values({ competitorId: IDS.competitorX, source: 'web', kind: 'modified', afterCaptureId: captureId, blockKey: 'body>p#0', afterText: 'AC tune-up only $79', status: 'event', stageVersion: 0, ...over })
    .returning({ id: detectedChange.id });
  return c!.id;
}

async function eventFor(changeIds: string[], over: Partial<typeof changeEvent.$inferInsert> = {}) {
  const [ev] = await dbs.service
    .insert(changeEvent)
    .values({ competitorId: IDS.competitorX, changeType: 'price_change', channels: ['web'], services: { hvac_plumbing: 'ac_tune_up' }, summary: 'AC tune-up $79', confidence: 0.95, occurredAt: day(1), ...over })
    .returning({ id: changeEvent.id });
  for (const id of changeIds) await dbs.service.insert(eventChange).values({ eventId: ev!.id, changeId: id });
  return ev!.id;
}

/** A web price change merged with a Google ad change into one event (Task 2 fixture: rebuilding text after a detach). */
async function seedMergedPriceAndAd() {
  const store = createMemoryStore();
  const page = await seedPage(dbs.service, IDS.competitorX);
  const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: html('<p>AC tune-up $69</p>'), capturedAt: day(1) });
  const ads = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_ads', capturedAt: day(1) });
  const numericChanges = diffFacts(extractNumericFacts('$89'), extractNumericFacts('$69'));
  const webChangeId = await change(cap, { beforeText: 'AC tune-up $89', afterText: 'AC tune-up $69', numericChanges, detectedAt: day(1) });
  const adChangeId = await change(ads, {
    source: 'google_ads', kind: 'added', blockKey: 'ads', afterText: null,
    details: { changeType: 'ad_started', count: 1, items: [{ id: 'a1', label: 'Tune-up special' }] },
    detectedAt: new Date(day(1).getTime() + 60_000),
  });
  const eventId = await eventFor([webChangeId, adChangeId], { channels: ['google_ads', 'web'], summary: 'price changed from $89 to $69', facts: numericChanges });
  return { eventId, webChangeId };
}

describe('event retraction (Phase 3d decision 6)', () => {
  it('retractEvent keeps the event row but removes its scores', async () => {
    const { cap } = await webCapture();
    const ev = await eventFor([await change(cap)]);
    await scoreEvent({ db: dbs.service, packs }, ev);
    expect((await dbs.owner.select().from(eventScore)).length).toBeGreaterThan(0);
    await dbs.service.transaction((tx) => retractEvent(tx, ev, 'review'));
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ retractionReason: 'review' });
    expect(row!.retractedAt).not.toBeNull();
    expect(await dbs.owner.select().from(eventScore)).toEqual([]);
  });

  it('detachChange keeps a merged event alive on its other evidence and drops the detached channel', async () => {
    const { cap } = await webCapture();
    const ads = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_ads', capturedAt: day(1) });
    const web = await change(cap);
    const ad = await change(ads, { source: 'google_ads', blockKey: 'ads', stageVersion: 1 });
    const ev = await eventFor([web, ad], { channels: ['google_ads', 'web'] });
    const r = await dbs.service.transaction((tx) => detachChange(tx, web, 'review'));
    expect(r).toEqual({ eventId: ev, retracted: false });
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ retractedAt: null, channels: ['google_ads'] });
  });

  it('detachChange retracts the event when the change was its only evidence (and keeps that link for audit)', async () => {
    const { cap } = await webCapture();
    const web = await change(cap);
    const ev = await eventFor([web]);
    expect(await dbs.service.transaction((tx) => detachChange(tx, web, 'review'))).toEqual({ eventId: ev, retracted: true });
    expect(await dbs.owner.select().from(eventChange)).toHaveLength(1);
  });

  it('rebuilds a surviving event summary and facts from its remaining change', async () => {
    // web price change (first, owns summary/facts) merged with a Google ad change
    const { eventId, webChangeId } = await seedMergedPriceAndAd();
    await dbs.service.transaction((tx) => detachChange(tx, webChangeId, 'review'));
    const [e] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, eventId));
    expect(e?.retractedAt).toBeNull();
    expect(e?.channels).toEqual(['google_ads']);
    expect(e?.summary).toMatch(/new Google ad/i);
    expect(e?.summary).not.toMatch(/price changed/);
    expect(e?.facts).toEqual([]);
  });
});

describe('stage-version supersede (Phase 3d decision 7)', () => {
  it('a re-diff under a newer WEB_DIFF_VERSION supersedes the old changes and retracts web-only events', async () => {
    const { store, cap } = await webCapture();
    const old = await change(cap, { stageVersion: WEB_DIFF_VERSION - 1 });
    const ev = await eventFor([old]);
    await diffWebCapture({ db: dbs.service, store, ai: createFakeAi() }, cap); // baseline capture: no new changes
    const [c] = await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, old));
    expect(c?.status).toBe('superseded');
    const [e] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(e?.retractionReason).toBe('superseded');
  });

  it('never supersedes another source, a complaint spike, or a change of the current version', async () => {
    const { cap } = await webCapture();
    const current = await change(cap, { stageVersion: WEB_DIFF_VERSION, blockKey: 'body>p#1' });
    const reviews = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_reviews', capturedAt: day(1) });
    const spike = await change(reviews, { source: 'google_reviews', blockKey: 'complaint:hvac_plumbing:response_time', stageVersion: 1, details: { changeType: 'review_spike', theme: 'response_time' } });
    const r = await dbs.service.transaction(async (tx) => ({
      web: await supersedePriorChanges(tx, { afterCaptureId: cap, source: 'web' }, WEB_DIFF_VERSION),
      vendor: await supersedePriorChanges(tx, { afterCaptureId: reviews, source: 'google_reviews' }, 99),
    }));
    expect(r).toEqual({ web: { superseded: 0, retracted: 0 }, vendor: { superseded: 0, retracted: 0 } });
    expect((await dbs.owner.select().from(detectedChange)).map((c) => c.status).sort()).toEqual(['event', 'event']);
    expect([current, spike]).toHaveLength(2);
  });

  it('retracted events are invisible to merge, scoring and the score sweep', async () => {
    const { cap } = await webCapture();
    const ev = await eventFor([await change(cap)], { retractedAt: day(2), retractionReason: 'superseded', facts: [] });
    expect(await scoreEvent({ db: dbs.service, packs }, ev)).toEqual({ scored: 0, failed: 0, routes: { alert: 0, brief: 0, archive: 0 } });
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(ev);
    const target = await findMergeTarget(
      { db: dbs.service, ai: createFakeAi() },
      { competitorId: IDS.competitorX, clientId: null, captureId: null, changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, facts: [], embedding: null, occurredAt: day(1), text: 'AC tune-up $79' },
    );
    expect(target).toBeNull();
  });
});
