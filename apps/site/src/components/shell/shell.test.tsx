import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const social = vi.hoisted(() => ({ linkedin: null, x: null, youtube: null, facebook: null, instagram: null }) as Record<string, string | null>);
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test', social, comparePages: [] } }));

const pages = vi.hoisted(() => ({ list: [] as { path: string; nav?: { label: string; order: number } }[] }));
vi.mock('../../../content/pages', async (orig) => {
  const real = await orig<typeof import('../../../content/pages')>();
  pages.list = [...real.PAGES];
  return { ...real, get PAGES() { return pages.list; } };
});

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

const openSpy = vi.fn();
vi.mock('../join/join-provider', async (orig) => {
  const real = await orig<typeof import('../join/join-provider')>();
  return { ...real, useJoin: () => ({ ...real.useJoin(), open: openSpy }) };
});

import { BUSINESS } from '../../../content/business';
import { CHOOSER, SWITCH } from '../../../content/chooser';
const CHOOSER_SWITCH_LABEL = SWITCH.label;
import { ANNOUNCEMENT, HERO } from '../../../content/home';
import { PAGES } from '../../../content/pages';
const realPages = [...PAGES];
import { JoinProvider } from '../join/join-provider';
import { PilotProvider } from './pilot-context';
import { SideProvider, useSide } from './side-context';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { AnnouncementBar } from './announcement-bar';
import { footerColumns, navMenus, sidePaths } from './nav-items';

function Shell() {
  return (
    <SideProvider paths={sidePaths()}>
      <PilotProvider>
        <JoinProvider>
          <AnnouncementBar />
          <SiteHeader menus={navMenus()} />
          <SiteFooter columns={footerColumns()} />
        </JoinProvider>
      </PilotProvider>
    </SideProvider>
  );
}

async function renderShell(pathname = '/agencies') {
  nav.pathname = pathname;
  render(<Shell />);
  await act(async () => {});
}

const links = (root: HTMLElement) => within(root).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')]);
const header = () => screen.getByRole('banner');
const bar = () => document.querySelector<HTMLElement>('[data-slot="announcement-bar"]')!;

function mockMatchMedia(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
}

