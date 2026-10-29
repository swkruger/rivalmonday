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

const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

const openSpy = vi.fn();
vi.mock('../join/join-provider', async (orig) => {
  const real = await orig<typeof import('../join/join-provider')>();
  return { ...real, useJoin: () => ({ ...real.useJoin(), open: openSpy }) };
});

import { PAGES } from '../../../content/pages';
const realPages = [...PAGES];
import { JoinProvider } from '../join/join-provider';
import { PilotProvider } from './pilot-context';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { AnnouncementBar } from './announcement-bar';

function Shell() {
  return (
    <PilotProvider>
      <JoinProvider>
        <AnnouncementBar />
        <SiteHeader />
        <SiteFooter />
      </JoinProvider>
    </PilotProvider>
  );
}

async function renderShell() {
  render(<Shell />);
  await act(async () => {});
}

function mockMatchMedia(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
}

beforeEach(() => {
  fetchSiteStatus.mockResolvedValue(null);
  mockMatchMedia(false);
  for (const k of Object.keys(social)) social[k] = null;
  openSpy.mockClear();
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
    expect(within(footer).queryByRole('button', { name: 'Join the pilot' })).toBeNull();
    expect(footer.querySelector('h2')).toBeNull();
    expect(footer.textContent).not.toContain('Places are limited');
  });

  it('join from the mobile menu closes the sheet', async () => {
    await renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(mobile).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join the pilot' }));
    expect(openSpy).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('nav follows the spec order', async () => {
    await renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['How it works', 'Integrations', 'Compare', 'Pricing', 'Partners']);
    expect(within(nav).queryByText('Sample brief')).toBeNull();
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Sample brief' })).toBeTruthy();
  });

  it('footer compare column lists only enabled rivals', async () => {
    await renderShell();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Compare overview' }).getAttribute('href')).toBe('/compare');
    expect(within(footer).queryByRole('link', { name: 'Birdeye' })).toBeNull();
    cleanup();
    pages.list = [...realPages, { path: '/compare/birdeye', title: 'Rival Monday vs Birdeye', crumb: 'Birdeye', group: 'compare' } as never];
    await renderShell();
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Birdeye' }).getAttribute('href')).toBe('/compare/birdeye');
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
    expect(screen.queryByText('Join the pilot →')).toBeNull();
  });

  it('degraded answer keeps pilot state', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: null });
    await renderShell();
    expect(screen.queryByRole('link', { name: 'Start your free trial' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Join the pilot' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Join the pilot →')).toBeTruthy();
  });

  it('business waitlist link calls open(business) with pilot off', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: { rivalSitesWatched: 1, snapshotsThisWeek: 1, claimsChecked: 1, claimsDropped: 0 } });
    await renderShell();
    screen.getByRole('button', { name: /Join the waitlist/ }).click();
    expect(openSpy).toHaveBeenCalledWith('business');
  });

  it('rotation is static under reduced motion', async () => {
    mockMatchMedia(true);
    vi.useFakeTimers();
    await renderShell();
    const first = screen.getByTestId('announcement-example').textContent;
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('announcement-example').textContent).toBe(first);
  });

  it('rotates every 3 s without reduced motion', async () => {
    vi.useFakeTimers();
    await renderShell();
    const first = screen.getByTestId('announcement-example').textContent;
    await act(async () => {
      vi.advanceTimersByTime(3_100);
    });
    expect(screen.getByTestId('announcement-example').textContent).not.toBe(first);
  });
});
