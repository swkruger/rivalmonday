// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteGuard } from '@/components/read-only';

const m = vi.hoisted(() => ({ themed: [] as string[], unread: vi.fn(async () => 3), role: vi.fn(async () => 'owner' as string | null) }));
// The support viewer's ctx is the target agency's; a user viewer here is the operator's own agency.
vi.mock('@/server/theme', () => ({
  themeForViewer: async (v: { kind: string }) => {
    m.themed.push(v.kind);
    const primary = v.kind === 'support' ? '#aa0000' : '#0000aa';
    return { branding: { displayName: 'Acme Agency', logoUrl: null }, style: { '--primary': primary }, assistantName: 'Friday' };
  },
}));
vi.mock('@/server/tools', () => ({ callTool: async () => ({ items: [] }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {}, app: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ unreadCount: m.unread, platformRole: m.role }));
vi.mock('./sidebar', () => ({
  Sidebar: ({ flags }: { flags: { backToPlatform?: string; isPlatformOperator?: boolean; isPlatformOwner?: boolean } }) => (
    <nav data-testid="sidebar" data-back={flags.backToPlatform ?? ''} data-operator={String(Boolean(flags.isPlatformOperator))} data-owner={String(Boolean(flags.isPlatformOwner))} />
  ),
}));
vi.mock('./mobile-nav', () => ({ MobileNav: () => null }));
vi.mock('./client-switcher', () => ({ ClientSwitcher: () => null }));
vi.mock('./inbox-bell', () => ({ InboxBell: ({ unread }: { unread: number }) => <span data-testid="bell">{unread}</span> }));
vi.mock('./guest-sign-out-button', () => ({ GuestSignOutButton: () => <button type="button">Guest sign out</button> }));
vi.mock('@/components/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sign out</button> }));
const { AppShell } = await import('./app-shell');

const AG = '22222222-2222-4222-8222-222222222222';
const ctx = { agencyId: AG, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [], support: { sessionId: 's', platformUserId: 'op' } };
const supportViewer = {
  kind: 'support', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx,
  session: { id: '11111111-1111-4111-8111-111111111111', platformUserId: 'op', agencyId: AG, agencyName: 'Acme Agency', reason: 'Checking brief setup', expiresAt: new Date(Date.now() + 30 * 60_000) },
};

beforeEach(() => {
  m.themed.length = 0;
  m.unread.mockClear();
  m.role.mockClear();
  m.role.mockResolvedValue('owner');
  document.documentElement.removeAttribute('style');
});

const themeOf = (c: HTMLElement) => (c.querySelector('[data-shell-theme]') as HTMLElement).style.getPropertyValue('--primary');

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

  it('(app) in a session: themed with the support agency (g8) on the shell and <html> (M1); no inbox bell (M2)', async () => {
    const { container } = render(await AppShell({ viewer: supportViewer as never, ctx: ctx as never, children: <p>page</p> }));
    expect(m.themed).toEqual(['support']);
    expect(themeOf(container)).toBe('#aa0000');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#aa0000');
    expect(screen.queryByTestId('bell')).toBeNull();
    expect(m.unread).not.toHaveBeenCalled();
  });

  it('(platform) / outside a session: themed with the viewer own agency; the inbox bell shows the unread count', async () => {
    const { support: _s, ...own } = ctx;
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm' }, memberships: [{ id: 'm' }] };
    const { container, unmount } = render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <p>page</p> }));
    expect(m.themed).toEqual(['user']);
    expect(themeOf(container)).toBe('#0000aa');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#0000aa');
    expect(screen.getByTestId('bell').textContent).toBe('3');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });

  it('outside a session: no banner, writes visible', async () => {
    const { support: _s, ...own } = ctx;
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm' }, memberships: [{ id: 'm' }] };
    render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <WriteGuard><button type="button">Save</button></WriteGuard> }));
    expect(screen.queryByRole('region', { name: 'Support session' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByTestId('sidebar').dataset.back).toBe('');
  });

  const own = (() => { const { support: _s, ...o } = ctx; return o; })();
  const userViewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm' }, memberships: [{ id: 'm' }] };

  it('(app) layout (platformRole prop omitted): resolves the role once, so an owner still gets owner nav', async () => {
    render(await AppShell({ viewer: userViewer as never, ctx: own as never, children: <p>page</p> }));
    expect(m.role).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sidebar').dataset.operator).toBe('true');
    expect(screen.getByTestId('sidebar').dataset.owner).toBe('true');
  });

  it('(app) layout: a staff operator is an operator but not an owner; a non-operator is neither', async () => {
    m.role.mockResolvedValue('staff');
    const { unmount } = render(await AppShell({ viewer: userViewer as never, ctx: own as never, children: <p>page</p> }));
    expect(screen.getByTestId('sidebar').dataset).toMatchObject({ operator: 'true', owner: 'false' });
    unmount();
    m.role.mockResolvedValue(null);
    render(await AppShell({ viewer: userViewer as never, ctx: own as never, children: <p>page</p> }));
    expect(screen.getByTestId('sidebar').dataset).toMatchObject({ operator: 'false', owner: 'false' });
  });

  it('(platform) layout passes the role: no second lookup', async () => {
    render(await AppShell({ viewer: userViewer as never, ctx: own as never, platformRole: 'owner', children: <p>page</p> }));
    expect(m.role).not.toHaveBeenCalled();
    expect(screen.getByTestId('sidebar').dataset.owner).toBe('true');
  });
});
