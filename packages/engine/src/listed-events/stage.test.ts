import { GBP_EVENTS_URL, VENUE_PANEL_KIND } from '@cs/collectors';
import { ad, capture, client, clientCompetitor, competitor, detectedChange, listedEvent, observation } from '@cs/db';
import { IDS, openTestDbs, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedPage, seedVendorCapture, seedWebCapture } from '../../test/seed';
import { supersedePriorChanges } from '../events/retract';
import { findEngineWork, LISTED_EVENTS_LOOKBACK_DAYS } from '../sweep';
import { commitListedEvents, detectListedEvents, EVENT_SINGLES_MAX, LISTED_EVENTS_STAGE, LISTED_EVENTS_VERSION, loadEventsCapture, planListedEvents } from './stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const store = createMemoryStore();
const deps = () => ({ db: dbs.service, store });
const SELF = '00000000-0000-4000-8000-0000000000f9';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

type PanelEvent = { title: string; subtitle: string; url?: string | null };
/** A venue-panel capture (`gbp:events`) as the Sunday scan records it. day(n) is 01:00 in Chicago on Oct 1 + n. */
async function panel(at: Date, events: PanelEvent[], competitorId: string = IDS.competitorX) {
  const id = await seedVendorCapture(dbs.service, { competitorId, source: 'google_business_profile', url: GBP_EVENTS_URL, capturedAt: at });
  await dbs.service.insert(observation).values({
    competitorId, captureId: id, kind: VENUE_PANEL_KIND, key: 'events', observedAt: at,
    data: { timeZone: 'America/Chicago', title: 'Smith Hall', events: events.map((e) => ({ title: e.title, subtitle: e.subtitle, url: e.url ?? null })) },
  });
  return id;
}

type LdEvent = { name: string; startDate: string; status?: string; price?: number };
const ldHtml = (events: LdEvent[]) =>
  `<html><head>${events
    .map((e) => `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Event', name: e.name, startDate: e.startDate,
      ...(e.status ? { eventStatus: `https://schema.org/${e.status}` } : {}), ...(e.price ? { offers: { '@type': 'Offer', price: e.price } } : {}),
    })}</script>`)
    .join('')}</head><body><h1>Events</h1></body></html>`;
let pageId: string;
const web = async (at: Date, events: LdEvent[]) => {
  pageId ??= await seedPage(dbs.service, IDS.competitorX, 'https://smithhall.example/events', 'events');
  return seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: pageId, html: ldHtml(events), capturedAt: at });
};
beforeEach(() => {
  pageId = undefined as unknown as string;
});

const run = async (id: string) => {
  const o = await detectListedEvents(deps(), id);
  if (!o.ran) throw new Error('stage did not run');
  return o.result;
};
const rows = () => dbs.owner.select().from(listedEvent).orderBy(asc(listedEvent.startDate), asc(listedEvent.nameNorm));
const changes = () => dbs.owner.select().from(detectedChange).orderBy(asc(detectedChange.blockKey));

