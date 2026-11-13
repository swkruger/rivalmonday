import { ChangeLine, type GradedChanges } from '@cs/core';
import { briefItem, brief, changeEvent, clientCompetitor, competitor, detectedChange, eventChange, evidence, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { changeTypeLabel, groupPhrase } from '@cs/email';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { type GradableEvent, gradedChanges, groupChanges, liveChanges } from './graded';
import type { BriefClient } from './gather';

const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const T0 = Date.parse('2026-11-01T12:00:00Z');
const HOUR = 3_600_000;

const ev = (n: number, over: Partial<GradableEvent> = {}): GradableEvent => ({
  eventId: uid(n),
  competitorId: uid(900),
  competitorName: 'Lakeview',
  changeType: 'price_change',
  channel: null,
  score: 80,
  summary: `Summary ${n}`,
  occurredAt: new Date(T0 + n * HOUR),
  evidenceIds: [uid(5000 + n)],
  ...over,
});

const digitRuns = (s: string) => s.match(/\d+/g) ?? [];

describe('citation_added lines (18c P7)', () => {
  it('is always Minor, even at T = 0, under rankings', () => {
    const rows = [ev(1, { changeType: 'citation_added', channel: 'directories', score: 0, summary: 'Now found on Better Business Bureau in Google search' })];
    const [one] = groupChanges(rows, 0);
    expect(one).toMatchObject({ grade: 'minor', topic: 'rankings', text: 'Lakeview: New directory listing — Now found on Better Business Bureau in Google search' });
    const [two] = groupChanges([...rows, ev(2, { changeType: 'citation_added', channel: 'directories', score: 0 })], 0);
    expect(two).toMatchObject({ grade: 'minor', count: 2, text: 'Lakeview: 2 new directory listings' });
  });
});

describe('event_listed lines (18d)', () => {
  it('groups two events of one rival as event updates under offers', () => {
    const rows = [
      ev(1, { changeType: 'event_listed', channel: 'web', score: 48, summary: 'Listed an event: "Jazz Night" on Dec 4' }),
      ev(2, { changeType: 'event_listed', channel: 'web', score: 48, summary: 'Listed an event: "Comedy Night" on Dec 5' }),
    ];
    const [line] = groupChanges(rows, 40);
    expect(line).toMatchObject({ grade: 'major', topic: 'offers', count: 2, text: 'Lakeview: 2 event updates' });
    const [one] = groupChanges(rows.slice(0, 1), 40);
    expect(one!.text).toBe('Lakeview: Event update — Listed an event: "Jazz Night" on Dec 4');
  });
});

describe('groupChanges', () => {
  it('single event line uses label and clipped summary', () => {
    const [line] = groupChanges([ev(1, { summary: '  Raised   prices\n on  drain cleaning  ' })], 70);
    expect(line!.text).toBe('Lakeview: Price change — Raised prices on drain cleaning');
    expect(ChangeLine.parse(line)).toEqual(line);
    expect(line).toMatchObject({ grade: 'major', topic: 'offers', count: 1, channel: null, eventIds: [uid(1)], evidenceIds: [uid(5001)] });

    const [long] = groupChanges([ev(2, { summary: 'x'.repeat(200) })], 70);
    const clipped = long!.text.slice('Lakeview: Price change — '.length);
    expect([...clipped]).toHaveLength(140);
    expect(clipped.endsWith('…')).toBe(true);
  });

  it('six stopped Google ads → "Lakeview: 6 Google ads stopped"', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ev(i + 1, { changeType: 'ad_stopped', channel: 'google_ads', score: 60 }));
    const lines = groupChanges(rows, 70);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ grade: 'notable', topic: 'ads', count: 6, text: 'Lakeview: 6 Google ads stopped' });
    expect(ChangeLine.parse(lines[0])).toBeTruthy();
  });

  it('Google and Meta ads stay separate lines', () => {
    const rows = [
      ev(1, { changeType: 'ad_started', channel: 'google_ads' }),
      ev(2, { changeType: 'ad_started', channel: 'google_ads' }),
      ev(3, { changeType: 'ad_started', channel: 'meta_ads' }),
      ev(4, { changeType: 'ad_started', channel: 'meta_ads' }),
      ev(5, { changeType: 'ad_started', channel: 'meta_ads' }),
    ];
    const texts = groupChanges(rows, 70).map((l) => l.text).sort();
    expect(texts).toEqual(['Lakeview: 2 Google ads started', 'Lakeview: 3 Meta ads started']);
  });

  it('same competitor+type split by grade', () => {
    const lines = groupChanges([ev(1, { score: 75 }), ev(2, { score: 35 }), ev(3, { score: 10 })], 70);
    expect(lines.map((l) => [l.grade, l.count])).toEqual([
      ['major', 1],
      ['notable', 1],
      ['minor', 1],
    ]);
  });

  it('sort is grade, topic, max score, lastAt', () => {
    const id = { Alpha: uid(901), Bravo: uid(902), Charlie: uid(903), Kilo: uid(904), Zulu: uid(905) };
    const rows = [
      ev(1, { competitorName: 'Bravo', competitorId: id.Bravo, changeType: 'rating_change', score: 75 }),
      ev(2, { competitorName: 'Alpha', competitorId: id.Alpha, changeType: 'rating_change', score: 90 }),
      ev(3, { competitorName: 'Zulu', competitorId: id.Zulu, changeType: 'ad_started', channel: 'google_ads', score: 99 }),
      ev(4, { competitorName: 'Alpha', competitorId: id.Alpha, changeType: 'rating_change', score: 60 }),
      ev(5, { competitorName: 'Kilo', competitorId: id.Kilo, changeType: 'price_change', score: 80 }),
      ev(6, { competitorName: 'Charlie', competitorId: id.Charlie, changeType: 'rating_change', score: 75, occurredAt: new Date(T0 + 10 * HOUR) }),
    ];
    const lines = groupChanges(rows, 70);
    expect(lines.map((l) => l.competitorName)).toEqual(['Alpha', 'Charlie', 'Bravo', 'Zulu', 'Kilo', 'Alpha']);
    expect(lines.map((l) => l.grade)).toEqual(['major', 'major', 'major', 'major', 'major', 'notable']);
  });

  it('deterministic for shuffled input', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      ev(i + 1, {
        competitorName: ['Lakeview', 'Maple', 'Northside'][i % 3]!,
        competitorId: uid(900 + (i % 3)),
        changeType: ['price_change', 'rating_change', 'ad_started'][i % 3]!,
        channel: i % 3 === 2 ? 'meta_ads' : null,
        score: (i * 37) % 100,
      }),
    );
    const a = groupChanges(rows, 70);
    expect(groupChanges([...rows].reverse(), 70)).toEqual(a);
    expect(groupChanges([...rows.slice(7), ...rows.slice(0, 7)], 70)).toEqual(a);
  });

  it('groups 240 events into bounded lines', () => {
    const names = ['Lakeview', 'Maple', 'Northside', 'Riverbend'];
    const combos = [
      { changeType: 'price_change', channel: null },
      { changeType: 'ad_started', channel: 'google_ads' },
      { changeType: 'ad_started', channel: 'meta_ads' },
      { changeType: 'rating_change', channel: null },
    ];
    const rows = Array.from({ length: 240 }, (_, n) => {
      const c = combos[(n >> 2) % 4]!;
      return ev(n + 1, {
        competitorName: names[n % 4]!,
        competitorId: uid(900 + (n % 4)),
        changeType: c.changeType,
        channel: c.channel,
        score: (n * 37) % 100,
        occurredAt: new Date(T0 + n * 60_000),
      });
    });
    const lines = groupChanges(rows, 70);
    // competitors × (type, channel) combos × grades
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(names.length * combos.length * 3);
    const ids = lines.flatMap((l) => l.eventIds).sort();
    expect(ids).toEqual(rows.map((r) => r.eventId).sort());
    for (const l of lines) ChangeLine.parse(l);
  });

  it('line text contains no number absent from the stored summary or count', () => {
    const rows = [
      ev(1, { changeType: 'price_change', summary: 'Price moved from $249 to $299 (+20%)' }),
      ev(2, { changeType: 'rating_change', summary: 'Rating fell 4.6 to 4.2 after 37 new reviews', score: 80 }),
      ev(3, { changeType: 'ad_started', channel: 'google_ads', summary: 'Google ads started (2 creatives)', score: 80 }),
      ev(4, { changeType: 'ad_started', channel: 'google_ads', summary: 'Google ads started (3 creatives)', score: 80 }),
      ev(5, { changeType: 'ad_stopped', channel: 'meta_ads', summary: 'Meta ad paused, 14 days running', score: 50 }),
      ev(6, { changeType: 'ad_stopped', channel: 'meta_ads', summary: 'Meta ad paused, 9 days running', score: 50 }),
    ];
    const summaryById = new Map(rows.map((r) => [r.eventId, r.summary]));
    const lines = groupChanges(rows, 70);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const allowed = new Set([String(l.count), ...l.eventIds.flatMap((id) => digitRuns(summaryById.get(id)!))]);
      for (const run of digitRuns(l.text)) expect(allowed.has(run), `${run} in "${l.text}"`).toBe(true);
    }
  });
});

