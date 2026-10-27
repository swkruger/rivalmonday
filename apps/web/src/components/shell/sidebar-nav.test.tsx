// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type NavContext, type NavCounts, type NavRoleFlags, settingsNavFor } from './nav-items';

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
function Nav({ flags, counts = {}, zone, fallback = null, clients = [{ id: CLIENT_ID, name: 'A1 HVAC' }], backNames }: { flags: NavRoleFlags; counts?: NavCounts; zone?: 'platform'; fallback?: Fallback; clients?: { id: string; name: string }[]; backNames?: { agency: string; clients: { id: string; name: string }[] } }) {
  return <SidebarNav flags={flags} counts={counts} zone={zone} fallback={fallback} clients={clients} backNames={backNames} />;
}

const clearCookie = () => { document.cookie = 'rm_nav_ctx=; path=/; max-age=0'; };
const navCookie = () => document.cookie.split('; ').find((c) => c.startsWith('rm_nav_ctx='))?.slice('rm_nav_ctx='.length) ?? null;

function activeHrefOf(): string | null {
  const active = screen.queryAllByRole('link').find((link) => link.getAttribute('aria-current') === 'page');
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

  it('highlights Delivery in the drill-in on /c/<uuid>/settings/delivery, not Overview', () => {
    pathname = `${B}/settings/delivery`;
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe(`${B}/settings/delivery`);
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

  it('highlights Approvals on /agency/approvals/<uuid>', () => {
    pathname = `/agency/approvals/${CLIENT_ID}`;
    render(<Nav flags={agencyAdmin} />);
    expect(activeHrefOf()).toBe('/agency/approvals');
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
    expect(linkNames(screen.getByRole('group', { name: 'Quality' }))).toEqual(['Model reviews', 'Topic proposals', 'Ask reviews']);
    expect(activeHrefOf()).toBe('/platform/agencies');
  });

  it('marks exactly one link as the current page (staff on /c/<id>/settings/delivery, in the drill-in)', () => {
    pathname = `${B}/settings/delivery`;
    render(<Nav flags={agencyAdmin} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.getAttribute('href'))).toEqual([`${B}/settings/delivery`]);
    expect(nav.contains(current[0]!)).toBe(true);
  });
});

