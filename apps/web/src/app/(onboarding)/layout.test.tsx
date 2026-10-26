// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteGuard } from '@/components/read-only';

const m = vi.hoisted(() => ({
  ctx: { role: 'agency_admin', agencyId: 'a1' } as { role: string; agencyId: string },
  kind: 'user',
  billing: { state: 'active', onHold: false, trialEndsAt: null, pausesOn: null, supportEmail: 's@x.io' } as Record<string, unknown>,
  redirectTo: null as string | null,
  redirectArgs: null as unknown,
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: m.kind, membership: { agencyName: 'Acme', clientName: null } }, ctx: m.ctx }) }));
vi.mock('@/server/billing-state', () => ({ billingSnapshotOf: async () => m.billing }));
vi.mock('@/server/billing-redirect', () => ({ billingRedirectFor: (a: unknown) => { m.redirectArgs = a; return m.redirectTo; } }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Acme', logoUrl: null }, style: { '--primary': '#0000aa' }, assistantName: 'Friday' }) }));
vi.mock('@/server/tools', () => ({ callTool: async () => ({ paused: [] }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-rm-path': '/onboarding' }) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); }, usePathname: () => '/onboarding' }));
vi.mock('@/components/shell/app-shell', () => ({ AppShell: () => { throw new Error('AppShell must not render'); } }));
vi.mock('@/components/help/help-provider', () => ({ HelpProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/shell/tz-cookie', () => ({ TzCookie: () => null }));
vi.mock('@/components/shell/shell-theme', () => ({ ShellTheme: () => null }));
vi.mock('@/components/shell/support-banner', () => ({ SupportBanner: () => <div data-testid="support" /> }));
vi.mock('@/components/shell/billing-banner', () => ({ BillingBanner: ({ onHold }: { onHold: boolean }) => <div data-testid="billing" data-hold={String(onHold)} /> }));
vi.mock('@/components/shell/spend-banner', () => ({ SpendBanner: () => null }));
const { default: OnboardingLayout } = await import('./layout');

beforeEach(() => { m.ctx = { role: 'agency_admin', agencyId: 'a1' }; m.kind = 'user'; m.billing = { state: 'active', onHold: false, trialEndsAt: null, pausesOn: null, supportEmail: 's@x.io' }; m.redirectTo = null; });
afterEach(cleanup);

describe('(onboarding) layout', () => {
  it('redirects to billing like (app) layout', async () => {
    m.billing = { ...m.billing, state: 'suspended' };
    m.redirectTo = '/paused';
    await expect(OnboardingLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/paused');
    expect(m.redirectArgs).toEqual({ state: 'suspended', role: 'agency_admin', pathname: '/onboarding' });
  });

  it('renders bare children for a suspended non-admin', async () => {
    m.billing = { ...m.billing, state: 'suspended' };
    m.ctx = { role: 'account_manager', agencyId: 'a1' };
    render(await OnboardingLayout({ children: <p>kid</p> }));
    expect(screen.getByText('kid')).toBeTruthy();
    expect(screen.queryByTestId('billing')).toBeNull();
  });

  it('renders children without AppShell, with the billing banner', async () => {
    render(await OnboardingLayout({ children: <p>kid</p> }));
    expect(screen.getByText('kid')).toBeTruthy();
    expect(screen.getByTestId('billing').getAttribute('data-hold')).toBe('false');
  });

  it('mounts read-only provider on hold', async () => {
    m.billing = { ...m.billing, onHold: true };
    const { rerender } = render(await OnboardingLayout({ children: <WriteGuard><button type="button">write</button></WriteGuard> }));
    expect(screen.queryByRole('button', { name: 'write' })).toBeNull();
    expect(screen.getByTestId('billing').getAttribute('data-hold')).toBe('true');
    m.billing = { ...m.billing, onHold: false };
    rerender(await OnboardingLayout({ children: <WriteGuard><button type="button">write</button></WriteGuard> }));
    expect(screen.getByRole('button', { name: 'write' })).toBeTruthy();
  });
});
