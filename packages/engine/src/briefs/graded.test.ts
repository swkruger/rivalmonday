import { ChangeLine } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { type GradableEvent, groupChanges } from './graded';

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