describe('detectListedEvents', () => {
  it('first panel capture → rows, baseline, no change', async () => {
    const cap = await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10, 8:00 PM' }, { title: 'Trivia Bash', subtitle: 'Oct 12' }]);
    expect(await run(cap)).toEqual({ rows: 2, changes: [], baseline: true });
    const r = await rows();
    expect(r.map((x) => [x.name, x.startDate, x.sources, x.status])).toEqual([
      ['Jason Isbell', '2026-10-10', ['google_panel'], 'scheduled'],
      ['Trivia Bash', '2026-10-12', ['google_panel'], 'scheduled'],
    ]);
    expect(r[0]).toMatchObject({ competitorId: IDS.competitorX, eventKey: '2026-10-10:jason isbell', firstCaptureId: cap, lastCaptureId: cap, series: false, startsAt: new Date('2026-10-11T01:00:00Z') });
    expect(await changes()).toEqual([]);
  });

  it('next capture with a new event → one added change with exact details', async () => {
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10, 8:00 PM' }]));
    const cap = await panel(day(7), [{ title: 'Jason Isbell', subtitle: 'Oct 10, 8:00 PM' }, { title: 'Halloween Costume Party', subtitle: 'Oct 31', url: 'https://smithhall.example/halloween' }]);
    const r = await run(cap);
    expect(r).toMatchObject({ rows: 2, baseline: false });
    expect(r.changes).toHaveLength(1);
    const [row] = await dbs.owner.select().from(listedEvent).where(eq(listedEvent.eventKey, '2026-10-31:halloween costume party'));
    const [c, ...rest] = await changes();
    expect(rest).toEqual([]);
    expect(c).toMatchObject({
      id: r.changes[0], competitorId: IDS.competitorX, source: 'google_business_profile', kind: 'added', afterCaptureId: cap, beforeCaptureId: null,
      blockKey: 'event:2026-10-31:halloween costume party:announced', beforeText: null, afterText: 'Halloween Costume Party', stageVersion: LISTED_EVENTS_VERSION, status: 'pending',
    });
    expect(c!.details).toEqual({
      changeType: 'event_listed', lifecycle: 'announced', eventKey: '2026-10-31:halloween costume party', eventName: 'Halloween Costume Party', startDate: '2026-10-31',
      ticketed: false, listedEventId: row!.id, source: 'google_panel', url: 'https://smithhall.example/halloween',
    });
    const [kept] = await dbs.owner.select().from(listedEvent).where(eq(listedEvent.eventKey, '2026-10-10:jason isbell'));
    expect(kept).toMatchObject({ lastCaptureId: cap, lastSeenAt: day(7) });
  });

  it('self-only competitor → rows, no changes', async () => {
    await dbs.owner.insert(competitor).values({ id: SELF, name: 'A1 Own Hall', domain: 'ownhall.example' });
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }], SELF));
    const r = await run(await panel(day(7), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }, { title: 'Big Band Gala', subtitle: 'Oct 24' }], SELF));
    expect(r).toEqual({ rows: 2, changes: [], baseline: false });
    expect(await rows()).toHaveLength(2);
    expect(await changes()).toEqual([]);
  });

  it('event 400 days out → row, no change', async () => {
    await run(await web(day(0), [{ name: 'Spring Gala', startDate: '2026-10-20' }]));
    const r = await run(await web(day(7), [{ name: 'Spring Gala', startDate: '2026-10-20' }, { name: 'Anniversary Ball', startDate: '2027-11-12' }]));
    expect(r).toEqual({ rows: 2, changes: [], baseline: false });
    expect((await rows()).map((x) => x.startDate)).toEqual(['2026-10-20', '2027-11-12']);
  });

  it('weekly residency is series, no change', async () => {
    await run(await panel(day(0), [{ title: 'Jazz Night with the Trio', subtitle: 'Oct 6' }]));
    const r = await run(await panel(day(7), [{ title: 'Jazz Night with the Trio', subtitle: 'Oct 13' }, { title: 'Jazz Night with the Trio', subtitle: 'Oct 20' }]));
    expect(r.changes).toEqual([]);
    expect((await rows()).map((x) => [x.startDate, x.series])).toEqual([['2026-10-06', false], ['2026-10-13', true], ['2026-10-20', true]]);
  });

  it('rerun idempotent', async () => {
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }]));
    const cap = await panel(day(7), [{ title: 'Big Band Gala', subtitle: 'Oct 24' }]);
    expect((await run(cap)).changes).toHaveLength(1);
    expect(await detectListedEvents(deps(), cap)).toEqual({ ran: false });
    expect(await changes()).toHaveLength(1);
  });

  it('reused panel capture no second change', async () => {
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }]));
    const cap = await panel(day(7), [{ title: 'Big Band Gala', subtitle: 'Oct 24' }]);
    await run(cap);
    // A second client starts tracking the venue; the scan reuses the same panel capture (no new capture row).
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    expect(await detectListedEvents(deps(), cap)).toEqual({ ran: false });
    expect(await changes()).toHaveLength(1);
  });

  it('6 announcements = 5 singles + 1 aggregate', async () => {
    await run(await panel(day(0), [{ title: 'Opening Night', subtitle: 'Oct 3' }]));
    const titles = ['Alpha Band', 'Bravo Choir', 'Charlie Quartet', 'Delta Blues', 'Echo Duo', 'Foxtrot Orchestra'];
    const cap = await panel(day(7), titles.map((t, i) => ({ title: t, subtitle: `Oct ${20 - i}` })));
    const r = await run(cap);
    expect(r.changes).toHaveLength(EVENT_SINGLES_MAX + 1);
    const all = await changes();
    const more = all.find((c) => c.blockKey === 'event:more');
    expect(more).toMatchObject({ kind: 'added', afterCaptureId: cap, details: { changeType: 'event_listed', lifecycle: 'announced', count: 1, startDate: '2026-10-20', source: 'google_panel' } });
    // Announced by start date: the five earliest are singles, the latest one is folded into the aggregate.
    expect(all.filter((c) => c.blockKey !== 'event:more').map((c) => c.details.startDate).sort()).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']);
  });

  it('JSON-LD flip → one modified cancelled change; a later flip capture → none', async () => {
    await run(await web(day(0), [{ name: 'Spring Gala', startDate: '2026-10-20' }]));
    const flip = await web(day(7), [{ name: 'Spring Gala', startDate: '2026-10-20', status: 'EventCancelled' }]);
    const r = await run(flip);
    expect(r.changes).toHaveLength(1);
    const [row] = await rows();
    expect(row).toMatchObject({ status: 'cancelled', statusCaptureId: flip, statusChangedAt: day(7), sources: ['web'] });
    expect(await changes()).toEqual([expect.objectContaining({
      kind: 'modified', blockKey: 'event:2026-10-20:spring gala:cancelled', afterText: 'Spring Gala', source: 'web',
      details: expect.objectContaining({ changeType: 'event_listed', lifecycle: 'cancelled', eventKey: '2026-10-20:spring gala', listedEventId: row!.id, source: 'web' }),
    })]);
    expect((await run(await web(day(8), [{ name: 'Spring Gala', startDate: '2026-10-20', status: 'EventCancelled' }]))).changes).toEqual([]);
    expect(await changes()).toHaveLength(1);
  });

  it('past event flip → none', async () => {
    await run(await web(day(0), [{ name: 'Spring Gala', startDate: '2026-10-03' }]));
    const r = await run(await web(day(7), [{ name: 'Spring Gala', startDate: '2026-10-03', status: 'EventCancelled' }]));
    expect(r.changes).toEqual([]);
    expect(await changes()).toEqual([]);
  });

  it('panel event gone next week → no change, row kept', async () => {
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }]));
    const r = await run(await panel(day(7), []));
    expect(r).toEqual({ rows: 0, changes: [], baseline: false });
    expect(await rows()).toEqual([expect.objectContaining({ name: 'Jason Isbell', status: 'scheduled' })]);
    expect(await changes()).toEqual([]);
  });

  it('P7: supersedePriorChanges at a higher version leaves an event_listed row live', async () => {
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }]));
    const cap = await panel(day(7), [{ title: 'Big Band Gala', subtitle: 'Oct 24' }]);
    await run(cap);
    const r = await dbs.service.transaction((tx) => supersedePriorChanges(tx, { afterCaptureId: cap, source: 'google_business_profile' }, 2));
    expect(r.superseded).toBe(0);
    expect((await changes()).map((c) => c.status)).toEqual(['pending']);
  });

  it('web baseline is per tracked page: a new events page starts silently', async () => {
    const home = await seedPage(dbs.service, IDS.competitorX, 'https://smithhall.example/', 'home');
    await run(await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: home, html: ldHtml([]), capturedAt: day(0) }));
    const r = await run(await web(day(7), [{ name: 'Spring Gala', startDate: '2026-10-20' }, { name: 'Autumn Ball', startDate: '2026-10-25' }, { name: 'Winter Fair', startDate: '2026-12-05' }]));
    expect(r).toEqual({ rows: 3, changes: [], baseline: true });
    expect(await changes()).toEqual([]);
  });

  it('Meta ads by seen time: an older capture processed late is the baseline, the newer announces nothing', async () => {
    const c1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(0) });
    const c2 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(7) });
    await dbs.service.insert(ad).values([
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', event: { name: 'Halloween Bash', startsAt: '2026-10-31T01:00:00Z' }, firstSeenAt: day(0), lastSeenAt: day(7), firstCaptureId: c1, lastCaptureId: c2 },
      // A Google ad with an event never counts; nor does a Meta ad seen only between the two captures.
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'g1', event: { name: 'Google Thing', startsAt: '2026-10-29T01:00:00Z' }, firstSeenAt: day(0), lastSeenAt: day(7) },
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm2', event: { name: 'Later Party', startsAt: '2026-11-20T01:00:00Z' }, firstSeenAt: day(3), lastSeenAt: day(3) },
    ]);
    expect(await run(c1)).toEqual({ rows: 1, changes: [], baseline: true });
    expect((await rows()).map((x) => [x.name, x.startDate, x.sources])).toEqual([['Halloween Bash', '2026-10-30', ['meta_ads']]]);
    expect(await run(c2)).toEqual({ rows: 1, changes: [], baseline: false });
    expect(await changes()).toEqual([]);
  });

  it('Meta ad seen seconds after its own first capture is a candidate for that capture', async () => {
    const c1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(0) });
    const late = new Date(day(0).getTime() + 5_000);
    await dbs.service.insert(ad).values({ competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', event: { name: 'Halloween Bash', startsAt: '2026-10-31T01:00:00Z' }, firstSeenAt: late, lastSeenAt: late, firstCaptureId: c1, lastCaptureId: c1 });
    expect(await run(c1)).toEqual({ rows: 1, changes: [], baseline: true });
    expect((await rows()).map((x) => x.name)).toEqual(['Halloween Bash']);
  });

  it('race: two captures planned before either commits announce once', async () => {
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }]));
    const a = await loadEventsCapture(dbs.service, await panel(day(7), [{ title: 'Big Band Gala', subtitle: 'Oct 24' }]));
    const b = await loadEventsCapture(dbs.service, await panel(day(8), [{ title: 'Big Band Gala', subtitle: 'Oct 24' }]));
    const planA = await planListedEvents(deps(), a.cap, a.sourceKey);
    const planB = await planListedEvents(deps(), b.cap, b.sourceKey);
    expect([planA.changes.length, planB.changes.length]).toEqual([1, 1]);
    const ra = await dbs.service.transaction((tx) => commitListedEvents(tx, a.cap, a.sourceKey, planA));
    const rb = await dbs.service.transaction((tx) => commitListedEvents(tx, b.cap, b.sourceKey, planB));
    expect([ra.changes.length, rb.changes.length]).toEqual([1, 0]);
    expect(await changes()).toHaveLength(1);
  });

  it('race: two flip captures planned before either commits flip once', async () => {
    await run(await web(day(0), [{ name: 'Spring Gala', startDate: '2026-10-20' }]));
    const a = await loadEventsCapture(dbs.service, await web(day(7), [{ name: 'Spring Gala', startDate: '2026-10-20', status: 'EventCancelled' }]));
    const b = await loadEventsCapture(dbs.service, await web(day(8), [{ name: 'Spring Gala', startDate: '2026-10-20', status: 'EventCancelled' }]));
    const planA = await planListedEvents(deps(), a.cap, a.sourceKey);
    const planB = await planListedEvents(deps(), b.cap, b.sourceKey);
    await dbs.service.transaction((tx) => commitListedEvents(tx, a.cap, a.sourceKey, planA));
    const rb = await dbs.service.transaction((tx) => commitListedEvents(tx, b.cap, b.sourceKey, planB));
    expect(rb.changes).toEqual([]);
    expect((await changes()).map((c) => c.blockKey)).toEqual(['event:2026-10-20:spring gala:cancelled']);
    expect((await rows())[0]).toMatchObject({ status: 'cancelled', statusCaptureId: a.cap.id });
  });

  it('a first-seen cancelled event gets a row, no change', async () => {
    await run(await web(day(0), [{ name: 'Spring Gala', startDate: '2026-10-20' }]));
    const r = await run(await web(day(7), [{ name: 'Spring Gala', startDate: '2026-10-20' }, { name: 'Autumn Ball', startDate: '2026-10-25', status: 'EventCancelled' }]));
    expect(r.changes).toEqual([]);
    expect((await rows()).map((x) => [x.name, x.status])).toEqual([['Spring Gala', 'scheduled'], ['Autumn Ball', 'cancelled']]);
  });

  it('competitor tracked only by a paused client → rows, no changes', async () => {
    await pauseClient(dbs.owner, IDS.clientA2);
    await run(await panel(day(0), [{ title: 'Smile Day', subtitle: 'Oct 10' }], IDS.competitorY));
    const r = await run(await panel(day(7), [{ title: 'Smile Day', subtitle: 'Oct 10' }, { title: 'Open House', subtitle: 'Oct 24' }], IDS.competitorY));
    expect(r).toEqual({ rows: 2, changes: [], baseline: false });
    expect(await changes()).toEqual([]);
  });

  it('horizon boundaries: today and today+365 announced, today+366 not', async () => {
    await run(await web(day(0), [{ name: 'Spring Gala', startDate: '2026-10-20' }]));
    // day(7) is 2026-10-08 in Chicago.
    const r = await run(await web(day(7), [{ name: 'Today Show Case', startDate: '2026-10-08' }, { name: 'Year Out Gala', startDate: '2027-10-08' }, { name: 'Too Far Fest', startDate: '2027-10-09' }]));
    expect(r.changes).toHaveLength(2);
    expect((await changes()).map((c) => c.details.startDate).sort()).toEqual(['2026-10-08', '2027-10-08']);
    expect(await rows()).toHaveLength(4);
  });

  it('panel + web for the same event: one row, sources merged, one change', async () => {
    await run(await panel(day(0), [{ title: 'Jason Isbell', subtitle: 'Oct 10' }]));
    await run(await web(day(0), []));
    expect((await run(await web(day(7), [{ name: 'Big Band Gala', startDate: '2026-10-24T20:00:00-05:00', price: 25 }]))).changes).toHaveLength(1);
    expect((await run(await panel(day(8), [{ title: 'Big Band Gala', subtitle: 'Oct 24, 8:00 PM' }]))).changes).toEqual([]);
    const gala = (await rows()).filter((x) => x.nameNorm === 'big band gala');
    expect(gala).toEqual([expect.objectContaining({ sources: ['google_panel', 'web'], ticketed: true })]);
    expect(await changes()).toHaveLength(1);
  });

  it('refuses a capture that is not an ok events capture', async () => {
    const posts = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', url: 'gbp:posts', capturedAt: day(0) });
    await expect(detectListedEvents(deps(), posts)).rejects.toThrow(/not an ok/);
  });
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

