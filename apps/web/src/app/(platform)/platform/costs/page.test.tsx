// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ callTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ ctx: {} }) }));
vi.mock('@/server/tools', () => ({ callTool: h.callTool }));
vi.mock('./actions', () => ({ refreshCostsAction: vi.fn(), updateCostServiceAction: vi.fn(), saveCostItemAction: vi.fn(), archiveCostItemAction: vi.fn() }));
import PlatformCostsPage from './page';

const data = {
  services: [], items: [], months: [{ month: '2026-10', apiUsd: 1, manualUsd: 2 }],
  summary: { mtdUsd: 3, projectedMonthUsd: 9.5, lowCount: 2 }, refreshQueued: true,
};
beforeEach(() => { h.callTool.mockReset(); });
afterEach(cleanup);

describe('/platform/costs', () => {
  it('propagates the 404 for non-owners', async () => {
    h.callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    await expect(PlatformCostsPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders the decided copy, summary and a disabled refresh while queued', async () => {
    h.callTool.mockResolvedValue(data);
    render(await PlatformCostsPage());
    expect(screen.getByRole('heading', { name: 'Platform costs' })).toBeTruthy();
    expect(screen.getByText('What it costs to run Rival Monday. API balances refresh daily at 06:00 UTC.')).toBeTruthy();
    expect(screen.getByText('Monthly spend (approximate: balance services are estimated from daily readings)')).toBeTruthy();
    expect(screen.getByText('$9.50')).toBeTruthy();
    expect(screen.getByText('2').className).toContain('B45309');
    expect((screen.getByRole('button', { name: 'Refreshing…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
