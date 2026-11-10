import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, comparePages: [] as string[], turnstileSiteKey: null as string | null } }));
vi.mock('../../lib/env', () => env);
const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

import { CLOSE, CLOSE_TRIAL, COUNTER_LABELS, HERO, HOME_ANCHORS, PRICING_LINES, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { HOW_FAQ, JUMP_LINKS } from '../../../content/how-it-works-page';
import { PRICING } from '../../../content/pricing';
import { SOURCES } from '../../../content/sources';
import HowItWorksPage from '../../app/how-it-works/page';
import HomePage from '../../app/page';
import { JoinProvider } from '../join/join-provider';
import { PilotProvider } from '../shell/pilot-context';
import { ChecksHub } from './checks-hub';
import { FounderNote } from './founder-note';
import { LiveCounters } from './live-counters';
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

describe('HowItWorksPage', () => {
  it('has the home page sections, every question in the markup and JSON-LD, and no duplicate ids', async () => {
    const { container } = await renderApp(<HowItWorksPage />, null);
    for (const id of ['how-it-works', 'who-does-what', 'client-view', 'sample', 'recommendations', 'checks', 'faq']) expect(container.querySelector(`section#${id}`), id).toBeTruthy();
    expect(container.querySelector('#client-view-heading')!.textContent).toBe(SECTIONS['client-view'].heading);
    for (const l of JUMP_LINKS) expect(container.querySelector(l.href), l.href).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const questions = HOW_FAQ.groups.flatMap((g) => g.items.map((f) => f.q));
    expect([...container.querySelectorAll('#faq summary')].map((s) => s.firstChild!.textContent)).toEqual(questions);
    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!) as { '@type': string; mainEntity?: { name: string }[] });
    expect(ld.find((x) => x['@type'] === 'FAQPage')!.mainEntity!.map((q) => q.name)).toEqual(questions);
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  }, 20_000);

  it('shows three guides as articles, each linking to its guide with an image', async () => {
    const { container } = await renderApp(<HowItWorksPage />, null);
    const articles = [...container.querySelectorAll('section#guides article')];
    expect(articles).toHaveLength(3);
    for (const a of articles) {
      expect(a.querySelector('a')!.getAttribute('href')).toMatch(/^\/guides\//);
      expect(a.querySelector('img')!.getAttribute('alt')).toBeTruthy();
    }
  }, 20_000);

  it('the client view tabs switch on this page too', async () => {
    await renderApp(<HowItWorksPage />, null);
    const tablist = screen.getByRole('tablist', { name: 'Client view' });
    const [, brief] = within(tablist).getAllByRole('tab');
    fireEvent.mouseDown(brief!);
    fireEvent.click(brief!);
    expect(brief!.getAttribute('data-state')).toBe('active');
  }, 20_000);
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

describe('ChecksHub and Steps', () => {
  it('checks hub has an accessible name', async () => {
    const { container } = await renderApp(<ChecksHub />, null);
    const svg = container.querySelector('svg[role="group"]')!;
    const name = svg.getAttribute('aria-label')!;
    for (const t of ['Competitor websites', 'Google reviews', 'Google Business Profile', 'Meta Ad Library', 'Google Ads Transparency Center', 'Local map rankings', 'Monday brief', 'No evidence, no claim']) {
      expect(name).toContain(t);
    }
  });

  it('the checks diagram shows every step in static markup', () => {
    const html = renderToStaticMarkup(<App><ChecksHub /></App>);
    for (const t of ['Competitor websites', 'Google reviews', 'Google Business Profile', 'Local map rankings', 'Monday brief', 'No evidence, no claim']) expect(html).toContain(t);
    expect(html).not.toContain('opacity-0');
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
  }, 20_000);

  it('the home page opens the client view with its own heading', async () => {
    const { container } = await renderApp(<HomePage />, { pilotMode: true, counters: ALL });
    expect(container.querySelector('#client-view-heading')!.textContent).toBe(SECTIONS['client-view'].homeHeading);
    expect(SECTIONS['client-view'].homeHeading).not.toBe(SECTIONS['client-view'].heading);
  }, 20_000);

  it('pilot off: trial wording everywhere, no pilot wording', async () => {
    const { container } = await renderApp(<HomePage />, { pilotMode: false, counters: ALL });
    const text = container.textContent!;
    expect(text).toContain(CLOSE_TRIAL.heading);
    expect(text).toContain(HERO.finePrintTrial);
    expect(text).toContain(PRICING_LINES_TRIAL.agency);
    expect(text).not.toContain(PRICING_LINES.agency);
    expect(text.match(/pilot/gi) ?? []).toEqual([]);
  }, 20_000);

  it('pilot on: pilot wording and the pilot plan line', async () => {
    const { container } = await renderApp(<HomePage />, { pilotMode: true, counters: ALL });
    const text = container.textContent!;
    expect(text).toContain(CLOSE.heading);
    expect(text).toContain(PRICING_LINES.agency);
    expect(text).toContain(HERO.finePrint);
  }, 20_000);

  it('never shows the local-business price', async () => {
    for (const pilotMode of [true, false]) {
      const { container } = await renderApp(<HomePage />, { pilotMode, counters: ALL });
      expect(container.textContent).not.toContain(`$${PRICING.business.monthlyUsd}/mo`);
      expect(container.textContent).not.toContain('$249');
      cleanup();
    }
  }, 20_000);

  it('has one h1 and no duplicate ids', async () => {
    const { container } = await renderApp(<HomePage />, { pilotMode: true, counters: ALL });
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const all = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
  }, 20_000);
});
