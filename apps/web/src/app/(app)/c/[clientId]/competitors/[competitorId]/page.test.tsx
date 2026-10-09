// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: vi.fn(), registry: vi.fn() }));
vi.mock('@/server/env', () => ({ webEnv: () => ({}) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import CompetitorProfilePage from './page';

describe('CompetitorProfilePage', () => {
  beforeEach(() => { callTool.mockReset(); });

  it('starts every read in one batch and still 404s on a bad id, without unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    const result = CompetitorProfilePage({ params: Promise.resolve({ clientId: 'c', competitorId: 'x' }), searchParams: Promise.resolve({}) });
    const err = await result.then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    expect(callTool.mock.calls.map((c) => c[1])).toEqual([
      'get_competitor_profile', 'get_competitor_timeline', 'list_tracked_pages', 'get_price_matrix', 'list_ads', 'get_theme_benchmark', 'get_geogrid',
    ]);
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
