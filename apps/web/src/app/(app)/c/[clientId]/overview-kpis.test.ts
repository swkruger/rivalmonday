import { describe, expect, it } from 'vitest';
import { briefLabel, kpiCards, latestBrief } from './overview-kpis';

const base = { clientId: 'c', trackedCompetitors: 5, zips: 12, changes7d: 14, alerts7d: 3, priceMoves7d: 2, priceCuts7d: 1, activeAds: 23, activeAds7dAgo: 14, rating: { self: 4.8, competitorAverage: 4.5 }, pressure: [], pitchSnapshot: false };

describe('kpiCards', () => {
  it('builds the four mockup cards', () => {
    expect(kpiCards(base, { agency: true })).toEqual([
      { title: 'Changes this week', value: '14', pill: { text: '3 high', tone: 'warn' }, hint: 'Across websites, ads, reviews and profiles' },
      { title: 'Competitor price moves', value: '2', pill: { text: '↓ 1 cut', tone: 'down' }, hint: 'On services you also offer' },
      { title: 'Active competitor ads', value: '23', pill: { text: '+9 vs last week', tone: 'info' }, hint: 'Meta and Google, where visible' },
      { title: 'Your rating vs area', value: '4.8 ★', pill: { text: '+0.3 above avg', tone: 'up' }, hint: 'Competitor average 4.5' },
    ]);
  });
  it('degrades honestly when data is missing', () => {
    const c = kpiCards({ ...base, alerts7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, rating: { self: null, competitorAverage: 4.5 } }, { agency: true });
    expect(c[0]!.pill).toBeNull();
    expect(c[1]!.pill).toBeNull();
    expect(c[2]).toMatchObject({ value: '—', pill: null, hint: 'The first weekly ad check fills this in' });
    expect(c[3]).toMatchObject({ value: '—', pill: null, hint: 'Add your Google place id to compare' });
    expect(kpiCards({ ...base, rating: { self: null, competitorAverage: 4.5 } }, { agency: false })[3]).toMatchObject({ value: '—', pill: null, hint: 'Not available yet' });
    expect(kpiCards({ ...base, rating: { self: 4.2, competitorAverage: 4.5 } }, { agency: true })[3]!.pill).toEqual({ text: '−0.3 below avg', tone: 'down' });
  });
  it('words ties, drops and plurals', () => {
    expect(kpiCards({ ...base, priceCuts7d: 2 }, { agency: true })[1]!.pill!.text).toBe('↓ 2 cuts');
    expect(kpiCards({ ...base, activeAds: 10 }, { agency: true })[2]!.pill!.text).toBe('−4 vs last week');
    expect(kpiCards({ ...base, activeAds: 14 }, { agency: true })[2]!.pill!.text).toBe('Same as last week');
    expect(kpiCards({ ...base, rating: { self: 4.5, competitorAverage: 4.5 } }, { agency: true })[3]!.pill).toEqual({ text: 'On par with the area', tone: 'info' });
  });
});

const b = (id: string, deliveryDate: string, generatedAt: string | null, kind = 'weekly') => ({ id, deliveryDate, generatedAt, kind });

describe('latestBrief', () => {
  it('prefers a starting point generated after a future-dated weekly brief', () => {
    const items = [b('weekly', '2026-10-19', '2026-10-14T06:00:00Z'), b('sp', '2026-10-15', '2026-10-15T09:00:00Z', 'starting_point')];
    const { latest, rest } = latestBrief(items);
    expect(latest?.id).toBe('sp');
    expect(rest.map((x) => x.id)).toEqual(['weekly']);
  });
  it('falls back to deliveryDate when generatedAt is null', () => {
    const items = [b('old', '2026-10-05', null), b('new', '2026-10-12', null)];
    expect(latestBrief(items).latest?.id).toBe('new');
  });
  it('keeps list order on ties and for the rest', () => {
    const items = [b('a', '2026-10-12', '2026-10-12T00:00:00Z'), b('b', '2026-10-12', '2026-10-12T00:00:00Z'), b('c', '2026-10-05', '2026-10-05T00:00:00Z')];
    const { latest, rest } = latestBrief(items);
    expect(latest?.id).toBe('a');
    expect(rest.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('handles an empty list', () => {
    expect(latestBrief([])).toEqual({ latest: null, rest: [] });
  });
});

describe('brief labels', () => {
  it('label switches on kind', () => {
    expect(briefLabel({ kind: 'starting_point', deliveryDate: '2026-10-15' })).toBe('Starting point · 2026-10-15');
    expect(briefLabel({ kind: 'weekly', deliveryDate: '2026-10-19' })).toBe('Brief for the week of 2026-10-19');
  });
});
