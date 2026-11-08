import { capture, detectedChange, observation, stageRun, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedPage, seedWebCapture } from '../../test/seed';
import { findEngineWork } from '../sweep';
import { detectSiteFeatures, SITE_FEATURE_COOLDOWN_DAYS, SITE_FEATURE_STAGE, SITE_FEATURE_VERSION } from './site-feature-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const store = createMemoryStore();
const deps = () => ({ db: dbs.service, store });

const BOOKING = '<script src="https://online-booking.housecallpro.com/script.js"></script>';
const CHAT = '<script src="https://connect.podium.com/widget.js"></script>';
const html = (...embeds: string[]) => `<html><head>${embeds.join('')}</head><body><main><h1>Smith HVAC</h1><p>Book a tune-up today.</p></main></body></html>`;

let pageId: string;
let otherPageId: string;
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  pageId = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/book', 'contact');
  otherPageId = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/services', 'service');
});

const ok = (h: string, at: Date, page = pageId) => seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: h, capturedAt: at });
const unchanged = async (at: Date, page = pageId) => {
  const id = randomUUID();
  await dbs.service.insert(capture).values({ id, competitorId: IDS.competitorX, trackedPageId: page, source: 'web', status: 'unchanged', collectorVersion: 'web/2', capturedAt: at });
  return id;
};
const observations = (page = pageId) =>
  dbs.owner.select().from(observation).where(and(eq(observation.kind, 'site_features'), eq(observation.key, page))).orderBy(asc(observation.observedAt));
const changes = () => dbs.owner.select().from(detectedChange).orderBy(asc(detectedChange.detectedAt), asc(detectedChange.kind));
const run = async (id: string) => {
  const o = await detectSiteFeatures(deps(), id);
  if (!o.ran) throw new Error('stage did not run');
  return o.result;
};

