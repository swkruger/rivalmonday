// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
let role = 'client_owner';
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role, features: new Set(['dashboard']) } }) }));
vi.mock('../actions', () => ({ setPinAction: vi.fn(), addPageAction: vi.fn(), confirmAdMatchAction: vi.fn(), removeAdMatchAction: vi.fn() }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: vi.fn(), registry: vi.fn() }));
vi.mock('@/server/env', () => ({ webEnv: () => ({}) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import CompetitorProfilePage from './page';

describe('CompetitorProfilePage', () => {
  beforeEach(() => { callTool.mockReset(); role = 'client_owner'; });
  afterEach(cleanup);

  it('starts every read in one batch and still 404s on a bad id, without unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    const result = CompetitorProfilePage({ params: Promise.resolve({ clientId: 'c', competitorId: 'x' }), searchParams: Promise.resolve({}) });
    const err = await result.then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    expect(callTool.mock.calls.map((c) => c[1])).toEqual([
      'get_competitor_profile', 'get_competitor_timeline', 'list_tracked_pages', 'get_price_matrix', 'list_ads', 'get_topic_benchmark', 'get_geogrid', 'get_competitor_signals', 'get_client_profile',
    ]);
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  const NO_SIGNALS = {
    rating: 4.2, votes: 80, reviews30d: 6, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null, googleAccount: null,
    metaPage: null, metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null,
  };
  function answer(tool: string): unknown {
    switch (tool) {
      case 'get_competitor_profile':
        return {
          competitorId: 'x', name: 'Smith HVAC', domain: null, placeId: null, addedAt: '2026-09-01T00:00:00.000Z', gbp: null, gbpAsOf: null, activeAds: { google: 0, meta: 0 },
          pressure: { score: 40, level: 'low' }, openMoves: 0, pages: { active: 0, blocked: 0 },
          sources: [{ source: 'ads', label: 'Ads', active: true, lastRunAt: '2026-10-13T00:00:00.000Z', lastStatus: 'vendor_error' }, { source: 'gbp', label: 'Google profile', active: true, lastRunAt: '2026-10-13T00:00:00.000Z', lastStatus: 'not_found' }],
        };
      case 'get_competitor_timeline': case 'list_tracked_pages': return { items: [] };
      case 'list_ads': return { items: [], hasMore: false };
      case 'get_price_matrix': return { services: [], rows: [] };
      case 'get_topic_benchmark': return { windowDays: 90, from: '', to: '', topics: [], businesses: [] };
      case 'get_geogrid': return { setup: 'no_scan' };
      case 'get_competitor_signals': return { competitors: [{ competitorId: 'x', tier: 'watch', signals: NO_SIGNALS, computedAt: '2026-10-13T09:00:00.000Z' }] };
      case 'get_client_profile': return { id: 'c', name: 'Cool Air' };
      case 'get_competitor_ad_matches': return { matched: [{ platform: 'google', accountId: 'AR111', name: null }], pending: [{ platform: 'meta', accountId: '9001', name: 'Smith Air', strength: 'weak' }] };
      default: throw new Error(`unexpected tool ${tool}`);
    }
  }
  const renderPage = async () => {
    callTool.mockImplementation(async (_c: unknown, tool: string) => answer(tool));
    render(await CompetitorProfilePage({ params: Promise.resolve({ clientId: 'c', competitorId: 'x' }), searchParams: Promise.resolve({}) }));
  };

  it('client user sees tier and pills, no match chips and no ad-match call', async () => {
    await renderPage();
    expect(screen.getByText('Worth watching')).toBeTruthy();
    expect(screen.getByText('Rated Tue 13 Oct')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Signals' })).toBeTruthy();
    expect(screen.queryByText(/Matched automatically/)).toBeNull();
    expect(screen.queryByText(/Possible Meta account/)).toBeNull();
    expect(callTool.mock.calls.map((c) => c[1])).not.toContain('get_competitor_ad_matches');
  });

  it('agency manager also sees the match chips', async () => {
    role = 'agency_admin';
    await renderPage();
    expect(screen.getByText('Matched automatically')).toBeTruthy();
    expect(screen.getByText('Possible Meta account: Smith Air')).toBeTruthy();
  });

  it('reads source statuses as words, not codes', async () => {
    await renderPage();
    expect(screen.getByText(/Data provider error/)).toBeTruthy();
    expect(screen.getByText(/Not found/)).toBeTruthy();
    expect(screen.queryByText(/vendor_error|not_found/)).toBeNull();
  });
});
