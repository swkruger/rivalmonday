// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ role: 'client_owner' as string, data: null as unknown, refuse: false, calls: [] as [string, unknown][], agency: 'Cool Agency' }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user', ctx: { role: m.role } }, ctx: { role: m.role } }) }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: m.agency } }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>(), helpAgencyName: (_p: boolean, n: string) => n }));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('@/server/tools', () => ({
  callTool: async (_ctx: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    if (m.refuse && name === 'get_my_usage') throw new Error('NEXT_NOT_FOUND');
    return name === 'get_client_profile' ? { name: 'A1 HVAC' } : m.data;
  },
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, usePathname: () => '/c/x/settings/usage', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));

const { default: ClientUsagePage } = await import('./page');

afterEach(() => { cleanup(); m.calls = []; m.refuse = false; m.role = 'client_owner'; m.agency = 'Cool Agency'; });
const C = '00000000-0000-4000-8000-0000000000a1';
const usage = (level: string, used: number, questions: unknown = null) => ({ month: '2026-10', credits: { used, limit: 1500, ratio: used / 1500, level }, questions });
const show = async () => render(<HelpProvider value={{ audience: 'client', names: { agency: 'Cool Agency', assistant: 'Sunny' } }}>{await ClientUsagePage({ params: Promise.resolve({ clientId: C }) })}</HelpProvider>);

describe('client usage page (7b1)', () => {
  it('client usage page 404s for client_viewer', async () => {
    m.role = 'client_viewer';
    m.data = usage('ok', 100);
    await expect(ClientUsagePage({ params: Promise.resolve({ clientId: C }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('a tool refusal (guest, another client) is a 404', async () => {
    m.refuse = true;
    await expect(ClientUsagePage({ params: Promise.resolve({ clientId: C }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('client_owner sees credits and a badge but no questions block', async () => {
    m.data = usage('near', 1250);
    const { container } = await show();
    expect(m.calls[0]).toEqual(['get_my_usage', { clientId: C }]);
    expect(screen.getByText('1,250 of 1,500 credits')).toBeTruthy();
    expect(screen.getByText('Near limit')).toBeTruthy();
    expect(container.textContent).not.toMatch(/question/i);
    expect(container.textContent).not.toMatch(/\$|\bcap\b/);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('83');
  });

  it('agency roles see the questions block', async () => {
    m.role = 'agency_admin';
    m.data = usage('ok', 100, { used: 4, quota: 100 });
    await show();
    expect(screen.getByText('4 of 100')).toBeTruthy();
  });

  it('client usage quota 0 reads "4 used · Ask turned off by limit"', async () => {
    m.role = 'agency_admin';
    m.data = usage('ok', 100, { used: 4, quota: 0 });
    await show();
    expect(screen.getByText('4 used · Ask turned off by limit')).toBeTruthy();
  });

  it('reached shows C1; paused shows C3 with the agency name', async () => {
    m.data = usage('reached', 1600);
    const { unmount } = await show();
    expect(screen.getByText("A1 HVAC has used this month's credits. Nothing changes — monitoring, briefs and Ask carry on as normal.")).toBeTruthy();
    expect(screen.queryByText(/paused for the rest/)).toBeNull();
    unmount();
    m.data = usage('paused', 2100);
    await show();
    expect(screen.getByText('Monitoring and new briefs are paused for the rest of this month. Your past briefs and evidence are still here, and your Cool Agency team has been told.')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });
});