describe('findEngineWork listedEvents', () => {
  it('lists settled, recent accepted captures of workable tracked or self competitors, oldest first, not finished', async () => {
    await dbs.owner.insert(competitor).values({ id: SELF, name: 'A1 Own Hall', domain: 'ownhall.example' });
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
    const old = await panel(hoursAgo(20 * 24), []);
    const p1 = await panel(hoursAgo(80), []);
    const p0 = await panel(hoursAgo(90), [], SELF);
    const w = await web(hoursAgo(70), []);
    const meta = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: hoursAgo(60) });
    const posts = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', url: 'gbp:posts', capturedAt: hoursAgo(50) });
    const failed = randomUUID();
    await dbs.service.insert(capture).values({ id: failed, competitorId: IDS.competitorX, source: 'meta_ads', status: 'failed', collectorVersion: 'test/1', capturedAt: hoursAgo(40) });
    const fresh = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: new Date() });
    await dbs.owner.insert(competitor).values({ id: '00000000-0000-4000-8000-0000000000fa', name: 'Nobody', domain: 'nobody.example' });
    const untracked = await panel(hoursAgo(30), [], '00000000-0000-4000-8000-0000000000fa');
    await pauseClient(dbs.owner, IDS.clientA2);
    const pausedOnly = await panel(hoursAgo(20), [], IDS.competitorY);
    await run(p1);

    const list = (await findEngineWork(dbs.service, { limit: 50 })).listedEvents;
    expect(list).toEqual([p0, w, meta]);
    for (const id of [old, p1, posts, failed, fresh, untracked, pausedOnly]) expect(list).not.toContain(id);
    expect([LISTED_EVENTS_STAGE, LISTED_EVENTS_LOOKBACK_DAYS]).toEqual(['listed_events', 14]);
  });
});
