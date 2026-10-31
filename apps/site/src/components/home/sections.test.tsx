import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, comparePages: [] as string[], turnstileSiteKey: null as string | null } }));
vi.mock('../../lib/env', () => env);
const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

import { CTA_BAND, CTA_BAND_TRIAL, COUNTER_LABELS, HERO, HOME_ANCHORS, PRICING_HEADING_TRIAL, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { PRICING } from '../../../content/pricing';
import { SOURCES } from '../../../content/sources';
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
    expect(screen.getByText('Rivals watched')).toBeTruthy();
    expect(screen.queryByText('Claims dropped for lack of evidence')).toBeNull();
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
    // Pricing and the closing call to action are one band: one button, and both anchors live in it.
    expect(screen.getAllByRole('button', { name: CTA_BAND.button })).toHaveLength(1);
    expect(container.querySelector('section')!.id).toBe('join');
    expect(container.querySelector('section #pricing')).toBeTruthy();
  });
});

describe('RealSample', () => {
  it('real sample button opens the popup with the sample ticked', async () => {
    await renderApp(<RealSample />, null);
    fireEvent.click(screen.getByRole('button', { name: 'Get a real brief for one client' }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    expect((screen.getByLabelText('Send me a real sample brief for one of my clients') as HTMLInputElement).checked).toBe(true);
  });
});

describe('ChecksHub and Steps', () => {
  it('checks hub has an accessible name', async () => {
    const { container } = await renderApp(<ChecksHub />, null);
    const svg = container.querySelector('svg[role="group"]')!;
    const name = svg.getAttribute('aria-label')!;
    for (const t of ['Competitor websites', 'Google reviews', 'Google Business Profile', 'Meta Ad Library', 'Google Ads Transparency Center', 'Local map rankings', 'Monday brief', 'No evidence, no claim']) {
      expect(name).toContain(t);
    }
  });

  it('every diagram box opens its explanation, with the source wording from the sources page', async () => {
    const { container } = await renderApp(<ChecksHub />, null);
    const svg = container.querySelector('svg[role="group"]')!;
    const boxes = [...svg.querySelectorAll('g[role="button"]')];
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Competitor websites',
      'Google reviews',
      'Google Business Profile',
      'Meta Ad Library and Google Ads Transparency Center',
      'Local map rankings',
      'Monday brief',
      'No evidence, no claim',
    ]);
    fireEvent.click(boxes[1]!);
    const reviews = SOURCES.find((s) => s.slug === 'google-reviews')!;
    const dialog = screen.getByRole('dialog', { name: reviews.name });
    expect(dialog.textContent).toContain(reviews.whatWeCollect[0]);
    expect(dialog.textContent).toContain(reviews.howOften);
    expect(within(dialog).getByRole('link').getAttribute('href')).toBe('/sources/google-reviews');
  });

  it('the boxes work from the keyboard and on the phone list', async () => {
    const { container } = await renderApp(<ChecksHub />, null);
    const brief = container.querySelector('svg g[aria-label="Monday brief"]')!;
    fireEvent.keyDown(brief, { key: 'Enter' });
    const dialog = screen.getByRole('dialog', { name: 'Monday brief' });
    expect(dialog.textContent).toContain('A separate verifier compares each claim');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close explanation' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(container.querySelector('ol button')!);
    expect(screen.getByRole('dialog', { name: 'Competitor websites' })).toBeTruthy();
  });

  it('how it works renders four steps and no empty paragraph', async () => {
    const { container } = await renderApp(<Steps />, null);
    expect(container.querySelectorAll('ol > li')).toHaveLength(4);
    expect(screen.getByText(SECTIONS['how-it-works'].body)).toBeTruthy();
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
    // The closing band's plans already say it, so only the hero carries the fine print.
    expect(screen.getAllByText(HERO.finePrintTrial)).toHaveLength(1);
    // One closing ask, not two: the pricing heading stands alone.
    expect(screen.queryByRole('heading', { name: CTA_BAND_TRIAL.heading })).toBeNull();
    expect(screen.getByRole('heading', { name: PRICING_HEADING_TRIAL })).toBeTruthy();
    expect(container.querySelector('[data-slot="pricing-agency"]')!.textContent).toBe(PRICING_LINES_TRIAL.agency);
    for (const t of [HERO.finePrintTrial, CTA_BAND_TRIAL.body, PRICING_LINES_TRIAL.agency]) {
      expect(t).toContain(`$${PRICING.agency.monthlyUsd}`);
      expect(t).toContain(`${PRICING.agency.trialDays}`);
    }
  });

  it('pilot on: the pilot copy and the real-sample section show', async () => {
    const { container } = await renderApp(<HomePage />, { pilotMode: true, counters: ALL });
    expect(screen.getAllByText(HERO.finePrint)).toHaveLength(2);
    expect(screen.getByRole('heading', { name: SECTIONS.pricing.heading })).toBeTruthy();
    expect(container.querySelector('#real-sample')).toBeTruthy();
  });
});
