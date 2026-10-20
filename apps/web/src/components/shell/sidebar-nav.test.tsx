// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavContext, NavCounts, NavRoleFlags } from './nav-items';

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

type Fallback = { context: NavContext; clientId: string | null } | null;
/** The required props with defaults: no counts, no zone, no server fallback; the viewer's clients hold CLIENT_ID. */
function Nav({ flags, counts = {}, zone, fallback = null, clients = [{ id: CLIENT_ID, name: 'A1 HVAC' }] }: { flags: NavRoleFlags; counts?: NavCounts; zone?: 'platform'; fallback?: Fallback; clients?: { id: string; name: string }[] }) {
  return <SidebarNav flags={flags} counts={counts} zone={zone} fallback={fallback} clients={clients} />;
}

const clearCookie = () => { document.cookie = 'rm_nav_ctx=; path=/; max-age=0'; };
const navCookie = () => document.cookie.split('; ').find((c) => c.startsWith('rm_nav_ctx='))?.slice('rm_nav_ctx='.length) ?? null;

function activeHrefOf(): string | null {
  const active = screen.queryAllByRole('link').find((link) => link.className.includes('bg-primary-soft'));
  return active?.getAttribute('href') ?? null;
}
const linkNames = (el?: HTMLElement) => (el ? within(el).getAllByRole('link') : screen.getAllByRole('link')).map((l) => l.textContent);

beforeEach(() => {
  pathname = '/';
  clearCookie();
});

describe('SidebarNav (15a grouped menus)', () => {
  it('shows "Ask {assistantName}" with the orange pill as the first client item', () => {
    pathname = `${B}/ask`;
    render(<Nav flags={{ ...clientViewer, ask: true, assistantName: 'Max' }} />);
    const link = screen.getByRole('link', { name: 'Ask Max' });
    expect(link.getAttribute('href')).toBe(`${B}/ask`);
    expect(within(link).getByText('Max').className).toContain('bg-amber');
    expect(screen.getAllByRole('link')[0]).toBe(link);
    expect(activeHrefOf()).toBe(`${B}/ask`);
  });

  it('shows the agency menu on /agency with Portfolio highlighted and no client items', () => {
    pathname = '/agency';
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency');
    expect(linkNames()).toEqual(['Portfolio', 'Approvals', 'Alert review', 'Prospects', 'Agency settings']);
    expect(linkNames(screen.getByRole('group', { name: 'Work' }))).toEqual(['Approvals', 'Alert review']);
    expect(linkNames(screen.getByRole('group', { name: 'Growth' }))).toEqual(['Prospects']);
  });

  it('shows the client menu on /c/<uuid> for agency staff with Overview highlighted', () => {
    pathname = B;
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(B);
    expect(screen.queryByRole('link', { name: 'Portfolio' })).toBeNull();
    expect(linkNames(screen.getByRole('group', { name: 'Insights' }))).toEqual(['Competitors', 'Changes', 'Pricing', 'Ads', 'Reviews', 'Local rankings', 'Moves']);
    expect(linkNames(screen.getByRole('group', { name: 'Act' }))).toEqual(['Recommendations', 'Briefs & reports']);
    expect(screen.getByRole('link', { name: 'Client settings' }).getAttribute('href')).toBe(`${B}/settings/profile`);
  });

  it('highlights Client settings (deepest match) on /c/<uuid>/settings/delivery, not Overview', () => {
    pathname = `${B}/settings/delivery`;
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`${B}/settings/profile`);
  });

  it('highlights Briefs & reports on a brief detail page', () => {
    pathname = `${B}/briefs/abc`;
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`${B}/briefs`);
  });

  it('falls back to the agency menu on /settings/notifications with nothing highlighted', () => {
    pathname = '/settings/notifications';
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBeNull();
    expect(screen.getByRole('link', { name: 'Portfolio' })).toBeTruthy();
  });

  it('highlights Approvals on /agency/approvals/<uuid> and Agency settings on /agency/settings/team', () => {
    pathname = `/agency/approvals/${CLIENT_ID}`;
    const { unmount } = render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/approvals');
    unmount();
    pathname = '/agency/settings/team';
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/settings/branding');
  });

  it('highlights Competitors on /c/<uuid>/competitors/<other uuid>', () => {
    pathname = `${B}/competitors/22222222-2222-2222-2222-222222222222`;
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`${B}/competitors`);
  });

  it('gives a client viewer Overview and Act only, linking to their own client', () => {
    pathname = B;
    render(<Nav flags={clientViewer} />);
    expect(activeHrefOf()).toBe(B);
    expect(linkNames()).toEqual(['Overview', 'Recommendations', 'Briefs & reports']);
    expect(screen.getByRole('link', { name: 'Recommendations' }).getAttribute('href')).toBe(`${B}/recommendations`);
  });

  it('gives a client owner with the dashboard flag the Insights group and Client settings', () => {
    pathname = B;
    render(<Nav flags={clientOwnerWithDashboard} />);
    const names = linkNames();
    expect(names.indexOf('Competitors')).toBe(names.indexOf('Overview') + 1);
    expect(names.at(-1)).toBe('Client settings');
  });

  it('shows the platform menu only on /platform for operators', () => {
    pathname = '/agency';
    const { unmount } = render(<Nav flags={{ ...agencyAdmin, isPlatformOperator: true }} />);
    expect(screen.queryByRole('link', { name: 'Model reviews' })).toBeNull();
    unmount();
    pathname = '/platform/agencies';
    render(<Nav flags={{ ...agencyAdmin, isPlatformOperator: true }} />);
    expect(linkNames(screen.getByRole('group', { name: 'Quality' }))).toEqual(['Model reviews', 'Theme proposals', 'Ask reviews']);
    expect(activeHrefOf()).toBe('/platform/agencies');
  });

  it('marks exactly one link as the current page', () => {
    pathname = `${B}/settings/delivery`;
    render(<Nav flags={agencyAdmin} />);
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.getAttribute('href'))).toEqual([`${B}/settings/profile`]);
  });
});

