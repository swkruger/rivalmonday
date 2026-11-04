// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteGuard } from '@/components/read-only';
import { BANNER_HEIGHT, SHELL_OFFSET } from '@/components/shell/banner-height';

const m = vi.hoisted(() => ({
  notice: null as null | { paused: boolean; paymentNeeded: boolean; enabled: boolean }, themed: [] as string[], unread: vi.fn(async () => 3), role: vi.fn(async () => 'owner' as string | null),
  // Task 4 (launch gate): every read records its start and, while `gate` is set, waits on it (parallel-start test).
  started: [] as string[], gate: null as Promise<void> | null, spendFails: false, verticalsFail: false, listClientsFails: false,
  hold: async (name: string) => { m.started.push(name); if (m.gate) await m.gate; },
  logoUrl: null as string | null, realSidebar: false, clients: [] as { id: string; name: string; verticalId: string }[], paused: [] as { clientId: string; name: string; until: string }[], spendCalls: [] as unknown[], counts: vi.fn(async (_ctx: unknown, _opts: { agency: boolean; operator: boolean; leads: boolean }) => ({ leads: 2 } as Record<string, number>)),
}));
let pathname = '/agency';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// The support viewer's ctx is the target agency's; a user viewer here is the operator's own agency.
vi.mock('@/server/theme', () => ({
  themeForViewer: async (v: { kind: string }) => {
    m.themed.push(v.kind);
    await m.hold('theme');
    const primary = v.kind === 'support' ? '#aa0000' : '#0000aa';
    return { branding: { displayName: 'Acme Agency', logoUrl: m.logoUrl }, style: { '--primary': primary }, assistantName: 'Friday' };
  },
}));
vi.mock('@/server/tools', () => ({
  callTool: async (_ctx: unknown, name: string, input: unknown) => {
    await m.hold(name);
    if (name === 'get_spend_status') { m.spendCalls.push(input); if (m.spendFails) throw new Error('spend read failed'); return { paused: m.paused }; }
    if (name === 'list_clients' && m.listClientsFails) throw new Error('list_clients refused');
    return { items: m.clients };
  },
}));
vi.mock('@/server/client-billing-state', () => ({ clientBillingNoticeOf: async () => { await m.hold('client_billing'); return m.notice; } }));
// A guest's client name is read through `withTenant` (RLS); the shell test has no database.
vi.mock('@cs/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@cs/db')>()), withTenant: async () => { await m.hold('client_name'); return [{ name: 'A1 HVAC' }]; } }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {}, app: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [], supportEmail: () => 'support@rivalmonday.app' }));
// Phase 14a: vertical names come from the DB catalogue (`verticalOptions`), not the YAML packs.
vi.mock('@/server/verticals', () => ({
  verticalOptions: async () => { await m.hold('verticals'); if (m.verticalsFail) throw new Error('catalogue down'); return [{ id: 'hvac_plumbing', name: 'HVAC & Plumbing', services: [] }]; },
}));
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
const ctx = { agencyId: AG, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [], planFeatures: new Set(['ask', 'mcp']), support: { sessionId: 's', platformUserId: 'op' } };
const supportViewer = {
  kind: 'support', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx,
  session: { id: '11111111-1111-4111-8111-111111111111', platformUserId: 'op', agencyId: AG, agencyName: 'Acme Agency', reason: 'Checking brief setup', expiresAt: new Date(Date.now() + 30 * 60_000) },
};