describe('SidebarNav badges', () => {
  it('shows the New-leads count on Leads (from counts) and nothing when there are none', () => {
    pathname = '/agency';
    const { unmount } = render(<Nav flags={{ ...agencyAdmin, leads: true }} counts={{ leads: 3 }} />);
    const leads = screen.getByRole('link', { name: /Leads/ });
    expect(leads.textContent).toBe('Leads3');
    const count = leads.querySelector('[data-slot="nav-count"]')!;
    expect(count.getAttribute('aria-label')).toBe('3 new');
    expect(screen.getByLabelText('3 new')).toBe(count);
    expect(count.className).not.toContain('bg-amber');
    expect(leads.getAttribute('data-slot')).toBe('nav-item');
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
    expect(linkNames()).toEqual(['Overview', 'Agencies', 'Lead pool', 'Billing & plans', 'Model reviews', 'Topic proposals', 'Ask reviews', 'Knowledge', 'Business types', 'Runbook']);
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Customers', 'Revenue', 'Quality', 'Content']);
    const label = screen.getByText('Customers');
    const group = screen.getByRole('group', { name: 'Customers' });
    expect(label.closest('a')).toBeNull();
    expect(group.firstElementChild).toBe(label);
    expect(label.className).not.toContain('uppercase');
    expect(activeHrefOf()).toBe('/platform/agencies');
  });

  it('shows platform badge counts from the counts prop', () => {
    pathname = '/platform';
    render(<Nav flags={operator} zone="platform" counts={{ modelReviews: 4 }} />);
    expect(screen.getByRole('link', { name: /Model reviews/ }).textContent).toBe('Model reviews4');
    expect(screen.getByRole('link', { name: 'Topic proposals' }).textContent).toBe('Topic proposals');
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

describe('SidebarNav drill-in settings nav (16b P3/P4)', () => {
  const backNames = { agency: 'Acme Agency', clients: [{ id: CLIENT_ID, name: 'A1 HVAC' }] };
  const currentLinks = () => screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
  const tabNames = (nav: HTMLElement) => within(nav).getAllByRole('link').filter((l) => !l.textContent!.startsWith('Back to')).map((l) => l.textContent);

  it('agency settings: the Settings nav with Team current and a back link to the portfolio, no main menu', () => {
    pathname = '/agency/settings/team';
    render(<Nav flags={agencyAdmin} backNames={backNames} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByRole('link', { name: 'Team' }).getAttribute('aria-current')).toBe('page');
    const back = within(nav).getByRole('link', { name: 'Back to Acme Agency' });
    expect(back.getAttribute('href')).toBe('/agency');
    expect(within(nav).getAllByRole('link')[0]).toBe(back);
    expect(screen.queryByRole('link', { name: 'Portfolio' })).toBeNull();
    expect(tabNames(nav)).toEqual(settingsNavFor('agency', agencyAdmin).flatMap((s) => s.items.map((i) => i.label)));
    expect(within(nav).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Agency', 'Plan', 'Growth', 'Integrations', 'Security']);
    expect(within(nav).getByRole('link', { name: 'Team' }).getAttribute('data-slot')).toBe('nav-item');
    expect(currentLinks()).toHaveLength(1);
  });

  it('client settings (staff): the client tabs and a back link to the client overview', () => {
    pathname = `${B}/settings/profile`;
    render(<Nav flags={agencyAdmin} backNames={backNames} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(tabNames(nav)).toEqual(settingsNavFor('client', agencyAdmin, CLIENT_ID).flatMap((s) => s.items.map((i) => i.label)));
    expect(within(nav).getByRole('link', { name: 'Back to A1 HVAC' }).getAttribute('href')).toBe(B);
    expect(within(nav).queryAllByRole('group')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Competitors' })).toBeNull();
    expect(currentLinks().map((l) => l.getAttribute('href'))).toEqual([`${B}/settings/profile`]);
  });

  it('client owner with billing on: Billing current on …/settings/billing', () => {
    pathname = `${B}/settings/billing`;
    render(<Nav flags={{ ...clientOwnerWithDashboard, clientBilling: true }} backNames={backNames} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByRole('link', { name: 'Billing' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Back to A1 HVAC' }).getAttribute('href')).toBe(B);
    expect(currentLinks()).toHaveLength(1);
  });

  it('guest: the normal menu, no Settings nav', () => {
    pathname = `${B}/settings/profile`;
    render(<Nav flags={{ ...clientOwnerWithDashboard, isUser: false }} backNames={backNames} />);
    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Back to/ })).toBeNull();
  });

  it('support session: the drill-in, back to the supported agency', () => {
    pathname = '/agency/settings/usage';
    render(<Nav flags={{ ...agencyAdmin, isUser: false }} backNames={{ agency: 'Supported Co', clients: [] }} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByRole('link', { name: 'Back to Supported Co' }).getAttribute('href')).toBe('/agency');
    expect(within(nav).queryByRole('link', { name: 'Billing' })).toBeNull();
    expect(currentLinks().map((l) => l.getAttribute('href'))).toEqual(['/agency/settings/usage']);
  });

  it('falls back to "Back to Overview" / "Back to Portfolio" when the name is unknown', () => {
    pathname = `${B}/settings/profile`;
    const { unmount } = render(<Nav flags={agencyAdmin} backNames={{ agency: 'Acme Agency', clients: [] }} />);
    expect(screen.getByRole('link', { name: 'Back to Overview' }).getAttribute('href')).toBe(B);
    expect(currentLinks()).toHaveLength(1);
    unmount();
    pathname = '/agency/settings';
    render(<Nav flags={agencyAdmin} />);
    expect(screen.getByRole('link', { name: 'Back to Portfolio' }).getAttribute('href')).toBe('/agency');
    expect(currentLinks().map((l) => l.getAttribute('href'))).toEqual(['/agency/settings/branding']);
  });

  it('still writes the context cookie on a settings route', () => {
    pathname = `${B}/settings/profile`;
    render(<Nav flags={agencyAdmin} backNames={backNames} />);
    expect(navCookie()).toBe(`client:${CLIENT_ID}`);
  });
});
