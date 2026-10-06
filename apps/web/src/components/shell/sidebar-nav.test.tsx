// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavRoleFlags } from './nav-items';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { SidebarNav } = await import('./sidebar-nav');

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';

const agencyAdmin: NavRoleFlags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency' };
const clientViewer: NavRoleFlags = { isAgency: false, isAgencyAdmin: false, isUser: true, homePath: `/c/${CLIENT_ID}` };

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
});
