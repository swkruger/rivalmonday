// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WriteGuard } from '@/components/read-only';

vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Acme Agency', logoUrl: null }, assistantName: 'Friday' }) }));
vi.mock('@/server/tools', () => ({ callTool: async () => ({ items: [] }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {}, app: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ unreadCount: async () => 0, isPlatformOperator: async () => true }));
vi.mock('./sidebar', () => ({
  Sidebar: ({ flags }: { flags: { backToPlatform?: string; isPlatformOperator?: boolean } }) => (
    <nav data-testid="sidebar" data-back={flags.backToPlatform ?? ''} data-operator={String(Boolean(flags.isPlatformOperator))} />
  ),
}));
vi.mock('./mobile-nav', () => ({ MobileNav: () => null }));
vi.mock('./client-switcher', () => ({ ClientSwitcher: () => null }));
vi.mock('./inbox-bell', () => ({ InboxBell: () => null }));
vi.mock('./guest-sign-out-button', () => ({ GuestSignOutButton: () => <button type="button">Guest sign out</button> }));
vi.mock('@/components/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sign out</button> }));
const { AppShell } = await import('./app-shell');

const AG = '22222222-2222-4222-8222-222222222222';
const ctx = { agencyId: AG, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [], support: { sessionId: 's', platformUserId: 'op' } };
const supportViewer = {
  kind: 'support', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx,
  session: { id: '11111111-1111-4111-8111-111111111111', platformUserId: 'op', agencyId: AG, agencyName: 'Acme Agency', reason: 'Checking brief setup', expiresAt: new Date(Date.now() + 30 * 60_000) },
};

describe('AppShell', () => {
  it('in a support session: banner, read-only children, "Back to platform", no platform items, no guest sign-out', async () => {
    render(await AppShell({ viewer: supportViewer as never, ctx: ctx as never, children: <WriteGuard><button type="button">Save</button></WriteGuard> }));
    expect(screen.getByRole('region', { name: 'Support session' }).textContent).toContain('Checking brief setup');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByTestId('sidebar').dataset.back).toBe(`/platform/agencies/${AG}`);
    expect(screen.getByTestId('sidebar').dataset.operator).toBe('false');
    expect(screen.queryByRole('button', { name: 'Guest sign out' })).toBeNull();
    expect(screen.getByText('OE')).toBeTruthy(); // the signed-in account menu (holds the real Sign out)
  });

  it('outside a session: no banner, writes visible', async () => {
    const { support: _s, ...own } = ctx;
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm' }, memberships: [{ id: 'm' }] };
    render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <WriteGuard><button type="button">Save</button></WriteGuard> }));
    expect(screen.queryByRole('region', { name: 'Support session' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByTestId('sidebar').dataset.back).toBe('');
  });
});
