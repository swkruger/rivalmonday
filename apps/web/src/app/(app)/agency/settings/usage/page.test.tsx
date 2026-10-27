// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ role: 'agency_admin' as string, data: null as unknown, calls: [] as [string, unknown][] }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: m.role, agencyId: 'a', clientScope: 'all' } }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@/server/tools', () => ({
  callTool: async (_ctx: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    return m.data;
  },
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, usePathname: () => '/agency/settings/usage', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));

const { default: UsagePage } = await import('./page');

afterEach(() => { cleanup(); m.calls = []; m.role = 'agency_admin'; });
const row = (over: Record<string, unknown>) => ({ clientId: 'c1', name: 'Lone Star Cooling', status: 'active', credits: { used: 300, limit: 1500, ratio: 0.2, level: 'ok' }, competitorLimit: 5, competitors: 2, questions: { used: 4, quota: 100 }, ...over });
const show = async () => render(<HelpProvider value={{ audience: 'agency', names: { agency: 'Cool Comfort', assistant: 'Sunny' } }}>{await UsagePage()}</HelpProvider>);

describe('agency usage page (7b1)', () => {
  it('agency usage page renders credits, no $ anywhere', async () => {
    m.data = {
      month: '2026-10', agencyLevelCredits: 250, totalCredits: 3400,
      items: [
        row({}),
        row({ clientId: 'c2', name: 'Brazos Plumbing', credits: { used: 1250, limit: 1500, ratio: 1250 / 1500, level: 'near' } }),
        row({ clientId: 'c3', name: 'Alamo Dental', credits: { used: 1600, limit: 1500, ratio: 1600 / 1500, level: 'reached' } }),
        row({ clientId: 'c4', name: 'Waco Roofing', credits: { used: 2100, limit: 1500, ratio: 1.4, level: 'paused' } }),
      ],
    };
    const { container } = await show();
    expect(m.calls).toEqual([['get_usage', {}]]);
    expect(screen.getByText('300 of 1,500 credits')).toBeTruthy();
    expect(screen.getByText('1,600 of 1,500 credits')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$/);
    expect(container.textContent).not.toMatch(/\bcap\b/i);
    expect(container.textContent).toContain('250 credits');
    expect(container.textContent).toContain('3,400 credits');
  });

  it('agency questions cell quota 0 reads the same, no "At quota"', async () => {
    m.data = { month: '2026-10', agencyLevelCredits: null, totalCredits: 10, items: [row({ questions: { used: 4, quota: 0 } })] };
    await show();
    expect(screen.getByText('4 used · Ask turned off by limit')).toBeTruthy();
    expect(screen.queryByText('At quota')).toBeNull();
  });

  it('tiles count near, reached and paused; the C1 note shows only on a reached row', async () => {
    m.data = {
      month: '2026-10', agencyLevelCredits: null, totalCredits: 10,
      items: [
        row({ credits: { used: 1250, limit: 1500, ratio: 0.83, level: 'near' } }),
        row({ clientId: 'c3', name: 'Alamo Dental', credits: { used: 1600, limit: 1500, ratio: 1.07, level: 'reached' } }),
        row({ clientId: 'c4', name: 'Waco Roofing', credits: { used: 2100, limit: 1500, ratio: 1.4, level: 'paused' } }),
        row({ clientId: 'c5', name: 'Hill Country HVAC', credits: { used: 2200, limit: 1500, ratio: 1.46, level: 'paused' } }),
      ],
    };
    await show();
    const tile = (label: string) => screen.getByRole('heading', { level: 2, name: label }).closest('[data-slot="kpi"]')!.textContent;
    expect(tile('Near limit')).toContain('1');
    expect(tile('Limit reached')).toContain('1');
    expect(tile('Paused')).toContain('2');
    expect(screen.getAllByText(/has used this month's credits\. Nothing changes — monitoring, briefs and Ask carry on as normal\./)).toHaveLength(1);
    expect(screen.getByText(/Alamo Dental has used this month's credits/)).toBeTruthy();
  });

  it('is read-only: no inputs or buttons for limits', async () => {
    m.data = { month: '2026-10', agencyLevelCredits: null, totalCredits: 0, items: [row({})] };
    const { container } = await show();
    expect(container.querySelector('input, select, textarea')).toBeNull();
    expect(within(container).queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('a client role gets a 404', async () => {
    m.role = 'client_owner';
    m.data = { month: '2026-10', items: [], agencyLevelCredits: null, totalCredits: 0 };
    await expect(UsagePage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('usage shows the empty state with zero clients', async () => {
    m.data = { month: '2026-10', items: [], agencyLevelCredits: null, totalCredits: 0 };
    await show();
    expect(screen.getByText('No clients to show yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists clients in a table and labels a prospect with a status chip', async () => {
    m.data = { month: '2026-10', agencyLevelCredits: null, totalCredits: 0, items: [row({ status: 'prospect' })] };
    await show();
    expect(screen.queryByText('No clients to show yet')).toBeNull();
    expect(screen.getByText('Prospect')).toBeTruthy();
  });
});
