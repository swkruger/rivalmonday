// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavRoleFlags } from './nav-items';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { SidebarNav } = await import('./sidebar-nav');

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const B = `/c/${CLIENT_ID}`;

const agencyAdmin: NavRoleFlags = {
  isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency',
  dashboard: true, alertRules: true, mcp: true,
};
const clientViewer: NavRoleFlags = {
  isAgency: false, isAgencyAdmin: false, isUser: true, homePath: B,
  dashboard: false, alertRules: false, mcp: false,
};
const clientOwnerWithDashboard: NavRoleFlags = { ...clientViewer, dashboard: true };

function activeHrefOf(): string | null {
  const active = screen.queryAllByRole('link').find((link) => link.className.includes('bg-primary-soft'));
  return active?.getAttribute('href') ?? null;
}
const linkNames = (el?: HTMLElement) => (el ? within(el).getAllByRole('link') : screen.getAllByRole('link')).map((l) => l.textContent);

beforeEach(() => {
  pathname = '/';
});

describe('SidebarNav (15a grouped menus, interim rendering)', () => {
  it('shows "Ask {assistantName}" with the orange pill as the first client item', () => {
    pathname = `${B}/ask`;
    render(<SidebarNav flags={{ ...clientViewer, ask: true, assistantName: 'Max' }} />);
    const link = screen.getByRole('link', { name: 'Ask Max' });
    expect(link.getAttribute('href')).toBe(`${B}/ask`);
    expect(within(link).getByText('Max').className).toContain('bg-amber');
    expect(screen.getAllByRole('link')[0]).toBe(link);
    expect(activeHrefOf()).toBe(`${B}/ask`);
  });

  it('shows the agency menu on /agency with Portfolio highlighted and no client items', () => {
    pathname = '/agency';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency');
    expect(linkNames()).toEqual(['Portfolio', 'Approvals', 'Alert review', 'Prospects', 'Agency settings']);
    expect(linkNames(screen.getByRole('group', { name: 'Work' }))).toEqual(['Approvals', 'Alert review']);
    expect(linkNames(screen.getByRole('group', { name: 'Growth' }))).toEqual(['Prospects']);
  });

  it('shows the client menu on /c/<uuid> for agency staff with Overview highlighted', () => {
    pathname = B;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(B);
    expect(screen.queryByRole('link', { name: 'Portfolio' })).toBeNull();
    expect(linkNames(screen.getByRole('group', { name: 'Insights' }))).toEqual(['Competitors', 'Changes', 'Pricing', 'Ads', 'Reviews', 'Local rankings', 'Moves']);
    expect(linkNames(screen.getByRole('group', { name: 'Act' }))).toEqual(['Recommendations', 'Briefs & reports']);
    expect(screen.getByRole('link', { name: 'Client settings' }).getAttribute('href')).toBe(`${B}/settings`);
  });

  it('highlights Client settings (deepest match) on /c/<uuid>/settings/delivery, not Overview', () => {
    pathname = `${B}/settings/delivery`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`${B}/settings`);
  });

  it('highlights Briefs & reports on a brief detail page', () => {
    pathname = `${B}/briefs/abc`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`${B}/briefs`);
  });

  it('falls back to the agency menu on /settings/notifications with nothing highlighted', () => {
    pathname = '/settings/notifications';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBeNull();
    expect(screen.getByRole('link', { name: 'Portfolio' })).toBeTruthy();
  });

  it('highlights Approvals on /agency/approvals/<uuid> and Agency settings on /agency/settings/team', () => {
    pathname = `/agency/approvals/${CLIENT_ID}`;
    const { unmount } = render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/approvals');
    unmount();
    pathname = '/agency/settings/team';
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/settings');
  });

  it('highlights Competitors on /c/<uuid>/competitors/<other uuid>', () => {
    pathname = `${B}/competitors/22222222-2222-2222-2222-222222222222`;
    render(<SidebarNav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`${B}/competitors`);
  });

  it('gives a client viewer Overview and Act only, linking to their own client', () => {
    pathname = B;
    render(<SidebarNav flags={clientViewer} />);
    expect(activeHrefOf()).toBe(B);
    expect(linkNames()).toEqual(['Overview', 'Recommendations', 'Briefs & reports']);
    expect(screen.getByRole('link', { name: 'Recommendations' }).getAttribute('href')).toBe(`${B}/recommendations`);
  });

  it('gives a client owner with the dashboard flag the Insights group and Client settings', () => {
    pathname = B;
    render(<SidebarNav flags={clientOwnerWithDashboard} />);
    const names = linkNames();
    expect(names.indexOf('Competitors')).toBe(names.indexOf('Overview') + 1);
    expect(names.at(-1)).toBe('Client settings');
  });

  it('shows the platform menu only on /platform for operators', () => {
    pathname = '/agency';
    const { unmount } = render(<SidebarNav flags={{ ...agencyAdmin, isPlatformOperator: true }} />);
    expect(screen.queryByRole('link', { name: 'Model reviews' })).toBeNull();
    unmount();
    pathname = '/platform/agencies';
    render(<SidebarNav flags={{ ...agencyAdmin, isPlatformOperator: true }} />);
    expect(linkNames(screen.getByRole('group', { name: 'Quality' }))).toEqual(['Model reviews', 'Theme proposals', 'Ask reviews']);
    expect(activeHrefOf()).toBe('/platform/agencies');
  });

  it('marks exactly one link as the current page', () => {
    pathname = `${B}/settings/delivery`;
    render(<SidebarNav flags={agencyAdmin} />);
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.getAttribute('href'))).toEqual([`${B}/settings`]);
  });
});

describe('SidebarNav leads badge', () => {
  it('shows the New-leads count on Leads and nothing when there are none', () => {
    pathname = '/agency';
    const { unmount } = render(<SidebarNav flags={{ ...agencyAdmin, leads: true, newLeads: 3 }} />);
    expect(screen.getByRole('link', { name: /Leads/ }).textContent).toBe('Leads3');
    unmount();
    render(<SidebarNav flags={{ ...agencyAdmin, leads: true }} />);
    expect(screen.getByRole('link', { name: 'Leads' }).textContent).toBe('Leads');
  });
});
