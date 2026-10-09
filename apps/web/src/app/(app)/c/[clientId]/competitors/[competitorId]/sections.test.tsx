// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdsSection, PricesSection, RankingsSection, ReviewsSection } from './sections';

const C = 'c1';
const X = 'x1';

describe('competitor profile sections (decision 13)', () => {
  it('lists up to five current prices and links to pricing', () => {
    render(<PricesSection clientId={C} competitorId={X} matrix={{
      services: [{ id: 'ac_tune_up', name: 'AC tune-up', offered: true }],
      rows: [{ competitorId: X, name: 'Smith HVAC', cells: [{ serviceId: 'ac_tune_up', prices: [{ amount: 79, unit: 'USD', qualifier: 'exact', promo: false, since: '2026-10-01T00:00:00.000Z' }], change: null }] }],
    }} />);
    expect(screen.getByRole('heading', { name: 'Prices' })).toBeTruthy();
    expect(screen.getByText('AC tune-up')).toBeTruthy();
    expect(screen.getByText('$79')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See pricing' }).getAttribute('href')).toBe(`/c/${C}/pricing?competitor=${X}&service=ac_tune_up`);
  });

  it('shows the newest active ads, or says there are none', () => {
    const { unmount } = render(<AdsSection clientId={C} competitorId={X} ads={{ hasMore: false, items: [{ id: 'a', competitorId: X, competitorName: 'Smith HVAC', platform: 'meta', format: null, title: '$49 tune-up', text: null, landingUrl: null, firstSeenAt: '2026-09-12T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z', endedAt: null, active: true, libraryUrl: null }] }} />);
    expect(screen.getByText('$49 tune-up')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See ads' }).getAttribute('href')).toBe(`/c/${C}/ads?competitor=${X}`);
    unmount();
    render(<AdsSection clientId={C} competitorId={X} ads={{ hasMore: false, items: [] }} />);
    expect(screen.getByText('No active ads.')).toBeTruthy();
  });

  it('compares its top themes with yours', () => {
    const theme = (themeId: string, share: number | null) => ({ themeId, mentions: 1, asked: 2, share, sentiment: 0, shareDelta: null, sentimentDelta: null });
    render(<ReviewsSection clientId={C} competitorId={X} benchmark={{
      windowDays: 90, from: '', to: '',
      themes: [{ id: 'response_time', name: 'Response time' }, { id: 'upsell_pressure', name: 'Upsell pressure' }],
      businesses: [
        { competitorId: 's', name: 'A1 HVAC', self: true, reviews: 4, avgRating: 4.5, prevReviews: 0, prevAvgRating: null, themes: [theme('response_time', 0.1), theme('upsell_pressure', null)] },
        { competitorId: X, name: 'Smith HVAC', self: false, reviews: 2, avgRating: 3, prevReviews: 0, prevAvgRating: null, themes: [theme('response_time', 0.5), theme('upsell_pressure', 0.25)] },
      ],
    }} />);
    expect(screen.getByText('3.0 ★ average · 2 reviews in 90 days')).toBeTruthy();
    expect(screen.getByText('Response time — 50% (you 10%)')).toBeTruthy();
    expect(screen.getByText('Upsell pressure — 25% (you —)')).toBeTruthy();
  });

  it('lists each keyword’s ranking with a link to its geo-grid, or the setup state', () => {
    const base = { scan: null, scans: [], keywords: ['ac repair'], keyword: 'ac repair', businesses: [], business: X, size: 3, cells: [], top3: 0, points: 0, avgRank: null, radiusKm: 25 };
    const { unmount } = render(<RankingsSection clientId={C} competitorId={X} geo={{ ...base, setup: 'ready', keywordSummaries: [{ keyword: 'ac repair', top3: 8, points: 8, avgRank: 1.4 }] }} />);
    const link = screen.getByRole('link', { name: 'ac repair — top 3 at 8 of 8 · avg 1.4' });
    expect(link.getAttribute('href')).toBe(`/c/${C}/rankings?keyword=ac+repair&business=${X}`);
    unmount();
    render(<RankingsSection clientId={C} competitorId={X} geo={{ ...base, setup: 'no_scan', keywordSummaries: [] }} />);
    expect(screen.getByText('The first monthly rank scan hasn’t run yet.')).toBeTruthy();
  });
});