describe('SidebarNav badges', () => {
  it('shows the New-leads count on Leads (from counts) and nothing when there are none', () => {
    pathname = '/agency';
    const { unmount } = render(<Nav flags={{ ...agencyAdmin, leads: true }} counts={{ leads: 3 }} />);
    expect(screen.getByRole('link', { name: /Leads/ }).textContent).toBe('Leads3');
    unmount();
    render(<Nav flags={{ ...agencyAdmin, leads: true }} />);
    expect(screen.getByRole('link', { name: 'Leads' }).textContent).toBe('Leads');
  });
});

describe('SidebarNav sections (Task 4)', () => {
  const operator: NavRoleFlags = { ...agencyAdmin, isPlatformOperator: true };

  it('renders the platform sections on /platform/agencies, labelled groups only', () => {
    pathname = '/platform/agencies';
    render(<Nav flags={operator} zone="platform" />);
    expect(linkNames()).toEqual(['Overview', 'Agencies', 'Lead pool', 'Billing & plans', 'Model reviews', 'Theme proposals', 'Ask reviews', 'Knowledge', 'Business types', 'Runbook']);
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Customers', 'Revenue', 'Quality', 'Content']);
    expect(screen.getByText('Customers').className).toContain('uppercase');
    expect(activeHrefOf()).toBe('/platform/agencies');
  });

  it('shows platform badge counts from the counts prop', () => {
    pathname = '/platform';
    render(<Nav flags={operator} zone="platform" counts={{ modelReviews: 4 }} />);
    expect(screen.getByRole('link', { name: /Model reviews/ }).textContent).toBe('Model reviews4');
    expect(screen.getByRole('link', { name: 'Theme proposals' }).textContent).toBe('Theme proposals');
  });

  it('Phase 14a: Business types (Content) shows the catalogue review count and nothing when there is none', () => {
    pathname = '/platform';
    const { unmount } = render(<Nav flags={operator} zone="platform" counts={{ catalog: 2 }} />);
    expect(screen.getByRole('link', { name: /Business types/ }).textContent).toBe('Business types2');
    unmount();
    render(<Nav flags={operator} zone="platform" />);
    expect(screen.getByRole('link', { name: 'Business types' }).getAttribute('href')).toBe('/platform/verticals');
  });

  it('never renders an unnamed group (null-label sections have no group role)', () => {
    pathname = B;
    render(<Nav flags={agencyAdmin} />);
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Insights', 'Act']);
  });

  it('zone="platform" wins over the path and the fallback', () => {
    pathname = '/inbox';
    render(<Nav flags={operator} zone="platform" fallback={{ context: 'client', clientId: CLIENT_ID }} />);
    expect(screen.getByRole('link', { name: 'Agencies' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/platform');
  });

  it('renders the client sections on /c/<id>/changes with Changes highlighted', () => {
    pathname = `${B}/changes`;
    render(<Nav flags={{ ...agencyAdmin, ask: true, assistantName: 'Friday' }} />);
    expect(linkNames()).toEqual(['Ask Friday', 'Overview', 'Competitors', 'Changes', 'Pricing', 'Ads', 'Reviews', 'Local rankings', 'Moves', 'Recommendations', 'Briefs & reports', 'Client settings']);
    expect(activeHrefOf()).toBe(`${B}/changes`);
  });

  it('puts Ask first and pins the foot item last, after a top border', () => {
    pathname = `${B}/changes`;
    render(<Nav flags={{ ...agencyAdmin, ask: true }} />);
    const links = screen.getAllByRole('link');
    expect(links[0]!.textContent).toBe('Ask Friday');
    const foot = links.at(-1)!;
    expect(foot.textContent).toBe('Client settings');
    expect(foot.parentElement!.className).toContain('mt-auto');
    expect(foot.parentElement!.className).toContain('border-t');
  });

  it('/inbox with a client cookie shows that client sections', () => {
    document.cookie = `rm_nav_ctx=client:${CLIENT_ID}; path=/`;
    pathname = '/inbox';
    render(<Nav flags={agencyAdmin} />);
    expect(screen.getByRole('link', { name: 'Changes' }).getAttribute('href')).toBe(`${B}/changes`);
    expect(screen.queryByRole('link', { name: 'Portfolio' })).toBeNull();
    expect(activeHrefOf()).toBeNull();
  });

  it('an agency viewer: a remembered client that is not theirs reads as agency (cookie and server fallback)', () => {
    const UNKNOWN = '33333333-3333-4333-8333-333333333333';
    document.cookie = `rm_nav_ctx=client:${UNKNOWN}; path=/`;
    pathname = '/inbox';
    const { unmount } = render(<Nav flags={agencyAdmin} />);
    expect(linkNames()).toEqual(['Portfolio', 'Approvals', 'Alert review', 'Prospects', 'Agency settings']);
    unmount();
    clearCookie();
    const again = render(<Nav flags={agencyAdmin} fallback={{ context: 'client', clientId: UNKNOWN }} />);
    expect(screen.getByRole('link', { name: 'Portfolio' })).toBeTruthy();
    again.unmount();
    // a known id still shows that client's menu
    document.cookie = `rm_nav_ctx=client:${CLIENT_ID}; path=/`;
    render(<Nav flags={agencyAdmin} clients={[{ id: UNKNOWN, name: 'Other' }, { id: CLIENT_ID, name: 'A1 HVAC' }]} />);
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe(B);
    expect(screen.queryByRole('link', { name: 'Portfolio' })).toBeNull();
  });

  it('a client role keeps its own client menu even with no clients list', () => {
    document.cookie = `rm_nav_ctx=client:${CLIENT_ID}; path=/`;
    pathname = '/inbox';
    render(<Nav flags={clientViewer} clients={[]} />);
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe(B);
  });

  it('a neutral page with no cookie uses the server fallback', () => {
    pathname = '/kb/getting-started';
    render(<Nav flags={agencyAdmin} fallback={{ context: 'client', clientId: CLIENT_ID }} />);
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe(B);
  });

  it('P1: outside the platform zone a stored platform context reads as agency', () => {
    document.cookie = 'rm_nav_ctx=platform; path=/';
    pathname = '/inbox';
    const { unmount } = render(<Nav flags={operator} />);
    expect(linkNames()).toEqual(['Portfolio', 'Approvals', 'Alert review', 'Prospects', 'Agency settings']);
    unmount();
    clearCookie();
    render(<Nav flags={operator} fallback={{ context: 'platform', clientId: null }} />);
    expect(screen.getByRole('link', { name: 'Portfolio' })).toBeTruthy();
  });

  it('a client role ignores a non-client fallback and keeps its own client menu', () => {
    document.cookie = 'rm_nav_ctx=agency; path=/';
    pathname = '/settings/notifications';
    render(<Nav flags={clientViewer} />);
    expect(linkNames()).toEqual(['Overview', 'Recommendations', 'Briefs & reports']);
  });

  it('writes rm_nav_ctx on contextual pages and leaves it alone on neutral ones', () => {
    pathname = `${B}/changes`;
    const { rerender } = render(<Nav flags={operator} />);
    expect(navCookie()).toBe(`client:${CLIENT_ID}`);
    pathname = '/agency/approvals';
    rerender(<Nav flags={operator} />);
    expect(navCookie()).toBe('agency');
    pathname = '/inbox';
    rerender(<Nav flags={operator} fallback={{ context: 'client', clientId: CLIENT_ID }} />);
    expect(navCookie()).toBe('agency');
    // the neutral page follows the context the cookie remembers (client-side navigation), not a stale server fallback
    expect(screen.getByRole('link', { name: 'Portfolio' })).toBeTruthy();
    pathname = '/platform';
    rerender(<Nav flags={operator} zone="platform" />);
    expect(navCookie()).toBe('platform');
  });

  it('sets the cookie with path=/, 30 days and SameSite=Lax', () => {
    const writes: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    const spy = vi.spyOn(document, 'cookie', 'set').mockImplementation((v: string) => { writes.push(v); desc.set!.call(document, v); });
    pathname = '/agency';
    render(<Nav flags={agencyAdmin} />);
    spy.mockRestore();
    expect(writes).toEqual(['rm_nav_ctx=agency; path=/; max-age=2592000; samesite=lax']);
  });
});
