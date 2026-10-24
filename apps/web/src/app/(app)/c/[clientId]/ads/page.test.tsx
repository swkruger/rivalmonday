// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => {
  const impl = async (_c: unknown, name: string) => {
    calls.push(name);
    if (name === 'get_ad_activity') return { weeks: [], series: [] };
    if (name === 'list_client_competitors') return { items: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Quiet Rival' }] };
    if (name === 'list_ads') return { items: [], hasMore: false };
    return { name: 'Client', timezone: 'UTC' };
  };
  return { callTool: impl, tryCallTool: impl };
});
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/charts/line-chart', () => ({ LineChart: () => null, foldSeries: () => [] }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import AdsPage from './page';

afterEach(cleanup);

describe('AdsPage', () => {
  it('ads competitor filter lists a tracked rival with no ads', async () => {
    render(await AdsPage({ params: Promise.resolve({ clientId: 'c' }), searchParams: Promise.resolve({}) }));
    expect(calls).toContain('list_client_competitors');
    const select = screen.getByLabelText('Competitor');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['All competitors', 'Quiet Rival']);
  });
});
