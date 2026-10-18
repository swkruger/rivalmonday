// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

const m = (id: string, role: string, agencyName: string, clientName: string | null = null) => ({ id, role, agencyName, clientName, agencyId: 'a', clientId: null, clientScope: null, contactId: null, createdAt: new Date() });
const current = m('m1', 'agency_admin', 'Acme Agency');
const user = (memberships: ReturnType<typeof m>[]) => ({ kind: 'user', userId: 'u', email: 'pat@acme.test', name: 'Pat Lee', ctx: {}, membership: current, memberships }) as never;

function openMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
  return screen.getByRole('menu');
}

describe('AvatarMenu (spec §2.9)', () => {
  it('shows the name, "{role} · {agency}", Notification settings and Sign out', () => {
    render(<AvatarMenu viewer={user([current])} />);
    const menu = openMenu();
    expect(within(menu).getByText('Pat Lee')).toBeTruthy();
    expect(within(menu).getByText('Agency admin · Acme Agency')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Notification settings' }).getAttribute('href')).toBe('/settings/notifications');
    expect(within(menu).getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(within(menu).queryByText('Switch account')).toBeNull();
  });

  it('Switch account lists only the other memberships, each a switchMembership form', () => {
    const others = [m('m2', 'client_owner', 'Other Agency', 'Brazos Plumbing'), m('m3', 'account_manager', 'Third Agency')];
    render(<AvatarMenu viewer={user([current, ...others])} />);
    const menu = openMenu();
    expect(within(menu).getByText('Switch account')).toBeTruthy();
    const items = within(menu).getAllByRole('menuitem').filter((i) => i.tagName === 'BUTTON');
    expect(items.map((i) => i.textContent)).toEqual(['Brazos PlumbingClient owner · Other Agency', 'Third AgencyAccount manager']);
    const ids = [...document.querySelectorAll<HTMLInputElement>('input[name="membershipId"]')].map((i) => i.value);
    expect(ids).toEqual(['m2', 'm3']);
  });

  it('support viewer: "Support session · {agency}", no notification settings, no account switching', () => {
    const viewer = { kind: 'support', userId: 'u', email: 'op@rm.test', name: 'Op Erator', ctx: {}, session: { agencyName: 'Target Agency' } } as never;
    render(<AvatarMenu viewer={viewer} />);
    const menu = openMenu();
    expect(within(menu).getByText('Support session · Target Agency')).toBeTruthy();
    expect(within(menu).queryByRole('menuitem', { name: 'Notification settings' })).toBeNull();
    expect(within(menu).getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});
