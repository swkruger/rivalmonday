// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ role: 'staff' as string | null, callTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ platformRole: async () => m.role }));
vi.mock('../../_components/overview-charts', () => ({ cardCls: 'card', deltaPill: () => null, PlatformCharts: () => null }));
vi.mock('../../_components/range-toggle', () => ({ parseRange: () => '28d', RangeToggle: () => null }));
vi.mock('./support-dialog', () => ({ SupportDialog: ({ agencyId }: { agencyId: string }) => <button type="button">View as agency {agencyId}</button> }));
const { default: Page } = await import('./page');

const AG = '22222222-2222-4222-8222-222222222222';
const tile = { value: 1, previous: 1 };
const detail = {
  agency: { id: AG, name: 'Acme', createdAt: '2026-01-01T00:00:00Z', health: 'steady' },
  tiles: { agencies: tile, clientsActive: tile, seats: tile, wau: tile, spendMonthUsd: tile },
  series: [],
  team: { agencyAdmin: 1, accountManager: 0, clientOwner: 0, clientViewer: 0 },
  clients: [],
};
const session = { id: 's1', startedAt: '2026-10-12T10:00:00Z', endedAt: '2026-10-12T10:12:00Z', platformUserName: 'Sam Staff', reason: 'Checking brief setup', durationMinutes: 12, endReason: 'exit' };

beforeEach(() => {
  m.role = 'staff';
  m.callTool.mockReset();
  m.callTool.mockImplementation(async (_ctx: unknown, name: string) => (name === 'get_platform_agency' ? detail : { rows: [session] }));
});
const page = (sp: Record<string, string> = {}) => Page({ params: Promise.resolve({ id: AG }), searchParams: Promise.resolve(sp) });

describe('platform agency page: support sessions', () => {
  it('offers "View as agency" to staff and lists recent sessions from list_agency_support_sessions', async () => {
    render(await page());
    expect(screen.getByRole('button', { name: `View as agency ${AG}` })).toBeTruthy();
    expect(m.callTool).toHaveBeenCalledWith({ userId: 'op' }, 'list_agency_support_sessions', { agencyId: AG });
    expect(screen.getByText('Sam Staff')).toBeTruthy();
    expect(screen.getByText('Checking brief setup')).toBeTruthy();
    expect(screen.getByText('12 min')).toBeTruthy();
    expect(screen.queryByText('Support session ended.')).toBeNull();
  });

  it('hides "View as agency" from a platform viewer', async () => {
    m.role = 'viewer';
    render(await page());
    expect(screen.queryByRole('button', { name: /View as agency/ })).toBeNull();
  });

  it('shows "Support session ended." on ?ended=1', async () => {
    render(await page({ ended: '1' }));
    expect(screen.getByRole('status').textContent).toBe('Support session ended.');
  });
});
