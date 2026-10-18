// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteGuard } from '@/components/read-only';

const m = vi.hoisted(() => ({
  notice: null as null | { paused: boolean; paymentNeeded: boolean; enabled: boolean }, themed: [] as string[], unread: vi.fn(async () => 3), role: vi.fn(async () => 'owner' as string | null),
  logoUrl: null as string | null, realSidebar: false, clients: [] as { id: string; name: string; verticalId: string }[], counts: vi.fn(async (_ctx: unknown, _opts: { agency: boolean; operator: boolean; leads: boolean }) => ({ leads: 2 } as Record<string, number>)),
}));
let pathname = '/agency';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));
// The support viewer's ctx is the target agency's; a user viewer here is the operator's own agency.
vi.mock('@/server/theme', () => ({
  themeForViewer: async (v: { kind: string }) => {
    m.themed.push(v.kind);
    const primary = v.kind === 'support' ? '#aa0000' : '#0000aa';
    return { branding: { displayName: 'Acme Agency', logoUrl: m.logoUrl }, style: { '--primary': primary }, assistantName: 'Friday' };
  },
}));
vi.mock('@/server/tools', () => ({ callTool: async () => ({ items: m.clients }) }));
vi.mock('@/server/client-billing-state', () => ({ clientBillingNoticeOf: async () => m.notice }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {}, app: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
// Phase 14a: vertical names come from the DB catalogue (`verticalOptions`), not the YAML packs.
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'hvac_plumbing', name: 'HVAC & Plumbing', services: [] }] }));
vi.mock('@cs/tools', () => ({ unreadCount: m.unread, platformRole: m.role }));
vi.mock('@/server/nav', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/server/nav')>()), navCounts: m.counts }));
vi.mock('./sidebar', async (importOriginal) => {
  const real = await importOriginal<typeof import('./sidebar')>();
  type Props = Parameters<typeof real.Sidebar>[0];
  return {
    Sidebar: (props: Props) => {
      if (m.realSidebar) return <real.Sidebar {...props} />;
      const { flags, counts } = props;
      return (
        <nav data-testid="sidebar" data-billing={String(Boolean(flags.clientBilling))} data-back={flags.backToPlatform ?? ''} data-operator={String(Boolean(flags.isPlatformOperator))} data-owner={String(Boolean(flags.isPlatformOwner))} data-leads={String(counts.leads ?? '')} data-flags={Object.keys(flags).join(',')} data-own-agencies={JSON.stringify(props.switcher.ownAgencies)} data-accounts={JSON.stringify(props.switcher.accounts)} />
      );
    },
  };
});
vi.mock('./mobile-nav', () => ({ MobileNav: () => null }));
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
  pathname = '/agency';
  m.realSidebar = false;
  m.clients = [];
  m.logoUrl = null;
  m.counts.mockClear();
  m.themed.length = 0;
  m.notice = null;
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

  it('outside a session (no zone): themed with the viewer own agency; the inbox bell shows the unread count', async () => {
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

  it('hands the badge counts to the sidebar as `counts`, not through the flags', async () => {
    render(await AppShell({ viewer: userViewer as never, ctx: own as never, children: <p>page</p> }));
    expect(screen.getByTestId('sidebar').dataset.leads).toBe('2');
    expect(screen.getByTestId('sidebar').dataset.flags).not.toContain('newLeads');
    // (app) never shows the platform menu (P1), so it reads no platform counts.
    expect(m.counts).toHaveBeenCalledWith(own, { agency: true, operator: false, leads: true });
  });

  it('platform zone: Rival Monday wordmark, default theme and "Platform" footer even for a white-label operator agency', async () => {
    m.realSidebar = true;
    m.logoUrl = 'https://acme.example/logo.png';
    pathname = '/platform/agencies';
    const { container } = render(await AppShell({ viewer: userViewer as never, ctx: own as never, platformRole: 'owner', zone: 'platform', children: <p>page</p> }));
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByText('rival')).toBeTruthy();
    expect(within(aside).getByText('monday')).toBeTruthy();
    expect(within(aside).queryByRole('img')).toBeNull();
    expect(within(aside).queryByText('Acme Agency')).toBeNull();
    expect(within(aside).getByText('Platform', { selector: 'div' })).toBeTruthy();
    // 15a Task 5: the context switcher card at the top of the sidebar names the platform view.
    expect(within(aside).getByRole('button', { name: /Platform\s*Operator console/ }).getAttribute('aria-haspopup')).toBe('dialog');
    expect(within(aside).getByRole('link', { name: 'Agencies' })).toBeTruthy();
    expect(m.themed).toEqual([]);
    expect(themeOf(container)).toBe('#47A8E7');
    expect(m.counts).toHaveBeenCalledWith(own, { agency: false, operator: true, leads: true });
  });

  it('context switcher: an open client shows its name and vertical; a support session names the supported agency', async () => {
    m.realSidebar = true;
    const C = '33333333-3333-4333-8333-333333333333';
    m.clients = [{ id: C, name: 'Lone Star Cooling', verticalId: 'hvac_plumbing' }];
    pathname = `/c/${C}/pricing`;
    const viewer = { ...userViewer, membership: { id: 'm', agencyName: 'Acme Agency', role: 'agency_admin' }, memberships: [{ id: 'm', agencyName: 'Acme Agency', role: 'agency_admin' }] };
    const { unmount } = render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <p>page</p> }));
    expect(within(screen.getByRole('complementary')).getByRole('button', { name: /Lone Star Cooling\s*HVAC & Plumbing/ })).toBeTruthy();
    unmount();
    pathname = '/agency';
    m.clients = [];
    render(await AppShell({ viewer: supportViewer as never, ctx: ctx as never, children: <p>page</p> }));
    expect(within(screen.getByRole('complementary')).getByRole('button', { name: /Acme Agency\s*Agency view/ })).toBeTruthy();
  });

  it('switcher lists: ownAgencies holds only agency memberships; a support session gets no memberships at all', async () => {
    const memberships = [
      { id: 'm', agencyName: 'Acme Agency', role: 'agency_admin', clientName: null },
      { id: 'm2', agencyName: 'Other Agency', role: 'client_owner', clientName: 'Brazos Plumbing' },
      { id: 'm3', agencyName: 'Third Agency', role: 'account_manager', clientName: null },
    ];
    const viewer = { ...userViewer, membership: memberships[0], memberships };
    const { unmount } = render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <p>page</p> }));
    expect(JSON.parse(screen.getByTestId('sidebar').dataset.ownAgencies!)).toEqual([{ membershipId: 'm', name: 'Acme Agency' }, { membershipId: 'm3', name: 'Third Agency' }]);
    expect(JSON.parse(screen.getByTestId('sidebar').dataset.accounts!)).toEqual([]);
    unmount();
    render(await AppShell({ viewer: supportViewer as never, ctx: ctx as never, children: <p>page</p> }));
    expect(JSON.parse(screen.getByTestId('sidebar').dataset.ownAgencies!)).toEqual([]);
    expect(JSON.parse(screen.getByTestId('sidebar').dataset.accounts!)).toEqual([]);
  });

  it('agency view keeps the agency logo and its name in the footer', async () => {
    m.realSidebar = true;
    m.logoUrl = 'https://acme.example/logo.png';
    render(await AppShell({ viewer: userViewer as never, ctx: own as never, children: <p>page</p> }));
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByRole('img', { name: 'Acme Agency' }).getAttribute('src')).toBe('https://acme.example/logo.png');
    expect(within(aside).getByText('Acme Agency', { selector: 'div' })).toBeTruthy();
    expect(within(aside).getByRole('link', { name: 'Portfolio' })).toBeTruthy();
  });

  it('(platform) layout passes the role: no second lookup', async () => {
    render(await AppShell({ viewer: userViewer as never, ctx: own as never, platformRole: 'owner', children: <p>page</p> }));
    expect(m.role).not.toHaveBeenCalled();
    expect(screen.getByTestId('sidebar').dataset.owner).toBe('true');
  });
});

