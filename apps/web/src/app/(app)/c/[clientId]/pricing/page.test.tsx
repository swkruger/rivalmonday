// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const matrix = {
  services: [{ id: 'ac', name: 'AC tune-up', offered: true }],
  rows: [{ competitorId: '11111111-1111-4111-8111-111111111111', name: 'Smith HVAC', cells: [{ serviceId: 'ac', prices: [{ amount: 79, unit: 'USD', qualifier: 'exact', promo: false, since: '2026-10-01T00:00:00.000Z' }], change: null }] }],
};
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => ({ callTool: async (_c: unknown, name: string) => (name === 'get_price_matrix' ? matrix : { name: 'Client' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({}) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null, HelpEmpty: () => null }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
// A pending history read: the component suspends forever.
vi.mock('./history-card', () => ({ PERIODS: [90, 180, 365], PriceHistoryCard: () => { throw new Promise(() => {}); } }));

import PricingPage from './page';

afterEach(cleanup);

describe('PricingPage', () => {
  it('pricing history renders inside Suspense (fallback shown when the read is pending)', async () => {
    const ui = await PricingPage({
      params: Promise.resolve({ clientId: 'c' }),
      searchParams: Promise.resolve({ competitor: matrix.rows[0]!.competitorId, service: 'ac' }),
    });
    render(ui);
    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(screen.getByRole('link', { name: /AC tune-up/ })).toBeTruthy();
  });
});
