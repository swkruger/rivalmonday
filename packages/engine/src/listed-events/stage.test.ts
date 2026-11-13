import { GBP_EVENTS_URL, VENUE_PANEL_KIND } from '@cs/collectors';
import { capture, client, clientCompetitor, competitor, detectedChange, listedEvent, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedPage, seedVendorCapture, seedWebCapture } from '../../test/seed';
import { supersedePriorChanges } from '../events/retract';
import { findEngineWork } from '../sweep';
import { detectListedEvents, EVENT_SINGLES_MAX, LISTED_EVENTS_STAGE, LISTED_EVENTS_VERSION } from './stage';

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

  it('refuses a capture that is not an ok events capture', async () => {
    const posts = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', url: 'gbp:posts', capturedAt: day(0) });
    await expect(detectListedEvents(deps(), posts)).rejects.toThrow(/not an ok/);
  });
});

describe('findEngineWork listedEvents', () => {
  it('lists settled accepted captures of tracked or self competitors, oldest first, not finished', async () => {
    await dbs.owner.insert(competitor).values({ id: SELF, name: 'A1 Own Hall', domain: 'ownhall.example' });
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
    const p1 = await panel(day(1), []);
    const p0 = await panel(day(0), [], SELF);
    const w = await web(day(2), []);
    const meta = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(3) });
    const posts = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', url: 'gbp:posts', capturedAt: day(4) });
    const failed = randomUUID();
    await dbs.service.insert(capture).values({ id: failed, competitorId: IDS.competitorX, source: 'meta_ads', status: 'failed', collectorVersion: 'test/1', capturedAt: day(5) });
    const fresh = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: new Date() });
    await dbs.owner.insert(competitor).values({ id: '00000000-0000-4000-8000-0000000000fa', name: 'Nobody', domain: 'nobody.example' });
    const untracked = await panel(day(6), [], '00000000-0000-4000-8000-0000000000fa');
    await run(p1);

    const list = (await findEngineWork(dbs.service, { limit: 50 })).listedEvents;
    expect(list).toEqual([p0, w, meta]);
    for (const id of [p1, posts, failed, fresh, untracked]) expect(list).not.toContain(id);
    expect(LISTED_EVENTS_STAGE).toBe('listed_events');
  });
});
