import { describe, expect, it } from 'vitest';
import type { Scorecard } from './scorecard';
import { scorecardModel } from './scorecard-model';

const id = '00000000-0000-4000-8000-000000000001';
const sc = (over: Partial<Scorecard> = {}): Scorecard => ({
  asOf: '2026-10-14T00:00:00Z', baselineBriefId: null,
  tiles: [
    { metric: 'rating', you: 4.6, rivalMedian: 4.45, deltaSinceStart: null },
    { metric: 'reviews90d', you: 12, rivalMedian: 30, deltaSinceStart: null },
    { metric: 'replyRate', you: 0.314, rivalMedian: null, deltaSinceStart: null },
    { metric: 'mapTop3Share', you: null, rivalMedian: 0.5, deltaSinceStart: null },
  ],
  rows: [
    { competitorId: id, name: 'A1 HVAC', self: true, tier: null, values: { rating: 4.6, reviews90d: 12, replyRate: 0.314, mapTop3Share: null, adsActive: null, metaAdsActive: 2, googlePosts30d: null, listings: null, upcomingEvents: null, tripadvisorRating: null, socialPosts30d: null } },
    { competitorId: id, name: 'Smith', self: false, tier: 'top', values: { rating: 4.45, reviews90d: 30, replyRate: 0.5, mapTop3Share: 0.5, adsActive: 3, metaAdsActive: 0, googlePosts30d: 4, listings: 8, upcomingEvents: null, tripadvisorRating: null, socialPosts30d: null } },
  ],
  evidenceIds: [], openFirstMoves: [{ recommendationId: id, title: 'Reply to reviews' }], ...over,
});

describe('scorecardModel', () => {
  it('formats nulls as —', () => {
    const m = scorecardModel(sc(), { clientName: 'A1 HVAC' });
    expect(m.tiles.map((t) => t.value)).toEqual(['4.6', '12', '31%', '—']);
    expect(m.tiles[0]!.sub).toBe('rivals 4.45 median');
    expect(m.tiles[2]!.sub).toBe('rivals — median');
    expect(m.tiles.map((t) => t.label)).toEqual(['Rating', 'New reviews · 90 d', 'Reply rate', 'Top-3 in map pack']);
    expect(m.table.rows[0]!.cells).toEqual(['A1 HVAC (you)', '4.6', '12', '31%', '—', '—', '2', '—', '—']);
    expect(m.table.rows[1]).toMatchObject({ self: false, tier: 'top' });
    expect(m.openFirstMoves).toEqual(['Reply to reviews']);
    expect(m.tiles.every((t) => t.trend === null && t.trendText === null)).toBe(true);
  });
  it('trend text present with arrows', () => {
    const s = sc();
    s.tiles[0]!.deltaSinceStart = -0.1; s.tiles[1]!.deltaSinceStart = 4; s.tiles[2]!.deltaSinceStart = 0.06; s.tiles[3]!.deltaSinceStart = 0;
    const m = scorecardModel(s, { clientName: 'A1 HVAC' });
    expect(m.tiles.map((t) => t.trend)).toEqual(['down', 'up', 'up', null]);
    expect(m.tiles.map((t) => t.trendText)).toEqual(['▼ 0.1 since your starting point', '▲ 4 since your starting point', '▲ 6 pts since your starting point', 'No change since your starting point']);
  });
  it('adds the Google posts column; a scorecard stored without the key shows the not-measured mark', () => {
    const m = scorecardModel(sc(), { clientName: 'A1 HVAC' });
    expect(m.table.headers.at(-2)).toBe('Google posts (30 days)');
    expect(m.table.headers).toHaveLength(m.table.rows[0]!.cells.length);
    expect(m.table.rows[1]!.cells.at(-2)).toBe('4');
    expect(m.table.rows[0]!.cells.at(-2)).toBe('—');
  });
  it('adds the Directory listings column; never audited shows the not-measured mark', () => {
    const m = scorecardModel(sc(), { clientName: 'A1 HVAC' });
    expect(m.table.headers.at(-1)).toBe('Directory listings');
    expect(m.table.rows[1]!.cells.at(-1)).toBe('8');
    expect(m.table.rows[0]!.cells.at(-1)).toBe('—');
  });
  it('hvac scorecard has no events/tripadvisor column (all null)', () => {
    const m = scorecardModel(sc(), { clientName: 'A1 HVAC' });
    expect(m.table.headers).not.toContain('Upcoming events');
    expect(m.table.headers).not.toContain('Tripadvisor rating');
    expect(m.table.rows.every((r) => r.cells.length === m.table.headers.length)).toBe(true);
  });
  it('venues row values shown: events count and Tripadvisor rating', () => {
    const s = sc();
    s.rows[0]!.values.upcomingEvents = 0; s.rows[0]!.values.tripadvisorRating = null;
    s.rows[1]!.values.upcomingEvents = 3; s.rows[1]!.values.tripadvisorRating = 4.5;
    const m = scorecardModel(s, { clientName: 'A1 HVAC' });
    expect(m.table.headers.slice(-2)).toEqual(['Upcoming events', 'Tripadvisor rating']);
    expect(m.table.rows[0]!.cells.slice(-2)).toEqual(['0', '—']);
    expect(m.table.rows[1]!.cells.slice(-2)).toEqual(['3', '4.5']);
    expect(m.table.headers).toHaveLength(m.table.rows[0]!.cells.length);
  });
  it('drops the events column when every row is null or 0, and keeps Tripadvisor alone', () => {
    const s = sc();
    s.rows[0]!.values.upcomingEvents = 0; s.rows[1]!.values.upcomingEvents = null; s.rows[1]!.values.tripadvisorRating = 4;
    const m = scorecardModel(s, { clientName: 'A1 HVAC' });
    expect(m.table.headers.slice(-2)).toEqual(['Directory listings', 'Tripadvisor rating']);
    expect(m.table.rows[1]!.cells.at(-1)).toBe('4.0');
  });
});