describe('gradedChanges / liveChanges (db)', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  const period = { start: day(0), end: day(7) };
  const c = { id: IDS.clientA1, briefThreshold: 40 } as BriefClient;
  const ev = (o: Partial<Parameters<typeof seedScoredEvent>[1]> = {}) =>
    seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(3), createdAt: day(3), ...o });
  const read = (written = new Set<string>()) => gradedChanges({ db: dbs.service }, c, period, written);
  const ids = (g: GradedChanges) => g.lines.flatMap((l) => l.eventIds).sort();

  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
  });

  it('reads any route in the scoredAt window', async () => {
    const a = await ev({ route: 'brief', score: 55 });
    const b = await ev({ route: 'alert', score: 82 });
    const d = await ev({ route: 'archive', score: 10 });
    await ev({ scoredAt: day(8) });
    await ev({ scoredAt: day(0) }); // window is (start, end]
    const g = await read();
    expect(ids(g)).toEqual([a.eventId, b.eventId, d.eventId].sort());
    expect(g.v).toBe(1);
    expect(g.threshold).toBe(40);
    expect(g.lines.every((l) => l.evidenceIds.length > 0)).toBe(true);
    expect(g.lines.find((l) => l.eventIds[0] === d.eventId)!.grade).toBe('minor');
  });

  it('excludes cosmetic, retracted, featured, written, too-old and untracked', async () => {
    const keep = await ev();
    await ev({ changeType: 'cosmetic' });
    const retracted = await ev();
    await dbs.service.update(changeEvent).set({ retractedAt: day(4), retractionReason: 'r' }).where(eq(changeEvent.id, retracted.eventId));
    const featured = await ev();
    const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-09-28', periodStart: day(-7), periodEnd: day(0), status: 'approved' }).returning({ id: brief.id });
    await dbs.service.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'M', impact: 'M', eventIds: [featured.eventId] });
    const written = await ev();
    await ev({ occurredAt: day(-40), createdAt: day(3) });
    const Y = '00000000-0000-4000-8000-0000000000f9';
    await dbs.owner.insert(competitor).values({ id: Y, name: 'Untracked Co', domain: 'untracked.example' });
    await ev({ competitorId: Y });
    expect(ids(await read(new Set([written.eventId])))).toEqual([keep.eventId]);
  });

  it('major events without an item become major lines', async () => {
    const m = await ev({ score: 90 });
    const w = await ev({ score: 95, changeType: 'rating_change' });
    const g = await read(new Set([w.eventId]));
    expect(g.lines).toHaveLength(1);
    expect(g.lines[0]).toMatchObject({ grade: 'major', eventIds: [m.eventId], channel: 'web' });
    expect(g.totals).toEqual({ major: 2, notable: 0, minor: 0 });
  });

  const seedFour = async () => {
    // one line of 3 price changes (notable) + one line of 1 other
    const e1 = await ev({ score: 30, summary: 'secret one', occurredAt: day(1), scoredAt: day(1) });
    const e2 = await ev({ score: 30, summary: 'secret two', occurredAt: day(2), scoredAt: day(2) });
    const e3 = await ev({ score: 30, summary: 'secret three', occurredAt: day(3), scoredAt: day(3) });
    const e4 = await ev({ score: 10, changeType: 'rating_change', summary: 'other', occurredAt: day(4), scoredAt: day(4) });
    return { e1, e2, e3, e4 };
  };

  it('liveChanges drops retracted, untracked and dropped-item events', async () => {
    const { e1, e2, e3, e4 } = await seedFour();
    const g = await read();
    const total = g.lines.reduce((n, l) => n + l.count, 0);
    expect(total).toBe(4);
    await dbs.service.update(changeEvent).set({ retractedAt: day(5), retractionReason: 'r' }).where(eq(changeEvent.id, e1.eventId));
    const v = await liveChanges(dbs.service, IDS.clientA1, g, { activeItemEventIds: [], droppedItemEventIds: [e2.eventId] });
    const line = v.lines.find((l) => l.changeType === 'price_change')!;
    expect(line).toMatchObject({ count: 1, eventIds: [e3.eventId] });
    expect(line.text).toBe(`Smith HVAC: ${changeTypeLabel('price_change')}`);
    expect(line.text).not.toMatch(/secret/);
    expect(v.totals).toEqual({ major: 0, notable: 1, minor: 1 });
    // untracked: the whole competitor goes
    await dbs.owner.delete(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, IDS.competitorX)));
    const v2 = await liveChanges(dbs.service, IDS.clientA1, g, { activeItemEventIds: [e4.eventId], droppedItemEventIds: [] });
    expect(v2).toEqual({ lines: [], totals: { major: 0, notable: 0, minor: 0 } });
  });

  it('liveChanges keeps a line identical when nothing changed', async () => {
    await seedFour();
    const g = await read();
    const v = await liveChanges(dbs.service, IDS.clientA1, g, { activeItemEventIds: [], droppedItemEventIds: [] });
    expect(v.lines).toEqual(g.lines);
    expect(v.totals).toEqual(g.totals);
  });

  it('liveChanges with no lines and no items makes no query', async () => {
    const conn = { select: () => { throw new Error('queried'); } } as never;
    const g: GradedChanges = { v: 1, threshold: 40, lines: [], totals: { major: 0, notable: 0, minor: 0 } };
    expect(await liveChanges(conn, IDS.clientA1, g, { activeItemEventIds: [], droppedItemEventIds: [] })).toEqual({ lines: [], totals: { major: 0, notable: 0, minor: 0 } });
  });

  it('a shrunk line regroups: n >= 2 phrase, evidence and times of the kept events only', async () => {
    const a = await ev({ score: 45, occurredAt: day(1), scoredAt: day(1) });
    const b = await ev({ score: 45, occurredAt: day(2), scoredAt: day(2) });
    const d = await ev({ score: 45, occurredAt: day(3), scoredAt: day(3) });
    const g = await read();
    expect(g.lines).toHaveLength(1);
    const ev0 = async (id: string) => (await dbs.service.select({ id: evidence.id }).from(eventChange).innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId)).innerJoin(evidence, eq(evidence.captureId, detectedChange.afterCaptureId)).where(eq(eventChange.eventId, id))).map((r) => r.id);
    const keptEvidence = [...(await ev0(a.eventId)), ...(await ev0(b.eventId))].sort();
    const v = await liveChanges(dbs.service, IDS.clientA1, g, { activeItemEventIds: [], droppedItemEventIds: [d.eventId] });
    expect(v.lines[0]).toMatchObject({
      count: 2, eventIds: [a.eventId, b.eventId], text: `Smith HVAC: ${groupPhrase('price_change', 'web', 2)}`,
      evidenceIds: keptEvidence, firstAt: day(1).toISOString(), lastAt: day(2).toISOString(),
    });
    expect(g.lines[0]!.evidenceIds).toHaveLength(3);
    expect(JSON.stringify(v)).not.toMatch(/"score"/);
  });

  it('dropping the highest-scoring event moves the line grade down', async () => {
    const top = await ev({ score: 90, occurredAt: day(1), scoredAt: day(1) });
    await ev({ score: 45, occurredAt: day(2), scoredAt: day(2) });
    await ev({ score: 45, occurredAt: day(3), scoredAt: day(3) });
    const g = await read();
    expect(g.lines).toHaveLength(1);
    expect(g.lines[0]!.grade).toBe('major');
    // threshold 70: the two remaining 45s grade notable (>= 35), the 90 was major
    const v = await liveChanges(dbs.service, IDS.clientA1, { ...g, threshold: 70 }, { activeItemEventIds: [], droppedItemEventIds: [top.eventId] });
    expect(v.lines[0]).toMatchObject({ grade: 'notable', count: 2 });
    expect(v.totals).toEqual({ major: 0, notable: 2, minor: 0 });
  });

  it('inside withTenant another client\'s event id in a line is dropped', async () => {
    const mine = await ev({ score: 45 });
    const theirs = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorY, clientId: IDS.clientA2, agencyId: IDS.agencyA, occurredAt: day(3), createdAt: day(3), score: 45 });
    const g = await read();
    const line = g.lines[0]!;
    const tainted: GradedChanges = { ...g, lines: [{ ...line, count: 2, eventIds: [mine.eventId, theirs.eventId] }] };
    const v = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) =>
      liveChanges(tx, IDS.clientA1, tainted, { activeItemEventIds: [], droppedItemEventIds: [] }));
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0]).toMatchObject({ count: 1, eventIds: [mine.eventId], text: `Smith HVAC: ${changeTypeLabel('price_change')}` });
    expect(v.lines[0]!.evidenceIds.length).toBeGreaterThan(0);
  });
});