beforeEach(() => {
  fetchSiteStatus.mockResolvedValue(null);
  mockMatchMedia(false);
  for (const k of Object.keys(social)) social[k] = null;
  openSpy.mockClear();
  nav.pathname = '/';
  pages.list = [...realPages];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('site shell', () => {
  it('footer link appears when its path is registered', async () => {
    pages.list = [...pages.list, { path: '/privacy' }];
    await renderShell();
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
  });

  it('footer has no closing CTA of its own (pages render CtaBand)', async () => {
    await renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).queryByRole('button', { name: /^Join the (free )?pilot$/ })).toBeNull();
    expect(footer.querySelector('h2')).toBeNull();
    expect(footer.textContent).not.toContain('Places are limited');
  });

  it('join from the mobile menu closes the sheet', async () => {
    await renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(mobile).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join the free pilot' }));
    expect(openSpy).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the menu sheet has a Close button that closes it', async () => {
    await renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click on the switch inside the sheet closes it', async () => {
    await renderShell('/agencies');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = screen.getByRole('dialog');
    const current = within(within(dialog).getByRole('navigation', { name: CHOOSER_SWITCH_LABEL })).getByRole('link', { current: 'page' });
    fireEvent.click(current);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('phone menu lists the same items as the header on each side, switch first', async () => {
    for (const pathname of ['/agencies', '/business']) {
      await renderShell(pathname);
      const main = links(within(header()).getByRole('navigation', { name: 'Main' }));
      expect(main.length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
      const dialog = screen.getByRole('dialog');
      const navs = within(dialog).getAllByRole('navigation');
      expect(navs[0]!.getAttribute('aria-label')).toBe('Audience');
      expect(links(within(dialog).getByRole('navigation', { name: 'Mobile' }))).toEqual(main);
      cleanup();
    }
  });

  it('a mobile menu link closes the sheet on navigate', async () => {
    await renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const link = within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', { name: 'Pricing' });
    fireEvent.click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('header on /: wordmark and Sign in only', async () => {
    await renderShell('/');
    const h = header();
    expect(within(h).getByRole('link', { name: 'Rival Monday home' })).toBeTruthy();
    expect(within(h).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('https://app.test/sign-in');
    expect(within(h).queryByRole('navigation', { name: 'Audience' })).toBeNull();
    expect(within(h).queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(within(h).queryByRole('button')).toBeNull();
  });

  it('header on /agencies: switch with For agencies current, five menu items, join button', async () => {
    await renderShell('/agencies');
    const h = header();
    const sw = within(h).getByRole('navigation', { name: 'Audience' });
    expect(within(sw).getByRole('link', { name: 'For agencies' }).getAttribute('aria-current')).toBe('page');
    expect(within(sw).getByRole('link', { name: 'For local businesses' }).getAttribute('aria-current')).toBeNull();
    expect(within(within(h).getByRole('navigation', { name: 'Main' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['How it works', 'Sample brief', 'Pricing', 'Partners', 'Roadmap']);
    expect(within(h).getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(within(h).getByRole('button', { name: 'Join the free pilot' })).toBeTruthy();
  });

  it('header on /business: business menu and Join the waitlist', async () => {
    await renderShell('/business');
    const h = header();
    const sw = within(h).getByRole('navigation', { name: 'Audience' });
    expect(within(sw).getByRole('link', { name: 'For local businesses' }).getAttribute('aria-current')).toBe('page');
    expect(within(sw).getByRole('link', { name: 'For agencies' }).getAttribute('aria-current')).toBeNull();
    expect(links(within(h).getByRole('navigation', { name: 'Main' }))).toEqual([
      ['What you get', '/business#client-view'],
      ['Sample brief', '/business#sample'],
      ['Pricing', '/business/pricing'],
    ]);
    fireEvent.click(within(h).getByRole('button', { name: BUSINESS.hero.primaryCta }));
    expect(openSpy).toHaveBeenCalledWith('business');
    expect(within(h).queryByRole('button', { name: 'Join the free pilot' })).toBeNull();
  });

  it('header on /sample-brief: switch with neither current, no menu', async () => {
    await renderShell('/sample-brief');
    const h = header();
    const sw = within(h).getByRole('navigation', { name: 'Audience' });
    expect(links(sw)).toEqual([
      ['For agencies', '/agencies'],
      ['For local businesses', '/business'],
    ]);
    for (const a of within(sw).getAllByRole('link')) expect(a.getAttribute('aria-current')).toBeNull();
    expect(within(h).queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(within(h).queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(within(h).getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });

  it('the switch keeps pricing on pricing', async () => {
    for (const pathname of ['/agencies/pricing', '/business/pricing']) {
      await renderShell(pathname);
      const sw = within(header()).getByRole('navigation', { name: 'Audience' });
      expect(links(sw)).toEqual([
        ['For agencies', '/agencies/pricing'],
        ['For local businesses', '/business/pricing'],
      ]);
      cleanup();
    }
  });

  it('changing the pathname re-renders the header for the new side and closes the open sheet', async () => {
    nav.pathname = '/agencies';
    const { rerender } = render(<Shell />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    nav.pathname = '/business';
    rerender(<Shell />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(within(header()).getByRole('navigation', { name: 'Main' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['What you get', 'Sample brief', 'Pricing']);
    // Coming back to the first address must not reopen the sheet.
    nav.pathname = '/agencies';
    rerender(<Shell />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('footer compare column lists only enabled rivals', async () => {
    await renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Compare overview' }).getAttribute('href')).toBe('/compare');
    expect(within(footer).queryByRole('link', { name: 'Birdeye' })).toBeNull();
    cleanup();
    pages.list = [...realPages, { path: '/compare/birdeye', title: 'Rival Monday vs Birdeye', crumb: 'Birdeye', group: 'compare', side: 'agency' } as never];
    await renderShell();
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Birdeye' }).getAttribute('href')).toBe('/compare/birdeye');
  });

  it('footer on /business has no agency-only link and one Pricing link to /business/pricing', async () => {
    await renderShell('/business');
    const footer = screen.getByRole('contentinfo');
    for (const name of ['How it works', 'Roadmap', 'Partners', 'Integrations', 'Compare overview']) expect(within(footer).queryByRole('link', { name }), name).toBeNull();
    expect(within(footer).queryByRole('heading', { name: 'Compare' })).toBeNull();
    const pricing = within(footer).getAllByRole('link', { name: /Pricing/ });
    expect(pricing.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Pricing', '/business/pricing']]);
    expect(within(footer).getByRole('link', { name: 'Sample brief' })).toBeTruthy();
    cleanup();
    await renderShell('/agencies');
    const agency = within(screen.getByRole('contentinfo')).getAllByRole('link', { name: /Pricing/ });
    expect(agency.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Pricing', '/agencies/pricing']]);
  });

  it('footer on / shows both pricing links with their long labels', async () => {
    for (const pathname of ['/', '/sample-brief']) {
      await renderShell(pathname);
      const pricing = within(screen.getByRole('contentinfo')).getAllByRole('link', { name: /Pricing/ });
      expect(pricing.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
        ['Pricing for agencies', '/agencies/pricing'],
        ['Pricing for local businesses', '/business/pricing'],
      ]);
      cleanup();
    }
  });

  it('footer tagline follows the side', async () => {
    const tagline = (eyebrow: string) => within(screen.getByRole('contentinfo')).getByText(eyebrow);
    await renderShell('/agencies');
    expect(tagline(HERO.eyebrow)).toBeTruthy();
    cleanup();
    await renderShell('/business');
    expect(tagline(BUSINESS.hero.eyebrow)).toBeTruthy();
    cleanup();
    for (const pathname of ['/', '/sample-brief']) {
      await renderShell(pathname);
      expect(tagline(CHOOSER.eyebrow)).toBeTruthy();
      cleanup();
    }
  });

  it('social link renders only when its env is set', async () => {
    social.linkedin = 'https://www.linkedin.com/company/rm';
    await renderShell();
    const link = screen.getByRole('link', { name: 'Rival Monday on LinkedIn' });
    expect(link.getAttribute('rel')).toBe('me noopener');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.queryByRole('link', { name: 'Rival Monday on X' })).toBeNull();
  });

  it('pilot off swaps the CTA to sign-up and hides the bar', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: { rivalSitesWatched: 1, snapshotsThisWeek: 1, claimsChecked: 1, claimsDropped: 0 } });
    await renderShell();
    const cta = screen.getAllByRole('link', { name: 'Start your free trial' });
    expect(cta[0]?.getAttribute('href')).toBe('https://app.test/sign-up');
    expect(screen.queryByText('Join the free pilot →')).toBeNull();
  });

  it('degraded answer keeps pilot state', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: null });
    await renderShell();
    expect(screen.queryByRole('link', { name: 'Start your free trial' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Join the free pilot' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Join the free pilot →')).toBeTruthy();
  });

  it('business waitlist link calls open(business) with pilot off', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: { rivalSitesWatched: 1, snapshotsThisWeek: 1, claimsChecked: 1, claimsDropped: 0 } });
    await renderShell();
    screen.getByRole('button', { name: /Join the waitlist/ }).click();
    expect(openSpy).toHaveBeenCalledWith('business');
  });

  it('announcement per side; both-reader pages use the home line; pilot off hides it', async () => {
    await renderShell('/agencies');
    expect(bar().textContent).toContain(ANNOUNCEMENT.agency.text);
    expect(bar().textContent).toContain('The free pilot is open to agencies with local-business clients.');
    expect(bar().querySelector('[data-testid="announcement-example"]')).toBeNull();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Join the free pilot →' }));
    expect(openSpy).toHaveBeenLastCalledWith('agency');
    cleanup();
    await renderShell('/business');
    expect(bar().textContent).toContain(ANNOUNCEMENT.business.text);
    fireEvent.click(within(bar()).getByRole('button', { name: ANNOUNCEMENT.business.link!.label }));
    expect(openSpy).toHaveBeenLastCalledWith('business');
    cleanup();
    for (const pathname of ['/', '/sample-brief']) {
      await renderShell(pathname);
      expect(bar().textContent).toBe(ANNOUNCEMENT.home.text);
      expect(within(bar()).queryByRole('button')).toBeNull();
      cleanup();
    }
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: { rivalSitesWatched: 1, snapshotsThisWeek: 1, claimsChecked: 1, claimsDropped: 0 } });
    await renderShell('/business');
    expect(document.querySelector('[data-slot="announcement-bar"]')).toBeNull();
  });

  it('announcement does not change over time', async () => {
    vi.useFakeTimers();
    await renderShell();
    const first = bar().textContent;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(bar().textContent).toBe(first);
  });

  it('pilot off hides the bar', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: { rivalSitesWatched: 1, snapshotsThisWeek: 1, claimsChecked: 1, claimsDropped: 0 } });
    await renderShell();
    expect(document.querySelector('[data-slot="announcement-bar"]')).toBeNull();
  });

  it('useSide follows usePathname', () => {
    const paths = { agency: ['/partners'], business: ['/business/pricing'] };
    function Probe() {
      return <p data-testid="side">{useSide()}</p>;
    }
    const sideFor = (pathname: string) => {
      nav.pathname = pathname;
      const { unmount } = render(
        <SideProvider paths={paths}>
          <Probe />
        </SideProvider>,
      );
      const text = screen.getByTestId('side').textContent;
      unmount();
      return text;
    };
    expect(sideFor('/')).toBe('home');
    expect(sideFor('/partners')).toBe('agency');
    expect(sideFor('/business/pricing/')).toBe('business');
    expect(sideFor('/agencies/nope')).toBe('both');
    expect(sideFor('/partners/x')).toBe('both');
    nav.pathname = '/';
  });

  it('useSide outside a provider throws', () => {
    function Probe() {
      return <p>{useSide()}</p>;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useSide must be used inside SideProvider');
    spy.mockRestore();
  });
});
