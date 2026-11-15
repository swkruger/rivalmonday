// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ viewer: { kind: 'user' } as { kind: string }, ctx: { role: 'agency_admin' } as Record<string, unknown>, callTool: vi.fn(), runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: m.viewer, ctx: m.ctx }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>(['page:agency.settings.domains']) }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'America/Chicago' }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  usePathname: () => '/agency/settings/domains',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));

const { default: Page, metadata } = await import('./page');

const VIEW = {
  fallbackHost: 'brightline.clients.example',
  fromAddress: 'brightline@mail.clients.example',
  custom: { hostname: 'intel.brightline.co', status: 'live', dnsRecords: [], error: null, liveAt: '2026-11-10T03:00:00.000Z' },
  sending: null,
};
const show = async () => render(<HelpProvider value={{ audience: 'agency', names: { agency: 'Brightline', assistant: 'Friday' } }}>{await Page()}</HelpProvider>);

beforeEach(() => {
  m.viewer = { kind: 'user' };
  m.ctx = { role: 'agency_admin' };
  m.callTool.mockReset().mockResolvedValue(VIEW);
});
afterEach(cleanup);

describe('/agency/settings/domains', () => {
  it('reads get_agency_domains and renders the header, both sections, the fallback and the From line', async () => {
    await show();
    expect(metadata).toEqual({ title: 'Domains' });
    expect(m.callTool).toHaveBeenCalledWith(m.ctx, 'get_agency_domains', {});
    expect(screen.getByRole('heading', { level: 1, name: 'Domains' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Agency settings' }).getAttribute('href')).toBe('/agency/settings');
    expect(screen.getByText(/Give clients your own web address and email domain\./).textContent).toContain('Until they are ready, clients use brightline.clients.example.');
    expect(screen.getByRole('heading', { name: 'Web address' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Email sending' })).toBeTruthy();
    expect(screen.getByText(/Client emails come from/).textContent).toBe('Client emails come from brightline@mail.clients.example.');
    // the live date in the viewer's time zone (03:00 UTC on Nov 10 is Nov 9 in Chicago)
    expect(screen.getByText(/Nov 9/)).toBeTruthy();
  });

  it('page 404 for account_manager and in support', async () => {
    for (const role of ['account_manager', 'client_owner', 'client_viewer']) {
      m.ctx = { role };
      await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
    }
    m.viewer = { kind: 'support' };
    m.ctx = { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } };
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.callTool).not.toHaveBeenCalled();
  });
});
