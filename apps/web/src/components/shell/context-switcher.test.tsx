// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavRoleFlags } from './nav-items';

let pathname = '/agency';
const push = vi.fn();
const switchMembership = vi.fn(async (_fd: FormData) => {});
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }));
vi.mock('@/app/(app)/actions', () => ({ switchMembership: (fd: FormData) => switchMembership(fd) }));

const { ContextSwitcher, ContextName } = await import('./context-switcher');
type Props = Parameters<typeof ContextSwitcher>[0];

// cmdk measures its list and scrolls the selected item into view; Radix Popper sizes its content — jsdom has neither.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const STALE = '99999999-9999-4999-8999-999999999999';
const M = 'mem-1';

const agencyAdmin: NavRoleFlags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true };
const operator: NavRoleFlags = { ...agencyAdmin, isPlatformOperator: true };
const clientOwner: NavRoleFlags = { isAgency: false, isAgencyAdmin: false, isUser: true, homePath: `/c/${C1}`, dashboard: true, alertRules: false, mcp: false };

const clients = [
  { id: C2, name: 'Bright Smiles Dental', sub: 'Dental', setup: false },
  { id: C1, name: 'Acme Heating', sub: 'HVAC & plumbing', setup: false },
  { id: C3, name: 'Cedar Creek Plumbing', sub: 'HVAC & plumbing', setup: false },
];

function props(over: Partial<Props> = {}): Props {
  return {
    flags: agencyAdmin, agencyName: 'Acme Agency', clients, ownAgencies: [{ membershipId: M, name: 'Acme Agency' }], currentMembershipId: M,
    supportAgency: null, fallback: null, accounts: [], ...over,
  };
}

const trigger = () => screen.getByRole('button', { name: /view|console|Dental|Heating|Plumbing/ });
const open = () => fireEvent.click(trigger());
const optionTexts = (heading: string) => within(screen.getByRole('group', { name: heading })).getAllByRole('option').map((o) => o.querySelector('[data-name]')?.textContent);

beforeEach(() => {
  pathname = '/agency';
  push.mockClear();
  switchMembership.mockClear();
  localStorage.clear();
  document.cookie = 'rm_nav_ctx=; path=/; max-age=0';
});

