import { describe, expect, it } from 'vitest';
import { kpiCards } from './overview-kpis';

const base = { clientId: 'c', trackedCompetitors: 5, zips: 12, changes7d: 14, alerts7d: 3, priceMoves7d: 2, priceCuts7d: 1, activeAds: 23, activeAds7dAgo: 14, rating: { self: 4.8, competitorAverage: 4.5 }, pressure: [], pitchSnapshot: false };

describe('kpiCards', () => {
  it('builds the four mockup cards', () => {
    expect(kpiCards(base)).toEqual([
      { title: 'Changes this week', value: '14', pill: { text: '3 high', tone: 'warn' }, hint: 'Across websites, ads, reviews and profiles' },
      { title: 'Competitor price moves', value: '2', pill: { text: '↓ 1 cut', tone: 'down' }, hint: 'On services you also offer' },
      { title: 'Active competitor ads', value: '23', pill: { text: '+9 vs last week', tone: 'info' }, hint: 'Meta and Google, where visible' },
      { title: 'Your rating vs area', value: '4.8 ★', pill: { text: '+0.3 above avg', tone: 'up' }, hint: 'Competitor average 4.5' },
    ]);
  });
  it('degrades honestly when data is missing', () => {
    const c = kpiCards({ ...base, alerts7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, rating: { self: null, competitorAverage: 4.5 } });
    expect(c[0]!.pill).toBeNull();
    expect(c[1]!.pill).toBeNull();
    expect(c[2]).toMatchObject({ value: '—', pill: null, hint: 'The first weekly ad check fills this in' });
    expect(c[3]).toMatchObject({ value: '—', pill: null, hint: 'Add your Google place id to compare' });
    expect(kpiCards({ ...base, rating: { self: 4.2, competitorAverage: 4.5 } })[3]!.pill).toEqual({ text: '−0.3 below avg', tone: 'down' });
  });
  it('words ties, drops and plurals', () => {
    expect(kpiCards({ ...base, priceCuts7d: 2 })[1]!.pill!.text).toBe('↓ 2 cuts');
    expect(kpiCards({ ...base, activeAds: 10 })[2]!.pill!.text).toBe('−4 vs last week');
    expect(kpiCards({ ...base, activeAds: 14 })[2]!.pill!.text).toBe('Same as last week');
    expect(kpiCards({ ...base, rating: { self: 4.5, competitorAverage: 4.5 } })[3]!.pill).toEqual({ text: 'On par with the area', tone: 'info' });
  });
});
