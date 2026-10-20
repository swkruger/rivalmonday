// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ path: '/agency' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));
vi.mock('@/app/(app)/actions', () => ({ switchMembership: vi.fn() }));
vi.mock('@/components/sign-out-button', () => ({ SignOutButton: () => <button type="button">Sign out</button> }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const { AvatarMenu } = await import('./avatar-menu');

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const CLIENT = '00000000-0000-4000-8000-0000000000c1';
const flags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true };
const switcher = (over: Record<string, unknown> = {}) => ({
  flags, agencyName: 'Acme Agency', clients: [{ id: CLIENT, name: 'Brazos Plumbing', sub: null, setup: false }], ownAgencies: [], currentMembershipId: 'm1', supportAgency: null, fallback: null, accounts: [], ...over,
}) as never;
const m = (id: string, role: string, agencyName: string, clientName: string | null = null) => ({ id, role, agencyName, clientName, agencyId: 'a', clientId: null, clientScope: null, contactId: null, createdAt: new Date() });
const current = m('m1', 'agency_admin', 'Acme Agency');
const user = (memberships: ReturnType<typeof m>[]) => ({ kind: 'user', userId: 'u', email: 'pat@acme.test', name: 'Pat Lee', ctx: {}, membership: current, memberships }) as never;

function openMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
  return screen.getByRole('menu');
}

describe('AvatarMenu (spec §2.9)', () => {
  it('shows the name, "{role} · {agency}", Notification settings and Sign out', () => {
    render(<AvatarMenu viewer={user([current])} switcher={switcher()} />);
    const menu = openMenu();
    expect(within(menu).getByText('Pat Lee')).toBeTruthy();
    expect(within(menu).getByText('Agency admin · Acme Agency')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Notification settings' }).getAttribute('href')).toBe('/settings/notifications');
    expect(within(menu).getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(within(menu).queryByText('Switch account')).toBeNull();
  });

  it('Switch account lists only the other memberships, each a switchMembership form', () => {
    const others = [m('m2', 'client_owner', 'Other Agency', 'Brazos Plumbing'), m('m3', 'account_manager', 'Third Agency')];
    render(<AvatarMenu viewer={user([current, ...others])} switcher={switcher()} />);
    const menu = openMenu();
    expect(within(menu).getByText('Switch account')).toBeTruthy();
    const items = within(menu).getAllByRole('menuitem').filter((i) => i.tagName === 'BUTTON');
    expect(items.map((i) => i.textContent)).toEqual(['Brazos PlumbingClient owner · Other Agency', 'Third AgencyAccount manager']);
    const ids = [...document.querySelectorAll<HTMLInputElement>('input[name="membershipId"]')].map((i) => i.value);
    expect(ids).toEqual(['m2', 'm3']);
  });

  it('support viewer: "Support session · {agency}", no notification settings, no account switching', () => {
    const viewer = { kind: 'support', userId: 'u', email: 'op@rm.test', name: 'Op Erator', ctx: {}, session: { agencyName: 'Target Agency' } } as never;
    render(<AvatarMenu viewer={viewer} switcher={switcher()} />);
    const menu = openMenu();
    expect(within(menu).getByText('Support session · Target Agency')).toBeTruthy();
    expect(within(menu).queryByRole('menuitem', { name: 'Notification settings' })).toBeNull();
    expect(within(menu).getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it.each([
    ['/platform/agencies', {}, '/platform/help'],
    ['/agency/approvals', {}, '/agency/help'],
    [`/c/${CLIENT}/reviews`, {}, `/c/${CLIENT}/help`],
    ['/inbox', { fallback: { context: 'client', clientId: CLIENT } }, `/c/${CLIENT}/help`],
  ])('Help links to the Help page of the live context (%s)', (path, over, href) => {
    nav.path = path;
    render(<AvatarMenu viewer={user([current])} switcher={switcher(over)} />);
    expect(within(openMenu()).getByRole('menuitem', { name: 'Help' }).getAttribute('href')).toBe(href);
  });

  it('a client role on a neutral page gets the Help of its own client', () => {
    nav.path = '/inbox';
    render(<AvatarMenu viewer={user([current])} switcher={switcher({ flags: { ...flags, isAgency: false, isAgencyAdmin: false, homePath: `/c/${CLIENT}` } })} />);
    expect(within(openMenu()).getByRole('menuitem', { name: 'Help' }).getAttribute('href')).toBe(`/c/${CLIENT}/help`);
  });

  it('a support viewer also gets Help', () => {
    nav.path = '/agency';
    const viewer = { kind: 'support', userId: 'u', email: 'op@rm.test', name: 'Op Erator', ctx: {}, session: { agencyName: 'Target Agency' } } as never;
    render(<AvatarMenu viewer={viewer} switcher={switcher()} />);
    expect(within(openMenu()).getByRole('menuitem', { name: 'Help' }).getAttribute('href')).toBe('/agency/help');
  });
});
