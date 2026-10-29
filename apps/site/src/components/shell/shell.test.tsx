import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const social = vi.hoisted(() => ({ linkedin: null, x: null, youtube: null, facebook: null, instagram: null }) as Record<string, string | null>);
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test', social } }));

const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

const openSpy = vi.fn();
vi.mock('../join/join-provider', async (orig) => {
  const real = await orig<typeof import('../join/join-provider')>();
  return { ...real, useJoin: () => ({ ...real.useJoin(), open: openSpy }) };
});

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
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('site shell', () => {
  it('nav shows only registered pages', async () => {
    await renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.textContent).toContain('Pricing');
    for (const missing of ['Integrations', 'Compare', 'Partners']) expect(nav.textContent).not.toContain(missing);
    // footer lists only registered pages: none of Product/Legal exist yet in 17b
    expect(screen.queryByRole('link', { name: 'Privacy' })).toBeNull();
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