describe('detectSiteFeatures', () => {
  it('writes a baseline observation and no change', async () => {
    const n = await ok(html(BOOKING), day(0));
    await ok(html(BOOKING), day(1));
    expect(await run(n)).toEqual({ observed: 1, changes: [] });
    expect(await observations()).toEqual([expect.objectContaining({ captureId: n, competitorId: IDS.competitorX, observedAt: day(0), data: { features: ['housecall_pro'], registry: 1 } })]);
    expect(await changes()).toEqual([]);
  });

  it('A → B (added) → S unchanged emits one added change, category text only', async () => {
    const a = await ok(html(), day(0));
    const b = await ok(html(BOOKING), day(1));
    await unchanged(day(2));
    await run(a);
    const r = await run(b);
    expect(r.changes).toHaveLength(1);
    const [c, ...rest] = await changes();
    expect(rest).toEqual([]);
    expect(c).toMatchObject({
      id: r.changes[0], competitorId: IDS.competitorX, trackedPageId: pageId, source: 'web', kind: 'added', blockKey: 'feature:housecall_pro',
      beforeCaptureId: a, afterCaptureId: b, beforeText: null, afterText: 'online booking (on /book)', status: 'pending', stageVersion: SITE_FEATURE_VERSION,
      details: { changeType: 'site_feature', feature: 'housecall_pro', category: 'online_booking', vendor: 'Housecall Pro', direction: 'added', pageUrl: 'https://smithhvac.example/book' },
    });
    expect(JSON.stringify([c!.beforeText, c!.afterText])).not.toMatch(/housecall/i);
  });

  it('present → absent (N) → present (S) emits nothing (a one-off load failure)', async () => {
    const a = await ok(html(CHAT), day(0));
    await ok(html(CHAT), day(1));
    const n = await ok(html(), day(2));
    await ok(html(CHAT), day(3));
    await run(a);
    expect(await run(n)).toEqual({ observed: 1, changes: [] });
    expect((await observations()).map((o) => o.data)).toEqual([{ features: ['podium'], registry: 1 }, { features: ['podium'], registry: 1 }]);
    expect(await changes()).toEqual([]);
  });

  it('present → absent → absent (S ok) emits removed, with the text in before_text', async () => {
    const a = await ok(html(CHAT), day(0));
    await ok(html(CHAT), day(1));
    const n = await ok(html(), day(2));
    await ok(html(), day(3));
    await run(a);
    const r = await run(n);
    expect(r).toEqual({ observed: 0, changes: [expect.any(String)] });
    expect(await changes()).toEqual([expect.objectContaining({ kind: 'removed', blockKey: 'feature:podium', beforeCaptureId: a, afterCaptureId: n, beforeText: 'live chat (on /book)', afterText: null,
      details: expect.objectContaining({ changeType: 'site_feature', feature: 'podium', direction: 'removed', vendor: 'Podium' }) })]);
  });

  it('another active page that still has the tool blocks removed; an inactive one does not', async () => {
    const o0 = await ok(html(CHAT), day(0), otherPageId);
    await ok(html(CHAT), day(1), otherPageId);
    await run(o0);
    const a = await ok(html(CHAT), day(0));
    await ok(html(CHAT), day(1));
    const n = await ok(html(), day(2));
    await ok(html(), day(3));
    await run(a);
    expect((await run(n)).changes).toEqual([]);

    // Same history, but the other page is inactive now: its observation is ignored.
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    pageId = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/book', 'contact');
    otherPageId = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/services', 'service');
    const p0 = await ok(html(CHAT), day(0), otherPageId);
    await ok(html(CHAT), day(1), otherPageId);
    await run(p0);
    await dbs.owner.update(trackedPage).set({ active: false, inactiveReason: 'manual' }).where(eq(trackedPage.id, otherPageId));
    const a2 = await ok(html(CHAT), day(0));
    await ok(html(CHAT), day(1));
    const n2 = await ok(html(), day(2));
    await ok(html(), day(3));
    await run(a2);
    expect((await run(n2)).changes).toHaveLength(1);
  });

  it('another active page that already has the tool blocks added', async () => {
    const o0 = await ok(html(BOOKING), day(0), otherPageId);
    await ok(html(BOOKING), day(1), otherPageId);
    await run(o0);
    const a = await ok(html(), day(0));
    const n = await ok(html(BOOKING), day(1));
    await ok(html(BOOKING), day(2));
    await run(a);
    expect((await run(n)).changes).toEqual([]);
  });

  it(`the ${SITE_FEATURE_COOLDOWN_DAYS}-day cooldown blocks a second change for the same tool`, async () => {
    const a = await ok(html(), day(0));
    const b = await ok(html(BOOKING), day(1));
    await ok(html(BOOKING), day(2));
    const c = await ok(html(), day(10));
    await ok(html(), day(11));
    await run(a);
    expect((await run(b)).changes).toHaveLength(1);
    expect((await run(c)).changes).toEqual([]); // removed 9 days after the add: in cooldown
    expect((await observations()).at(-1)!.data).toEqual({ features: [], registry: 1 });

    const d = await ok(html(BOOKING), day(1 + SITE_FEATURE_COOLDOWN_DAYS + 1));
    await ok(html(BOOKING), day(1 + SITE_FEATURE_COOLDOWN_DAYS + 2));
    expect((await run(d)).changes).toHaveLength(1); // past the cooldown
  });

  it('an out-of-order capture writes its observation only', async () => {
    const a = await ok(html(), day(0));
    const late = await ok(html(BOOKING), day(1));
    const b = await ok(html(BOOKING), day(2));
    await ok(html(BOOKING), day(3));
    await run(a);
    await run(b); // added, from a
    expect(await changes()).toHaveLength(1);
    expect(await run(late)).toEqual({ observed: 1, changes: [], skipped: 'a later capture of this page was already processed' });
    expect((await observations()).map((o) => o.captureId)).toEqual([a, late, b]);
    expect(await changes()).toHaveLength(1);
  });

  it('a registry entry newer than the previous observation is a baseline for that tool', async () => {
    const a = await ok(html(), day(0));
    const n = await ok(html(BOOKING), day(1));
    await ok(html(BOOKING), day(2));
    await run(a);
    await dbs.owner.update(observation).set({ data: { features: [], registry: 0 } }).where(eq(observation.captureId, a));
    expect(await run(n)).toEqual({ observed: 1, changes: [] });
    expect(await changes()).toEqual([]);
  });

  it('refuses a capture without a successor; the sweep offers only captures that have one', async () => {
    const a = await ok(html(), day(0));
    await expect(detectSiteFeatures(deps(), a)).rejects.toThrow(/no later capture/);
    expect((await findEngineWork(dbs.service, { limit: 10 })).siteFeatures).toEqual([]);
    const b = await unchanged(day(1));
    expect((await findEngineWork(dbs.service, { limit: 10 })).siteFeatures).toEqual([a]);
    expect(b).toBeTruthy();
    await run(a);
    expect((await findEngineWork(dbs.service, { limit: 10 })).siteFeatures).toEqual([]);
    expect(await dbs.owner.select().from(stageRun).where(eq(stageRun.stage, SITE_FEATURE_STAGE))).toEqual([expect.objectContaining({ subjectId: a, status: 'done' })]);
  });
});
