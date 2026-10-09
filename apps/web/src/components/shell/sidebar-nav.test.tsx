// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavRoleFlags } from './nav-items';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { SidebarNav } = await import('./sidebar-nav');

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';

const agencyAdmin: NavRoleFlags = {
  isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency',
  dashboard: true, manageCompetitors: true, alertRules: true, mcp: true,
};
const clientViewer: NavRoleFlags = {
  isAgency: false, isAgencyAdmin: false, isUser: true, homePath: `/c/${CLIENT_ID}`,
  dashboard: false, manageCompetitors: false, alertRules: false, mcp: false,
};
const clientOwnerWithDashboard: NavRoleFlags = { ...clientViewer, dashboard: true };

function activeHrefOf(): string | null {
  const active = screen.queryAllByRole('link').find((link) => link.className.includes('bg-primary-soft'));
  return active?.getAttribute('href') ?? null;
}

beforeEach(() => {
  pathname = '/';
});

describe('SidebarNav', () => {
  it('highlights Portfolio on /agency', () => {
    pathname = '/agency';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency');
    expect(screen.getByRole('link', { name: 'Portfolio' }).getAttribute('href')).toBe('/agency');
    // No client selected yet, so the client-scoped items aren't shown at all.
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });

  it('highlights Overview and shows client-scoped items on /c/<uuid>', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`/c/${CLIENT_ID}`);
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}`);
    expect(screen.getByRole('link', { name: 'Delivery' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}/settings/delivery`);
  });

  it('highlights Delivery (deepest match) on /c/<uuid>/settings/delivery, not Overview', () => {
    pathname = `/c/${CLIENT_ID}/settings/delivery`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`/c/${CLIENT_ID}/settings/delivery`);
  });

  it('highlights Notifications on /settings/notifications, with no client-scoped items', () => {
    pathname = '/settings/notifications';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/settings/notifications');
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });

  it('shows Profile for agency users inside a client', () => {
    pathname = `/c/${CLIENT_ID}/settings/profile`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`/c/${CLIENT_ID}/settings/profile`);
  });

  it('highlights Approvals on /agency/approvals/<uuid>', () => {
    pathname = `/agency/approvals/${CLIENT_ID}`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/approvals');
  });

  it('highlights Alert review on /agency/alerts', () => {
    pathname = '/agency/alerts';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/alerts');
    expect(screen.getByRole('link', { name: 'Alert review' }).getAttribute('href')).toBe('/agency/alerts');
  });

  it('shows Usage & limits to agency users', () => {
    pathname = '/agency/usage';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/usage');
  });

  it('highlights Playbooks on /agency/playbooks', () => {
    pathname = '/agency/playbooks';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/playbooks');
  });

  it('highlights Prospects on /agency/prospects', () => {
    pathname = '/agency/prospects';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/prospects');
    expect(screen.getByRole('link', { name: 'Prospects' }).getAttribute('href')).toBe('/agency/prospects');
  });

  it('highlights Competitors (not a deeper match) on /c/<uuid>/competitors/<other uuid>', () => {
    const OTHER_ID = '22222222-2222-2222-2222-222222222222';
    pathname = `/c/${CLIENT_ID}/competitors/${OTHER_ID}`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`/c/${CLIENT_ID}/competitors`);
  });

  it('highlights a non-agency viewer’s fixed Overview on their own client path', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={clientViewer} />);
    expect(activeHrefOf()).toBe(`/c/${CLIENT_ID}`);
    // Non-agency roles never get the agency-only client-scoped Delivery item.
    expect(screen.queryByRole('link', { name: 'Delivery' })).toBeNull();
  });

  it('shows a client viewer Recommendations linking to their own client', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={clientViewer} />);
    expect(screen.getByRole('link', { name: 'Recommendations' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}/recommendations`);
  });

  it('shows a client owner with the dashboard flag Competitors between Overview and Changes', () => {
    pathname = `/c/${CLIENT_ID}`;
    const { container } = render(<SidebarNav flags={clientOwnerWithDashboard} />);
    const names = Array.from(container.querySelectorAll('a')).map((a) => a.textContent);
    expect(names.indexOf('Competitors')).toBe(names.indexOf('Overview') + 1);
    expect(names.indexOf('Changes')).toBe(names.indexOf('Competitors') + 1);
    expect(screen.getByRole('link', { name: 'Changes' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}/changes`);
  });

  it('hides Competitors from a client owner without the dashboard flag', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={clientViewer} />);
    expect(screen.queryByRole('link', { name: 'Competitors' })).toBeNull();
  });

  it('hides Changes from a client owner without the dashboard flag', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={clientViewer} />);
    expect(screen.queryByRole('link', { name: 'Changes' })).toBeNull();
  });

  it('lists the 5c-2 modules between Changes and Moves for dashboard users only', () => {
    pathname = `/c/${CLIENT_ID}`;
    const { unmount } = render(<SidebarNav flags={clientOwnerWithDashboard} />);
    const names = screen.getAllByRole('link').map((l) => l.textContent?.trim());
    expect(names.slice(names.indexOf('Changes'), names.indexOf('Moves') + 1)).toEqual(['Changes', 'Pricing', 'Ads', 'Reviews', 'Moves']);
    unmount();
    render(<SidebarNav flags={clientViewer} />);
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
  });

  it('hides Moves from a client owner without the dashboard flag', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={clientViewer} />);
    expect(screen.queryByRole('link', { name: 'Moves' })).toBeNull();
  });

  it('shows a client owner with the flags Services & area, Alert rules and AI connections', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={{ ...clientOwnerWithDashboard, alertRules: true, mcp: true }} />);
    expect(screen.getByRole('link', { name: 'Services & area' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}/settings/profile`);
    expect(screen.getByRole('link', { name: 'Alert rules' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}/settings/alerts`);
    expect(screen.getByRole('link', { name: 'AI connections' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}/settings/ai`);
  });

  it('hides the settings items from a client owner without the flags', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={clientViewer} />);
    for (const n of ['Services & area', 'Alert rules', 'AI connections']) expect(screen.queryByRole('link', { name: n })).toBeNull();
  });

  it('highlights Recommendations for an agency admin on /c/<uuid>/recommendations', () => {
    pathname = `/c/${CLIENT_ID}/recommendations`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`/c/${CLIENT_ID}/recommendations`);
    expect(screen.getByRole('link', { name: 'Recommendations' }).getAttribute('href')).toBe(`/c/${CLIENT_ID}/recommendations`);
  });
});

describe('SidebarNav sections', () => {
  const clients = [{ id: CLIENT_ID, name: 'Comfort Air Heating & Cooling' }];
  const linkNames = (group: HTMLElement) => within(group).getAllByRole('link').map((l) => l.textContent);

  it('labels the agency and account sections and invites picking a client when none is open', () => {
    pathname = '/agency';
    render(<SidebarNav flags={agencyAdmin} clients={clients} />);
    expect(linkNames(screen.getByRole('group', { name: 'Agency' }))).toEqual(['Portfolio', 'Approvals', 'Alert review', 'Prospects', 'Usage & limits', 'Playbooks']);
    expect(linkNames(screen.getByRole('group', { name: 'Account' }))).toEqual(['Inbox', 'Team', 'Branding', 'Slack & Teams', 'Notifications']);
    expect(screen.getByText('Select a client from Portfolio')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Client/ })).toBeNull();
  });

  it('groups the open client’s pages in a panel named after the client', () => {
    pathname = `/c/${CLIENT_ID}/competitors`;
    render(<SidebarNav flags={agencyAdmin} clients={clients} />);
    const panel = screen.getByRole('group', { name: 'Client: Comfort Air Heating & Cooling' });
    expect(linkNames(panel)).toEqual(['Overview', 'Competitors', 'Changes', 'Pricing', 'Ads', 'Reviews', 'Moves', 'Recommendations', 'Profile', 'Delivery', 'Alert rules', 'AI connections']);
    expect(within(panel).getByText('Comfort Air Heating & Cooling')).toBeTruthy();
    expect(within(panel).getByText('CA')).toBeTruthy();
    expect(screen.queryByText('Select a client from Portfolio')).toBeNull();
  });

  it('falls back to a plain Client label when the open client is not in the list', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={agencyAdmin} clients={[]} />);
    expect(linkNames(screen.getByRole('group', { name: 'Client' }))).toContain('Overview');
  });

  it('marks exactly one link as the current page', () => {
    pathname = `/c/${CLIENT_ID}/settings/delivery`;
    render(<SidebarNav flags={agencyAdmin} clients={clients} />);
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.getAttribute('href'))).toEqual([`/c/${CLIENT_ID}/settings/delivery`]);
  });

  it('gives client users no agency section, client panel or placeholder', () => {
    pathname = `/c/${CLIENT_ID}`;
    render(<SidebarNav flags={clientViewer} clients={[]} />);
    expect(screen.queryByRole('group', { name: 'Agency' })).toBeNull();
    expect(screen.queryByRole('group', { name: /^Client/ })).toBeNull();
    expect(screen.queryByText('Select a client from Portfolio')).toBeNull();
    expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
  });

  it('shows the platform queues only to platform operators', () => {
    pathname = '/agency';
    const { rerender } = render(<SidebarNav flags={agencyAdmin} />);
    expect(screen.queryByRole('link', { name: 'Model reviews' })).toBeNull();
    rerender(<SidebarNav flags={{ ...agencyAdmin, isPlatformOperator: true }} />);
    expect(screen.getByRole('link', { name: 'Model reviews' }).getAttribute('href')).toBe('/platform/reviews');
    expect(screen.getByRole('link', { name: 'Theme proposals' }).getAttribute('href')).toBe('/platform/themes');
  });
});
