// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SwitcherProps } from './context-switcher';
import type { NavRoleFlags } from './nav-items';

let pathname = '/c/11111111-1111-1111-1111-111111111111';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/(app)/actions', () => ({ switchMembership: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const { MobileNav } = await import('./mobile-nav');

const switcherFor = (f: NavRoleFlags, zone?: 'platform'): SwitcherProps => ({
  flags: f, zone, agencyName: 'Acme Agency', clients: [{ id: '11111111-1111-1111-1111-111111111111', name: 'A1 HVAC', sub: null, setup: false }],
  ownAgencies: [], currentMembershipId: 'm', supportAgency: null, fallback: null, accounts: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flags: NavRoleFlags = {
  isAgency: false, isAgencyAdmin: false, isUser: true, homePath: '/c/11111111-1111-1111-1111-111111111111',
  dashboard: true, alertRules: false, mcp: false,
};

describe('MobileNav (decision 14)', () => {
  it('opens a drawer with the same nav items and closes when a link is tapped', () => {
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} counts={{}} fallback={null} clients={[]} switcher={switcherFor(flags)} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toBeTruthy();
    const pricing = screen.getByRole('link', { name: 'Pricing' });
    fireEvent.click(pricing);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('platform zone: the drawer shows the Rival Monday wordmark and the platform sections', () => {
    pathname = '/platform/agencies';
    const operator: NavRoleFlags = { ...flags, isAgency: true, isAgencyAdmin: true, homePath: '/agency', isPlatformOperator: true };
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={operator} counts={{}} zone="platform" fallback={null} clients={[]} switcher={switcherFor(operator, 'platform')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByText('rival')).toBeTruthy();
    expect(within(dialog).getByText('monday')).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Customers' })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Agencies' }).getAttribute('aria-current')).toBe('page');
    pathname = '/c/11111111-1111-1111-1111-111111111111';
  });

  it('closes on Escape', () => {
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} counts={{}} fallback={null} clients={[]} switcher={switcherFor(flags)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the context switcher first in the drawer (static client name for a one-client owner)', () => {
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} counts={{}} fallback={null} clients={[]} switcher={switcherFor(flags)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByText('A1 HVAC')).toBeTruthy();
  });

  it('the drawer copy of the switcher opens a modal popover (scrollable inside the modal Sheet)', () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView ??= () => {};
    const agency: NavRoleFlags = { ...flags, isAgency: true, isAgencyAdmin: true, homePath: '/agency' };
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={agency} counts={{}} fallback={null} clients={[]} switcher={switcherFor(agency)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    fireEvent.click(within(sheet).getByRole('button', { name: /A1 HVAC/ }));
    expect(screen.getByPlaceholderText('Search clients')).toBeTruthy();
    // A modal Radix Popover hides everything outside it (hideOthers) and owns the scroll lock.
    expect(sheet.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('closes when the viewport grows to lg (min-width: 1024px)', () => {
    const listeners: ((e: { matches: boolean }) => void)[] = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query, matches: false,
      addEventListener: (_t: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
      removeEventListener: (_t: string, l: (e: { matches: boolean }) => void) => listeners.splice(listeners.indexOf(l), 1),
    }));
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} counts={{}} fallback={null} clients={[]} switcher={switcherFor(flags)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeTruthy();
    act(() => { for (const l of [...listeners]) l({ matches: false }); });
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeTruthy();
    act(() => { for (const l of [...listeners]) l({ matches: true }); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
