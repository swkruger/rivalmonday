// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const replace = vi.fn();
const viewer = vi.hoisted(() => ({ role: 'client_owner' }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: viewer.role, features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ replace }) }));
vi.mock('./actions', () => ({ saveRankSettings: vi.fn(), requestRankScan: vi.fn() }));

import RankingsPage from './page';

const geo = {
  setup: 'ready', scan: { id: 's', finishedAt: '2026-10-01T00:00:00.000Z' }, scans: [{ id: 's', finishedAt: '2026-10-01T00:00:00.000Z' }],
  keywords: ['ac repair'], keyword: 'ac repair', businesses: [], business: null, size: 3,
  cells: [[null, null, null], [null, null, null], [null, null, null]], top3: 0, points: 0, avgRank: null, keywordSummaries: [], radiusKm: 25, lats: [], lngs: [], map: null,
};

const render5 = async (sp: Record<string, string> = {}) => render(await RankingsPage({ params: Promise.resolve({ clientId: 'c1' }), searchParams: Promise.resolve(sp) }));

describe('RankingsPage', () => {
  beforeEach(() => { callTool.mockReset(); replace.mockReset(); viewer.role = 'client_owner'; });

  describe('Rank settings and Scan now', () => {
    const rankSettings = (state: string, label: string | null = null) => ({ keywords: ['ac repair'], allKeywords: ['ac repair'], gridSize: 7, radiusKm: 25, scan: { state, nextAvailableAt: null, label } });
    const mount = (state: string, label: string | null = null) => callTool.mockImplementation(async (_ctx: unknown, name: string) => (name === 'get_rank_settings' ? rankSettings(state, label) : geo));

    it('agency roles get both controls', async () => {
      viewer.role = 'agency_admin';
      mount('weekly_limit', 'Next scan available Wed 21 Oct');
      await render5();
      expect(screen.getByRole('button', { name: 'Rank settings' })).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Next scan available Wed 21 Oct' }) as HTMLButtonElement).disabled).toBe(true);
      expect(callTool.mock.calls.find((c) => c[1] === 'get_rank_settings')![2]).toEqual({ clientId: 'c1' });
    });

    it('a client that cannot be scanned (paused, inactive or not set up) shows neither control', async () => {
      viewer.role = 'account_manager';
      mount('not_ready');
      await render5();
      expect(screen.queryByRole('button', { name: 'Rank settings' })).toBeNull();
      expect(screen.queryByRole('button', { name: /scan/i })).toBeNull();
    });

    it('client roles never read the settings', async () => {
      mount('available');
      await render5();
      expect(callTool.mock.calls.map((c) => c[1])).not.toContain('get_rank_settings');
      expect(screen.queryByRole('button', { name: 'Rank settings' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Scan now' })).toBeNull();
    });
  });

  it('asks for a place id or a competitor instead of drawing a grid when there is no business', async () => {
    callTool.mockResolvedValue(geo);
    await render5();
    expect(screen.getByText(/Add your place id or track a competitor\./)).toBeTruthy();
    expect(screen.queryByText(/20\+/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /ac repair/ })).toBeNull();
    expect(callTool.mock.calls.map((c) => c[1])).toEqual(['get_client_profile', 'get_geogrid']); // no share-of-voice call either
  });

  describe('Trend and Compare tabs', () => {
    const S1 = '00000000-0000-4000-8000-000000000001';
    const S2 = '00000000-0000-4000-8000-000000000002';
    const S3 = '00000000-0000-4000-8000-000000000003';
    const at: Record<string, string> = { [S1]: '2026-09-17T00:00:00.000Z', [S2]: '2026-09-24T00:00:00.000Z', [S3]: '2026-10-01T00:00:00.000Z' };
    const ready = (scanId = S3, cells: (number | null)[][] = [[1, 2], [3, 4]]) => ({
      ...geo, scan: { id: scanId, finishedAt: at[scanId] }, scans: [S3, S2, S1].map((id) => ({ id, finishedAt: at[id] })),
      businesses: [{ key: 'self', name: 'Cool Air', self: true }], business: 'self', size: 2, cells, top3: 2, points: 4, avgRank: 2.5,
      lats: [30.3, 30.2], lngs: [-97.8, -97.7],
    });
    const trendScan = (id: string, settingsKey: string, settingsChanged = false) => ({
      scanId: id, finishedAt: at[id], settingsKey, settingsChanged, self: { avgRank: 3, top3Share: 0.5, points: 4 }, competitors: [],
    });
    const sov = { keyword: null, scans: [], series: [] };
    // Newest first, as get_rank_trend returns them.
    const mount = (keys: [string, string, string] = ['aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa']) => {
      callTool.mockImplementation(async (_ctx: unknown, name: string, input: { scanId?: string }) => {
        if (name === 'get_geogrid') return input.scanId === S1 ? ready(S1, [[5, 2], [3, null]]) : ready(input.scanId ?? S3);
        if (name === 'get_rank_trend') return { scans: [trendScan(S3, keys[2], keys[2] !== keys[1]), trendScan(S2, keys[1]), trendScan(S1, keys[0])], nextCursor: null };
        if (name === 'get_share_of_voice') return sov;
        if (name === 'get_client_profile') return { id: 'c1', name: 'Cool Air' };
        throw new Error(`unexpected ${name}`);
      });
    };

    it('page defaults to Trend', async () => {
      mount();
      await render5();
      expect(screen.getByRole('tab', { name: 'Trend' }).getAttribute('aria-selected')).toBe('true');
      expect(screen.getByRole('tab', { name: 'Compare' }).getAttribute('aria-selected')).toBe('false');
      expect(screen.getByRole('img', { name: /Average map rank/ })).toBeTruthy();
      const slider = screen.getByRole('slider', { name: 'Scan' }) as HTMLInputElement;
      expect(slider.max).toBe('2');
      expect(slider.value).toBe('2'); // the newest scan, rightmost
      expect(screen.getByRole('img', { name: /Local rankings for ac repair/ })).toBeTruthy();
      expect(screen.getByText(/from the weekly rank scan\./)).toBeTruthy();
      const trendCall = callTool.mock.calls.find((c) => c[1] === 'get_rank_trend')!;
      expect(trendCall[2]).toMatchObject({ clientId: 'c1', keyword: 'ac repair' });
    });

    it('Compare refuses mismatched scans with the decided copy', async () => {
      mount(['aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
      await render5({ tab: 'compare' });
      expect(screen.getByRole('tab', { name: 'Compare' }).getAttribute('aria-selected')).toBe('true');
      expect(screen.getByText('Settings changed between these scans.')).toBeTruthy();
      expect(screen.queryByRole('img', { name: /Change in local rank/ })).toBeNull();
      expect((screen.getByLabelText('From scan') as HTMLSelectElement).value).toBe(S2);
      expect((screen.getByLabelText('To scan') as HTMLSelectElement).value).toBe(S3);
    });

    it('Compare swaps reversed scans', async () => {
      mount();
      await render5({ tab: 'compare', a: S3, b: S1 });
      expect((screen.getByLabelText('From scan') as HTMLSelectElement).value).toBe(S1);
      expect((screen.getByLabelText('To scan') as HTMLSelectElement).value).toBe(S3);
      const grid = screen.getByRole('img', { name: /Change in local rank/ });
      // S1 [[5,2],[3,null]] → S3 [[1,2],[3,4]]: +4, =, =, no data.
      expect([...grid.querySelectorAll('text[data-change]')].map((n) => n.textContent)).toEqual(['+4', '=', '=', '–']);
      expect(screen.queryByText('Settings changed between these scans.')).toBeNull();
    });

    it('Compare refuses scans with the same settings key but a moved centre (different lats)', async () => {
      mount();
      const base = callTool.getMockImplementation()!;
      callTool.mockImplementation(async (ctx: unknown, name: string, input: { scanId?: string }) => {
        const out = await base(ctx, name, input);
        return name === 'get_geogrid' && input.scanId === S2 ? { ...out, lats: [30.31, 30.21] } : out;
      });
      await render5({ tab: 'compare' });
      expect(screen.getByText('Settings changed between these scans.')).toBeTruthy();
      expect(screen.queryByRole('img', { name: /Change in local rank/ })).toBeNull();
    });

    it('Compare still draws when the coordinates differ by less than 1e-6', async () => {
      mount();
      const base = callTool.getMockImplementation()!;
      callTool.mockImplementation(async (ctx: unknown, name: string, input: { scanId?: string }) => {
        const out = await base(ctx, name, input);
        return name === 'get_geogrid' && input.scanId === S2 ? { ...out, lats: [30.3 + 1e-7, 30.2] } : out;
      });
      await render5({ tab: 'compare' });
      expect(screen.getByRole('img', { name: /Change in local rank/ })).toBeTruthy();
      expect(screen.queryByText('Settings changed between these scans.')).toBeNull();
    });
  });
});
