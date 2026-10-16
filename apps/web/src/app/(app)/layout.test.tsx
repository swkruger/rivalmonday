// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ctx: { role: 'agency_admin', agencyId: 'a1' } as { role: string; agencyId: string },
  kind: 'user',
  path: '/agency',
  status: { dismissed: false, completed: false, redirected: false } as Record<string, unknown>,
  calls: [] as string[],
  run: vi.fn(),
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: m.kind }, ctx: m.ctx }) }));
vi.mock('@/server/billing-state', () => ({ billingSnapshotOf: async () => ({ state: 'active' }) }));
vi.mock('@/server/billing-redirect', () => ({ billingRedirectFor: () => null }));
vi.mock('@/components/shell/app-shell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-rm-path': m.path }) }));
vi.mock('@/server/tools', () => ({ callTool: async (_c: unknown, name: string) => { m.calls.push(name); return m.status; } }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => { m.calls.push(String(a[1])); return m.run(...a); } }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
const { default: AppLayout } = await import('./layout');

beforeEach(() => {
  m.ctx = { role: 'agency_admin', agencyId: 'a1' }; m.kind = 'user'; m.path = '/agency'; m.calls = [];
  m.status = { dismissed: false, completed: false, redirected: false }; m.run.mockReset().mockResolvedValue({ ok: true, data: { ok: true } });
});

describe('(app) layout first-session redirect', () => {
  it('marks the redirect then sends a fresh agency admin to /onboarding, once', async () => {
    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/onboarding');
    expect(m.calls).toEqual(['get_onboarding_status', 'mark_onboarding_redirected']);
    m.status = { ...m.status, redirected: true }; // second load: redirected_at is now set
    m.calls = [];
    await expect(AppLayout({ children: null })).resolves.toBeDefined();
    expect(m.calls).toEqual(['get_onboarding_status']);
  });

  it('never redirects completed or dismissed agencies, nor when already on /onboarding', async () => {
    m.status = { dismissed: false, completed: true, redirected: false };
    await expect(AppLayout({ children: null })).resolves.toBeDefined();
    m.status = { dismissed: true, completed: false, redirected: false };
    await expect(AppLayout({ children: null })).resolves.toBeDefined();
    m.status = { dismissed: false, completed: false, redirected: false };
    m.path = '/onboarding?step=team';
    m.calls = [];
    await expect(AppLayout({ children: null })).resolves.toBeDefined();
    expect(m.calls).toEqual([]);
    expect(m.run).not.toHaveBeenCalled();
  });

  it('only agency admins in a normal session are checked (account managers and support sessions are not)', async () => {
    m.ctx = { role: 'account_manager', agencyId: 'a1' };
    await expect(AppLayout({ children: null })).resolves.toBeDefined();
    m.ctx = { role: 'agency_admin', agencyId: 'a1' }; m.kind = 'support';
    await expect(AppLayout({ children: null })).resolves.toBeDefined();
    expect(m.calls).toEqual([]);
  });
});