describe('AppShell client billing (9b)', () => {
  const CL = '00000000-0000-4000-8000-0000000000a1';
  const asClient = (role: string, kind = 'user') => {
    const c = { agencyId: AG, userId: 'u', role, clientScope: [CL], features: new Set() };
    return { viewer: { kind, userId: 'u', email: 'u@c.test', name: 'U', ctx: c, membership: { id: 'm', clientName: 'A1 HVAC' }, memberships: [{ id: 'm' }] }, ctx: c };
  };
  const shell = async (role: string, kind?: string) => { const { viewer, ctx: c } = asClient(role, kind); return render(await AppShell({ viewer: viewer as never, ctx: c as never, children: <p>page</p> })); };

  it('owner with payment needed: agency-branded banner and the Billing nav flag', async () => {
    m.notice = { paused: false, paymentNeeded: true, enabled: true };
    await shell('client_owner');
    expect(screen.getByRole('region', { name: 'Billing' }).textContent).toContain('Payment needed — please update your payment method.');
    expect(screen.getByTestId('sidebar').dataset.billing).toBe('true');
  });

  it('viewer with payment needed: no banner, no Billing flag; paused shows for the viewer with the agency name', async () => {
    m.notice = { paused: false, paymentNeeded: true, enabled: true };
    const { unmount } = await shell('client_viewer');
    expect(screen.queryByRole('region', { name: 'Billing' })).toBeNull();
    expect(screen.getByTestId('sidebar').dataset.billing).toBe('false');
    unmount();
    m.notice = { paused: true, paymentNeeded: false, enabled: true };
    await shell('client_viewer');
    expect(screen.getByRole('region', { name: 'Billing' }).textContent).toBe('Monitoring is paused. Please contact Acme Agency.');
  });

  it('billing off: the owner has no Billing flag', async () => {
    m.notice = { paused: false, paymentNeeded: false, enabled: false };
    await shell('client_owner');
    expect(screen.getByTestId('sidebar').dataset.billing).toBe('false');
  });
});
