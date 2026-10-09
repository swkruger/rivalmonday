// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import RankingsPage from './page';

const geo = {
  setup: 'ready', scan: { id: 's', finishedAt: '2026-10-01T00:00:00.000Z' }, scans: [{ id: 's', finishedAt: '2026-10-01T00:00:00.000Z' }],
  keywords: ['ac repair'], keyword: 'ac repair', businesses: [], business: null, size: 3,
  cells: [[null, null, null], [null, null, null], [null, null, null]], top3: 0, points: 0, avgRank: null, keywordSummaries: [], radiusKm: 25,
};

const render5 = async () => render(await RankingsPage({ params: Promise.resolve({ clientId: 'c1' }), searchParams: Promise.resolve({}) }));

describe('RankingsPage', () => {
  beforeEach(() => { callTool.mockReset(); });

  it('asks for a place id or a competitor instead of drawing a grid when there is no business', async () => {
    callTool.mockResolvedValue(geo);
    await render5();
    expect(screen.getByText(/Add your place id or track a competitor\./)).toBeTruthy();
    expect(screen.queryByText(/20\+/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /ac repair/ })).toBeNull();
    expect(callTool.mock.calls.map((c) => c[1])).toEqual(['get_geogrid']); // no share-of-voice call either
  });
});
