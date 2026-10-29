import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, comparePages: [] as string[], turnstileSiteKey: null as string | null } }));
vi.mock('../../lib/env', () => env);
const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

import { CTA_BAND, CTA_BAND_TRIAL, COUNTER_LABELS, HERO, HOME_ANCHORS, PRICING_HEADING_TRIAL, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { PRICING } from '../../../content/pricing';
import HomePage from '../../app/page';
import { JoinProvider } from '../join/join-provider';
import { PilotProvider } from '../shell/pilot-context';
import { ChecksHub } from './checks-hub';
import { FounderNote } from './founder-note';
import { LiveCounters } from './live-counters';
import { PricingTeaser } from './pricing-teaser';
import { RealSample } from './real-sample';
import { Steps } from './steps';

const ALL = { rivalSitesWatched: 1200, snapshotsThisWeek: 340, claimsChecked: 90, claimsDropped: 7 };

function App({ children }: { children: React.ReactNode }) {
  return (
    <PilotProvider>
      <JoinProvider>{children}</JoinProvider>
    </PilotProvider>
  );
}

async function renderApp(ui: React.ReactNode, status: unknown) {
  fetchSiteStatus.mockResolvedValue(status);
  const out = render(<App>{ui}</App>);
  await act(async () => {});
  return out;
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('LiveCounters', () => {
  it('counters hide a null value', async () => {
    await renderApp(<LiveCounters />, { pilotMode: true, counters: { ...ALL, claimsDropped: null } });
    expect(screen.getByText('rivals watched')).toBeTruthy();
    expect(screen.queryByText('claims dropped for lack of evidence')).toBeNull();
    expect(document.querySelectorAll('[data-slot="kpi"]')).toHaveLength(3);
  });

  it('counters render nothing when counters is null or all null', async () => {
    const a = await renderApp(<LiveCounters />, { pilotMode: true, counters: null });
    expect(a.container.querySelector('section')).toBeNull();
    cleanup();
    const b = await renderApp(<LiveCounters />, { pilotMode: true, counters: { rivalSitesWatched: null, snapshotsThisWeek: null, claimsChecked: null, claimsDropped: null } });
    expect(b.container.querySelector('section')).toBeNull();
    cleanup();
    const c = await renderApp(<LiveCounters />, null);
    expect(c.container.querySelector('section')).toBeNull();
  });

  it('counters render nothing while loading', () => {
    fetchSiteStatus.mockReturnValue(new Promise(() => {}));
    const { container } = render(<App><LiveCounters /></App>);
    expect(container.querySelector('section')).toBeNull();
  });

  it('counters format 1200 as 1,200+', async () => {
    await renderApp(<LiveCounters />, { pilotMode: true, counters: ALL });
    expect(screen.getByText('1,200+')).toBeTruthy();
    expect(screen.getByText('340+')).toBeTruthy();
    expect(screen.getByText('Rounded down.')).toBeTruthy();
    expect(document.querySelector('#live p.text-ink-secondary')).toBeNull();
  });

  it('each counter shows its own caption', async () => {
    await renderApp(<LiveCounters />, { pilotMode: true, counters: ALL });
    for (const c of COUNTER_LABELS) {
      const kpi = screen.getByText(c.label).closest('[data-slot="kpi"]')!;
      expect(kpi.textContent).toContain(c.caption);
      if (c.key === 'rivalsWatched') expect(kpi.textContent).not.toContain('Last 7 days');
    }
  });
});

describe('FounderNote', () => {
  it('founder note renders nothing for null and the note for a fixture', () => {
    const none = render(<FounderNote note={null} />);
    expect(none.container.innerHTML).toBe('');
    render(<FounderNote note={{ paragraph: 'Why I built this.', name: 'Pat Example', role: 'Founder', photo: null, initials: 'PE' }} />);
    expect(screen.getByText('Why I built this.')).toBeTruthy();
    expect(screen.getByText('Pat Example')).toBeTruthy();
    expect(screen.getByText('PE')).toBeTruthy();
  });

  it('the shipped note is hidden while FOUNDER_NOTE is null', () => {
    const { container } = render(<FounderNote />);
    expect(container.innerHTML).toBe('');
  });
});

describe('PricingTeaser', () => {
  it('pricing teaser shows 229, 3 seats, 99 from PRICING', async () => {
    const { container } = await renderApp(<PricingTeaser />, null);
    const text = container.querySelector('[data-slot="pricing-agency"]')!.textContent!;
    expect(text).toContain(`$${PRICING.agency.monthlyUsd}`);
    expect(text).toContain(`${PRICING.agency.seatsIncluded} client seats`);
    expect(text).toContain(`$${PRICING.agency.extraSeatUsd}`);
    expect(container.querySelector('[data-slot="pricing-business"]')!.textContent).toContain(`$${PRICING.business.monthlyUsd}`);
    expect(screen.getByRole('button', { name: 'Join the pilot' })).toBeTruthy();
    expect(container.querySelector('section')!.id).toBe('pricing');
  });
});

describe('RealSample', () => {
  it('real sample button opens the popup with the sample ticked', async () => {
    await renderApp(<RealSample />, null);
    fireEvent.click(screen.getByRole('button', { name: 'Request a real sample' }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    expect((screen.getByLabelText('Send me a real sample brief for one of my clients') as HTMLInputElement).checked).toBe(true);
  });
});

describe('ChecksHub and Steps', () => {
  it('checks hub has an accessible name', async () => {
    const { container } = await renderApp(<ChecksHub />, null);
    const svg = container.querySelector('svg[role="img"]')!;
    const name = svg.getAttribute('aria-label')!;
    for (const t of ['Competitor websites', 'Google reviews', 'Google Business Profile', 'Meta Ad Library', 'Google Ads Transparency Center', 'Local map rankings', 'Monday brief', 'No evidence, no claim']) {
      expect(name).toContain(t);
    }
  });

  it('how it works renders four steps and no empty paragraph', async () => {
    const { container } = await renderApp(<Steps />, null);
    expect(container.querySelectorAll('ol > li')).toHaveLength(4);
    expect([...container.querySelectorAll('p')].filter((p) => !p.textContent)).toHaveLength(0);
  });
});

describe('HomePage', () => {
  const ids = (c: HTMLElement) => [...c.querySelectorAll('main > section[id]')].map((s) => s.id).filter((id) => id !== 'founder');

  it('section ids match HOME_ANCHORS', async () => {
    const { container } = await renderApp(<HomePage />, { pilotMode: true, counters: ALL });
    expect(new Set(ids(container))).toEqual(new Set(HOME_ANCHORS));
    expect(ids(container)).toEqual([...HOME_ANCHORS]);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    cleanup();
    const out = await renderApp(<HomePage />, { pilotMode: true, counters: null });
    expect(ids(out.container)).toEqual(HOME_ANCHORS.filter((a) => a !== 'live'));
  });
});

describe('pilot-aware copy', () => {
  const OFF = { pilotMode: false, counters: ALL };

  it('pilot off: no pilot wording on the home page, real sample hidden, trial copy from PRICING', async () => {
    const { container } = await renderApp(<HomePage />, OFF);
    expect(container.textContent).not.toMatch(/pilot/i);
    expect(container.querySelector('#real-sample')).toBeNull();
    expect(screen.getByText(HERO.finePrintTrial)).toBeTruthy();
    expect(screen.getByRole('heading', { name: CTA_BAND_TRIAL.heading })).toBeTruthy();
    expect(screen.getByText(CTA_BAND_TRIAL.body)).toBeTruthy();
    expect(screen.getByText(PRICING_HEADING_TRIAL)).toBeTruthy();
    expect(container.querySelector('[data-slot="pricing-agency"]')!.textContent).toBe(PRICING_LINES_TRIAL.agency);
    for (const t of [HERO.finePrintTrial, CTA_BAND_TRIAL.body, PRICING_LINES_TRIAL.agency]) {
      expect(t).toContain(`$${PRICING.agency.monthlyUsd}`);
      expect(t).toContain(`${PRICING.agency.trialDays}`);
    }
  });

  it('pilot on: the pilot copy and the real-sample section show', async () => {
    const { container } = await renderApp(<HomePage />, { pilotMode: true, counters: ALL });
    expect(screen.getByText(HERO.finePrint)).toBeTruthy();
    expect(screen.getByText(CTA_BAND.body)).toBeTruthy();
    expect(screen.getByText(SECTIONS.pricing.heading)).toBeTruthy();
    expect(container.querySelector('#real-sample')).toBeTruthy();
  });
});
