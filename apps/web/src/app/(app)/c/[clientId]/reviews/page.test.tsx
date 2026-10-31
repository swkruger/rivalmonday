// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => {
  const impl = async (_c: unknown, name: string) => {
    if (name === 'get_topic_benchmark') return { topics: [{ id: 'pricing', name: 'Pricing' }] };
    if (name === 'get_rating_trend') return { months: [], businesses: [{ competitorId: 'self', name: 'Me', self: true, gbpRating: 4.5, reviews90d: 3, perMonth: 1, replyRate: 0.5, mix: [0, 0, 0, 1, 2], monthly: [] }], selfPending: false };
    if (name === 'search_reviews') return { items: [], hasMore: false };
    return { name: 'Client', timezone: 'UTC' };
  };
  return { callTool: impl, tryCallTool: impl };
});
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/charts/line-chart', () => ({ LineChart: () => null }));
vi.mock('@/components/charts/topic-heatmap', () => ({ TopicHeatmap: () => null }));
vi.mock('./trend-series', () => ({ trendSeries: () => [] }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ReviewsPage from './page';

afterEach(cleanup);

describe('ReviewsPage', () => {
  it('keeps the filter names and URL-driven values', async () => {
    const { container } = render(await ReviewsPage({ params: Promise.resolve({ clientId: 'c' }), searchParams: Promise.resolve({ topic: 'pricing', stars: '4', days: '30', q: 'late' }) }));
    const val = (n: string) => (container.querySelector(`[name=${n}]`) as HTMLSelectElement | HTMLInputElement).value;
    expect([val('topic'), val('stars'), val('days'), val('q')]).toEqual(['pricing', '4', '30', 'late']);
    expect(container.querySelector('select[name=business]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' }).getAttribute('data-variant')).toBe('outline');
  });

  it('holds the rating mix and trend in a hairline grid', async () => {
    const { container } = render(await ReviewsPage({ params: Promise.resolve({ clientId: 'c' }), searchParams: Promise.resolve({}) }));
    const grid = container.querySelector('[data-slot=hairline-grid]');
    expect(grid?.textContent).toContain('Your rating mix');
    expect(grid?.textContent).toContain('Rating trend');
  });
});