describe('ContextSwitcher (spec §2.4)', () => {
  it('agency view: trigger card names the agency, opens a dialog with search, links and All clients in name order', () => {
    render(<ContextSwitcher {...props({ flags: operator })} />);
    const t = trigger();
    expect(t.textContent).toContain('Acme Agency');
    expect(t.textContent).toContain('Agency view');
    expect(t.getAttribute('aria-haspopup')).toBe('dialog');
    open();
    expect(screen.getByPlaceholderText('Search clients')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Switch to Platform view' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Switch to Agency view' })).toBeNull();
    expect(optionTexts('All clients')).toEqual(['Acme Heating', 'Bright Smiles Dental', 'Cedar Creek Plumbing']);
    expect(screen.getByRole('option', { name: 'Add client' }).textContent).toBe('Add client');
    fireEvent.click(screen.getByRole('option', { name: 'Add client' }));
    expect(push).toHaveBeenCalledWith('/agency/clients/new');
  });

  it('filters All clients by the search box (and hides the context links while searching)', () => {
    render(<ContextSwitcher {...props({ flags: operator })} />);
    open();
    fireEvent.change(screen.getByPlaceholderText('Search clients'), { target: { value: 'plumb' } });
    expect(optionTexts('All clients')).toEqual(['Cedar Creek Plumbing']);
    expect(screen.queryByRole('option', { name: 'Switch to Platform view' })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Search clients'), { target: { value: 'zzz' } });
    expect(screen.getByText('No clients match.')).toBeTruthy();
  });

  it('Recent lists stored ids newest first, drops stale ids, and selecting a client navigates and records it', () => {
    localStorage.setItem(`rm.switcher.recent.${M}`, JSON.stringify([C3, STALE, C1]));
    render(<ContextSwitcher {...props()} />);
    open();
    expect(optionTexts('Recent')).toEqual(['Cedar Creek Plumbing', 'Acme Heating']);
    fireEvent.click(within(screen.getByRole('group', { name: 'All clients' })).getByText('Bright Smiles Dental'));
    expect(push).toHaveBeenCalledWith(`/c/${C2}`);
    expect(JSON.parse(localStorage.getItem(`rm.switcher.recent.${M}`)!)).toEqual([C2, C3, C1]);
  });

  it('pinned clients come first; the pin button toggles aria-pressed, persists, and does not navigate', () => {
    localStorage.setItem(`rm.switcher.pins.${M}`, JSON.stringify([C3, STALE]));
    render(<ContextSwitcher {...props()} />);
    open();
    expect(optionTexts('All clients')).toEqual(['Cedar Creek Plumbing', 'Acme Heating', 'Bright Smiles Dental']);
    expect(screen.getByRole('button', { name: 'Pin Cedar Creek Plumbing' }).getAttribute('aria-pressed')).toBe('true');
    const pin = screen.getByRole('button', { name: 'Pin Bright Smiles Dental' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(pin, { key: 'Enter' });
    fireEvent.click(pin);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pin Bright Smiles Dental' }).getAttribute('aria-pressed')).toBe('true');
    expect(optionTexts('All clients')).toEqual(['Bright Smiles Dental', 'Cedar Creek Plumbing', 'Acme Heating']);
    expect(JSON.parse(localStorage.getItem(`rm.switcher.pins.${M}`)!)).toEqual([C3, STALE, C2]);
  });

  it('opens with Ctrl+K and Cmd+K', () => {
    render(<ContextSwitcher {...props()} hotkey />);
    expect(screen.queryByPlaceholderText('Search clients')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByPlaceholderText('Search clients')).toBeTruthy();
    fireEvent.keyDown(screen.getByPlaceholderText('Search clients'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search clients')).toBeNull();
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(screen.getByPlaceholderText('Search clients')).toBeTruthy();
  });

  it('client view (agency role): trigger shows the client and its vertical; "Switch to Agency view" goes to /agency', () => {
    pathname = `/c/${C1}/pricing`;
    render(<ContextSwitcher {...props()} />);
    expect(trigger().textContent).toContain('Acme Heating');
    expect(trigger().textContent).toContain('HVAC & plumbing');
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Switch to Agency view' }));
    expect(push).toHaveBeenCalledWith('/agency');
  });

  it('records the open client page in Recent', () => {
    pathname = `/c/${C3}`;
    render(<ContextSwitcher {...props()} />);
    expect(JSON.parse(localStorage.getItem(`rm.switcher.recent.${M}`)!)).toEqual([C3]);
  });

  it('platform view: "Your agencies" lists only own agencies; the current one navigates, another switches membership', () => {
    pathname = '/platform/agencies';
    render(<ContextSwitcher {...props({ zone: 'platform', flags: operator, ownAgencies: [{ membershipId: M, name: 'Acme Agency' }, { membershipId: 'mem-2', name: 'Second Agency' }] })} />);
    expect(trigger().textContent).toContain('Platform');
    expect(trigger().textContent).toContain('Operator console');
    open();
    expect(screen.getByPlaceholderText('Search agencies')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'All clients' })).toBeNull();
    expect(optionTexts('Your agencies')).toEqual(['Acme Agency', 'Second Agency']);
    expect(screen.getByRole('option', { name: 'Switch to Agency view' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Switch to Platform view' })).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Your agencies' })).getByText('Acme Agency'));
    expect(push).toHaveBeenCalledWith('/agency');
    open();
    fireEvent.click(within(screen.getByRole('group', { name: 'Your agencies' })).getByText('Second Agency'));
    expect(switchMembership).toHaveBeenCalledTimes(1);
    expect(switchMembership.mock.calls[0]![0].get('membershipId')).toBe('mem-2');
  });

  it('platform view: an operator with no agency membership sees no agency list and no "Switch to Agency view"', () => {
    pathname = '/platform';
    render(<ContextSwitcher {...props({ zone: 'platform', flags: { ...clientOwner, isPlatformOperator: true }, ownAgencies: [], accounts: [{ membershipId: M, name: 'Acme Heating', sub: 'Acme Agency' }] })} />);
    open();
    expect(screen.queryByRole('group', { name: 'Your agencies' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Switch to Agency view' })).toBeNull();
  });

  it('support session: supported agency, "Back to platform", no Platform link, no pins, no Add client, no storage writes', () => {
    render(<ContextSwitcher {...props({ agencyName: 'Target Agency', currentMembershipId: null, ownAgencies: [], supportAgency: { name: 'Target Agency', backHref: '/platform/agencies/x' } })} />);
    expect(trigger().textContent).toContain('Target Agency');
    open();
    expect(screen.queryByRole('option', { name: 'Switch to Platform view' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Add client' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Pin / })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Recent' })).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'All clients' })).getByText('Acme Heating'));
    expect(push).toHaveBeenCalledWith(`/c/${C1}`);
    expect(localStorage.length).toBe(0);
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Back to platform' }));
    expect(push).toHaveBeenLastCalledWith('/platform/agencies/x');
  });

  it('hidden for a client role with one membership: the client name is static text', () => {
    pathname = `/c/${C1}`;
    render(<ContextSwitcher {...props({ flags: clientOwner, clients: [{ id: C1, name: 'Acme Heating', sub: null, setup: false }], ownAgencies: [], accounts: [{ membershipId: M, name: 'Acme Heating', sub: 'Acme Agency' }] })} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Acme Heating')).toBeTruthy();
  });

  it('client role with more than one membership: the list shows their memberships; another one switches membership', () => {
    pathname = `/c/${C1}`;
    const accounts = [{ membershipId: M, name: 'Acme Heating', sub: 'Acme Agency' }, { membershipId: 'mem-2', name: 'Other Dental', sub: 'Other Agency' }];
    render(<ContextSwitcher {...props({ flags: clientOwner, clients: [{ id: C1, name: 'Acme Heating', sub: null, setup: false }], ownAgencies: [], accounts })} />);
    open();
    expect(screen.queryByRole('group', { name: 'All clients' })).toBeNull();
    expect(optionTexts('Your accounts')).toEqual(['Acme Heating', 'Other Dental']);
    fireEvent.click(within(screen.getByRole('group', { name: 'Your accounts' })).getByText('Other Dental'));
    expect(switchMembership.mock.calls[0]![0].get('membershipId')).toBe('mem-2');
  });
});

describe('ContextName (top bar, below lg)', () => {
  it('names the current context from the live path', () => {
    pathname = `/c/${C2}`;
    const { unmount } = render(<ContextName {...props()} />);
    expect(screen.getByText('Bright Smiles Dental')).toBeTruthy();
    unmount();
    pathname = '/agency/approvals';
    render(<ContextName {...props()} />);
    expect(screen.getByText('Acme Agency')).toBeTruthy();
  });
});