beforeEach(() => {
  pathname = '/agency';
  m.realSidebar = false;
  m.clients = [];
  m.paused = [];
  m.spendCalls = [];
  m.logoUrl = null;
  m.counts.mockClear();
  m.started = [];
  m.gate = null;
  m.spendFails = false;
  m.verticalsFail = false;
  m.listClientsFails = false;
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
  const snap = (onHold: boolean) => ({ state: 'active' as const, trialEndsAt: null, pausesOn: null, onHold, supportEmail: 'support@rivalmonday.app' });
  it('agency on hold: read-only provider on and the hold banner shows', async () => {
    const c = { ...own, role: 'agency_admin' };
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: c, membership: { id: 'm' }, memberships: [{ id: 'm' }] };
    render(await AppShell({ viewer: viewer as never, ctx: c as never, billing: snap(true), children: <WriteGuard><button type="button">Save</button></WriteGuard> }));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText('This account is on hold. Contact support@rivalmonday.app to restore it.')).toBeTruthy();
  });

  it('agency not on hold: writes visible', async () => {
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm' }, memberships: [{ id: 'm' }] };
    render(await AppShell({ viewer: viewer as never, ctx: own as never, billing: snap(false), children: <WriteGuard><button type="button">Save</button></WriteGuard> }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

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

  it('platform zone: Rival Monday wordmark in the top bar and the default theme, even for a white-label operator agency', async () => {
    m.realSidebar = true;
    m.logoUrl = 'https://acme.example/logo.png';
    pathname = '/platform/agencies';
    const { container } = render(await AppShell({ viewer: userViewer as never, ctx: own as never, platformRole: 'owner', zone: 'platform', children: <p>page</p> }));
    const bar = screen.getByRole('banner');
    expect(within(bar).getByText('rival')).toBeTruthy();
    expect(within(bar).getByText('monday')).toBeTruthy();
    expect(within(bar).queryByRole('img')).toBeNull();
    expect(within(bar).queryByText('Acme Agency')).toBeNull();
    const aside = screen.getByRole('complementary');
    expect(within(aside).queryByText('rival')).toBeNull();
    expect(aside.querySelector('[data-slot="shell-brand"]')).toBeNull();
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

  it('agency view: the agency logo and name sit at the left of the top bar, not in the sidebar (2026-11-03)', async () => {
    m.realSidebar = true;
    m.logoUrl = 'https://acme.example/logo.png';
    render(await AppShell({ viewer: userViewer as never, ctx: own as never, children: <p>page</p> }));
    const bar = screen.getByRole('banner');
    const brandSlot = bar.querySelector('[data-slot="top-bar-brand"]') as HTMLElement;
    expect(brandSlot.className).toContain('lg:w-[240px]');
    expect(within(brandSlot).getByRole('img', { name: 'Acme Agency' }).getAttribute('src')).toBe('https://acme.example/logo.png');
    expect(within(brandSlot).getByText('Acme Agency')).toBeTruthy();
    const aside = screen.getByRole('complementary');
    expect(within(aside).queryByRole('img')).toBeNull();
    expect(within(aside).queryByText('Acme Agency', { selector: 'div' })).toBeNull();
    expect(within(aside).getByRole('link', { name: 'Portfolio' })).toBeTruthy();
  });

  it('top bar: full width above the sidebar and sticky under any banner, below dialogs (z-40)', async () => {
    m.realSidebar = true;
    const { container } = render(await AppShell({ viewer: userViewer as never, ctx: own as never, children: <p>page</p> }));
    const root = container.querySelector('[data-slot="shell"]') as HTMLElement;
    const bar = screen.getByRole('banner');
    expect(bar.parentElement).toBe(root);
    expect(bar.className).toMatch(/(^|\s)sticky(\s|$)/);
    expect(bar.className).toContain('top-(--rm-banner-h)');
    expect(bar.className).toContain('z-40');
    expect(bar.className).toContain('h-12');
    expect(bar.className).toContain('w-full');
    expect(root.className).toContain(SHELL_OFFSET.plain);
    expect(bar.compareDocumentPosition(screen.getByRole('complementary')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('complementary').className).toContain('top-(--rm-shell-top)');
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
    const c = { agencyId: AG, userId: 'u', role, clientScope: [CL], features: new Set(), planFeatures: new Set(['ask', 'mcp']) };
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

describe('AppShell spend banners (7b1)', () => {
  // formatDate omits the current year, so pin "now" (Date only).
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-23T12:00:00Z')); });
  afterAll(() => { vi.useRealTimers(); });
  const CL = '00000000-0000-4000-8000-0000000000a1';
  const PAUSED = [{ clientId: CL, name: 'A1 HVAC', until: '2026-11-01' }];
  const as = (role: string, scope: 'all' | string[] = 'all') => {
    const c = { agencyId: AG, userId: 'u', role, clientScope: scope, features: new Set(), planFeatures: new Set(['ask', 'mcp']) };
    return { viewer: { kind: 'user', userId: 'u', email: 'u@c.test', name: 'U', ctx: c, membership: { id: 'm', clientName: 'A1 HVAC', agencyName: 'Acme Agency' }, memberships: [{ id: 'm' }] }, ctx: c };
  };
  const shell = async (role: string, scope?: 'all' | string[]) => { const { viewer, ctx: c } = as(role, scope); return render(await AppShell({ viewer: viewer as never, ctx: c as never, children: <p>page</p> })); };

  it('admin banner lists paused clients, AM sees none', async () => {
    m.paused = PAUSED;
    const { unmount } = await shell('agency_admin');
    expect(screen.getByRole('region', { name: 'Usage' }).textContent).toContain('AI work for A1 HVAC is paused until November 1');
    expect(m.spendCalls).toEqual([{}]);
    unmount();
    m.spendCalls = [];
    await shell('account_manager');
    expect(screen.queryByRole('region', { name: 'Usage' })).toBeNull();
    expect(m.spendCalls).toEqual([]);
  });

  it('client banner shows C3 for the client roles, scoped to their client', async () => {
    m.paused = PAUSED;
    const { unmount } = await shell('client_owner', [CL]);
    expect(screen.getByRole('region', { name: 'Usage' }).textContent).toContain('Monitoring and new briefs are paused for the rest of this month.');
    expect(screen.getByRole('region', { name: 'Usage' }).textContent).toContain('your Acme Agency team has been told');
    expect(m.spendCalls).toEqual([{ clientId: CL }]);
    unmount();
    await shell('client_viewer', [CL]);
    expect(screen.getByRole('region', { name: 'Usage' })).toBeTruthy();
  });

  it('no banner when nothing is paused, and the platform zone never reads the status', async () => {
    const { unmount } = await shell('agency_admin');
    expect(screen.queryByRole('region', { name: 'Usage' })).toBeNull();
    unmount();
    m.spendCalls = [];
    const { viewer, ctx: c } = as('agency_admin');
    render(await AppShell({ viewer: viewer as never, ctx: c as never, platformRole: 'owner', zone: 'platform', children: <p>page</p> }));
    expect(m.spendCalls).toEqual([]);
  });
});

describe('AppShell frame (16b)', () => {
  const own = (() => { const { support: _s, ...o } = ctx; return o; })();
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('renders the children inside one white sheet (main[data-slot=sheet]) with a sheet-inner wrapper', async () => {
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm' }, memberships: [{ id: 'm' }] };
    const { container } = render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <p>page</p> }));
    const sheets = container.querySelectorAll('main[data-slot="sheet"]');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].querySelector('[data-slot="sheet-inner"]')?.textContent).toBe('page');
  });

  it('guard (P2): the sheet has no overflow-hidden (sticky SaveBar and page headers need the viewport as scroll root)', async () => {
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm' }, memberships: [{ id: 'm' }] };
    const { container } = render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <p>page</p> }));
    const sheet = container.querySelector('main[data-slot="sheet"]') as HTMLElement;
    expect(sheet.className).not.toContain('overflow-hidden');
    expect((sheet.firstElementChild as HTMLElement).className).not.toContain('overflow-hidden');
  });

  it('keeps exactly one complementary landmark (the sidebar)', async () => {
    m.realSidebar = true;
    const viewer = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm', agencyName: 'Acme Agency', role: 'agency_admin' }, memberships: [{ id: 'm', agencyName: 'Acme Agency', role: 'agency_admin' }] };
    render(await AppShell({ viewer: viewer as never, ctx: own as never, children: <p>page</p> }));
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
  });

  it('guard: in a support session the bar sticks below the fixed banner and the sidebar below both', async () => {
    m.realSidebar = true;
    const { container } = render(await AppShell({ viewer: supportViewer as never, ctx: ctx as never, children: <p>page</p> }));
    expect(screen.getByRole('region', { name: 'Support session' })).toBeTruthy();
    const root = container.querySelector('[data-slot="shell"]') as HTMLElement;
    expect(root.className).toContain(SHELL_OFFSET.support);
    expect(root.className).toContain(BANNER_HEIGHT.offset);
    expect(SHELL_OFFSET.support).toContain('[--rm-banner-h:3.5rem]');
    expect(SHELL_OFFSET.support).toContain('sm:[--rm-banner-h:2.25rem]');
    expect(SHELL_OFFSET.support).toContain('sm:[--rm-shell-top:5.25rem]');
    expect(screen.getByRole('banner').className).toContain('top-(--rm-banner-h)');
    expect(screen.getByRole('complementary').className).toContain('top-(--rm-shell-top)');
  });

  it('hold, guest and client-billing banners render before the sheet', async () => {
    m.notice = { paused: true, paymentNeeded: false, enabled: true };
    const c = { agencyId: AG, userId: 'u', role: 'client_viewer', clientScope: ['00000000-0000-4000-8000-0000000000a1'], features: new Set(), planFeatures: new Set(['ask', 'mcp']) };
    const guest = { kind: 'guest', contactId: 'c1', ctx: c };
    const { container } = render(await AppShell({ viewer: guest as never, ctx: c as never, billing: { state: 'active', trialEndsAt: null, pausesOn: null, onHold: true, supportEmail: 'support@rivalmonday.app' } as never, children: <p>page</p> }));
    const sheet = container.querySelector('main[data-slot="sheet"]') as Element;
    const guestBanner = screen.getByText('You are viewing this through an email link.');
    const billing = screen.getAllByRole('region', { name: 'Billing' });
    expect(billing.length).toBeGreaterThan(0);
    expect(before(guestBanner, sheet)).toBe(true);
    for (const b of billing) expect(before(b, sheet)).toBe(true);
  });
});

describe('AppShell parallel reads (launch gate Task 4)', () => {
  const own = (() => { const { support: _s, ...o } = ctx; return o; })();
  const admin = { kind: 'user', userId: 'op', email: 'op@example.com', name: 'Op Erator', ctx: own, membership: { id: 'm', agencyName: 'Acme Agency', role: 'agency_admin' }, memberships: [{ id: 'm', agencyName: 'Acme Agency', role: 'agency_admin' }] };
  const C = '33333333-3333-4333-8333-333333333333';
  const flush = () => new Promise((r) => setTimeout(r, 0));
  // Holds every read open, then checks they all started before any finished (one stage, not a waterfall).
  const gated = async (render: () => Promise<unknown>) => {
    let release!: () => void;
    m.gate = new Promise<void>((r) => { release = r; });
    m.unread.mockImplementation(async () => { await m.hold('unread'); return 3; });
    m.role.mockImplementation(async () => { await m.hold('platform_role'); return 'owner'; });
    m.counts.mockImplementation(async () => { await m.hold('nav_counts'); return { leads: 2 }; });
    const done = render();
    await flush();
    const started = [...m.started].sort();
    release();
    await done;
    return started;
  };

  it('agency admin: theme, list_clients, unread, platform role, client billing, spend, nav counts and verticals all start before any resolves', async () => {
    m.clients = [{ id: C, name: 'Lone Star Cooling', verticalId: 'hvac_plumbing' }];
    const started = await gated(() => AppShell({ viewer: admin as never, ctx: own as never, children: <p>page</p> }));
    expect(started).toEqual(['client_billing', 'get_spend_status', 'list_clients', 'nav_counts', 'platform_role', 'theme', 'unread', 'verticals']);
  });

  it('guest: the RLS client-name read joins the same batch as the rest', async () => {
    const c = { agencyId: AG, userId: 'contact:c1', role: 'client_viewer', clientScope: [C], features: new Set(), planFeatures: new Set(['ask', 'mcp']) };
    const guest = { kind: 'guest', contactId: 'c1', ctx: c };
    const started = await gated(() => AppShell({ viewer: guest as never, ctx: c as never, children: <p>page</p> }));
    expect(started).toEqual(['client_billing', 'client_name', 'get_spend_status', 'nav_counts', 'theme', 'unread']);
  });

  it('a preloaded batch (the (app) layout) is used as is: the shell starts no second set of reads', async () => {
    const { startShellReads } = await import('./app-shell');
    const reads = startShellReads(admin as never, own as never);
    await reads;
    m.started = [];
    render(await AppShell({ viewer: admin as never, ctx: own as never, reads, children: <p>page</p> }));
    expect(m.started).toEqual([]);
    expect(screen.getByTestId('sidebar').dataset.leads).toBe('2');
  });

  it('a preloaded batch whose list_clients rejects still makes AppShell throw (the refusal stays a 404, never a degraded shell)', async () => {
    const { startShellReads } = await import('./app-shell');
    m.listClientsFails = true;
    const reads = startShellReads(admin as never, own as never);
    reads.catch(() => {}); // as the (app) layout does: no unhandled rejection before the shell awaits it
    await expect(AppShell({ viewer: admin as never, ctx: own as never, reads, children: <p>page</p> })).rejects.toThrow('list_clients refused');
  });

  it('decorative reads degrade, not fail: a failed spend status or vertical catalogue renders the same props as an empty one', async () => {
    m.realSidebar = true;
    m.clients = [{ id: C, name: 'Lone Star Cooling', verticalId: 'hvac_plumbing' }];
    m.verticalsFail = true;
    m.spendFails = true;
    pathname = `/c/${C}/pricing`;
    const failed = render(await AppShell({ viewer: admin as never, ctx: own as never, children: <p>page</p> }));
    // React ids (useId) differ between two renders; everything else must match.
    const markup = (el: HTMLElement) => el.innerHTML.replace(/_r_[0-9a-z]+_/g, 'ID');
    const failedHtml = markup(failed.container);
    // The switcher shows the client without the vertical sub-line, and no Usage banner.
    expect(within(screen.getByRole('complementary')).getByRole('button', { name: /Lone Star Cooling/ }).textContent).not.toContain('HVAC');
    expect(screen.queryByRole('region', { name: 'Usage' })).toBeNull();
    failed.unmount();
    m.verticalsFail = false;
    m.spendFails = false;
    m.paused = [];
    // The same shell with both reads succeeding but holding nothing for this client: identical markup.
    m.clients = [{ id: C, name: 'Lone Star Cooling', verticalId: 'no_such_vertical' }];
    const ok = render(await AppShell({ viewer: admin as never, ctx: own as never, children: <p>page</p> }));
    expect(markup(ok.container)).toBe(failedHtml);
  });
});
