import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const web = vi.hoisted(() => ({ live: false }));
const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', async (orig) => ({ ...(await orig<typeof import('../shell/pilot-context')>()), usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
vi.mock('../../../content/website-monitoring', () => ({
  get WEBSITE_MONITORING_LIVE() {
    return web.live;
  },
}));

import { BUSINESS } from '../../../content/business';
import { CEILING_LINES, CLOSE, COMMERCIAL, HERO, HOW_STEPS_NOTE, OPPORTUNITY, opportunityCells, planCells, PRICING_LINES, PRICING_LINES_TRIAL, RECOMMENDATIONS_ROADMAP, REAL_SAMPLE_PREVIEW, RIVAL_STORY, SECTIONS } from '../../../content/home';
import { rivalStoryMoves } from '../../../content/rival-story';
import { ANY_INDUSTRY } from '../../../content/industries';
import { PRICING } from '../../../content/pricing';
import { SAMPLE } from '../../sample/schema';
import { JoinProvider } from '../join/join-provider';
import { weekStats } from '../sample/rank-map';
import { AgencyCeiling } from './agency-ceiling';
import { ChecksHub } from './checks-hub';
import { CtaBand } from './cta-band';
import { CloseBand } from './close-band';
import { Commercial } from './commercial';
import { Opportunity } from './opportunity';
import { RecommendationsSection } from './recommendations-section';
import { RivalStory } from './rival-story';
import { Steps } from './steps';

beforeEach(() => {
  web.live = false;
  pilot.pilotMode = true;
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RivalStory', () => {
  it('renders the H2, the grid slider and the website-free body', () => {
    const { container } = render(<RivalStory />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toBe(SECTIONS['rival-story'].heading);
    expect(container.querySelector('section#rival-story')!.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(screen.getByRole('slider', { name: 'Week' })).toBeTruthy();
    expect(screen.getByText(RIVAL_STORY.bodyNoWeb)).toBeTruthy();
    expect(screen.getByText(RIVAL_STORY.closing)).toBeTruthy();
  });

  it("replays the rival's own map: its title, 8 -> 31 top-3 points, the client's ring kept, no rank chips", () => {
    render(<RivalStory />);
    const title = `Quillstone Climate Pros' map rankings for “${SAMPLE.rankGrid.keyword}”`;
    expect(RIVAL_STORY.gridTitle(SAMPLE.rankGrid.keyword)).toBe(title);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByText(/Your map rankings for/)).toBeNull();
    expect(screen.getByText(new RegExp(`The ringed point is ${SAMPLE.business.name}\\.`))).toBeTruthy();
    // Opens on the last week; week 1 is one step back.
    expect(screen.getByText('Top 3 in 31 of 49 points')).toBeTruthy();
    expect(screen.getByText('up from 8 in week 1')).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: 'Week' }), { target: { value: '0' } });
    expect(screen.getByText('Top 3 in 8 of 49 points')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Evidence \d+: Map scan/ })).toBeNull();
  });

  it('lists 2 dated moves while website monitoring is off', () => {
    render(<RivalStory />);
    const items = within(screen.getByRole('list', { name: RIVAL_STORY.logHeading })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items).toHaveLength(rivalStoryMoves(false).length);
    const t = items[0]!.querySelector('time')!;
    expect(t.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('website monitoring live: the Kestrel price cut joins the log and the live body is used', () => {
    web.live = true;
    render(<RivalStory />);
    const items = within(screen.getByRole('list', { name: RIVAL_STORY.logHeading })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items).toHaveLength(rivalStoryMoves(true).length);
    expect(screen.getByText(SECTIONS['rival-story'].body)).toBeTruthy();
    expect(screen.queryByText(RIVAL_STORY.bodyNoWeb)).toBeNull();
  });

  it('opens the evidence dialog from a move and Escape returns focus', async () => {
    render(<RivalStory />);
    const move = within(screen.getByRole('list', { name: RIVAL_STORY.logHeading })).getAllByRole('button')[0]!;
    move.focus();
    fireEvent.click(move);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(move));
  });
});

describe('RivalStory business audience', () => {
  it('business audience: business heading, intro and closing; the body is unchanged', () => {
    const { container } = render(<RivalStory audience="business" />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toBe(BUSINESS.rivalStory.heading);
    expect(container.querySelector('section#rival-story')!.getAttribute('aria-labelledby')).toBe(h2.id);
    const intro = screen.getByText(BUSINESS.rivalStory.intro);
    const body = screen.getByText(RIVAL_STORY.bodyNoWeb);
    expect(intro.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(BUSINESS.rivalStory.closing)).toBeTruthy();
    expect(screen.queryByText(RIVAL_STORY.closing)).toBeNull();
    expect(screen.getByRole('slider', { name: 'Week' })).toBeTruthy();
    expect(screen.getByText(RIVAL_STORY.caption)).toBeTruthy();
    expect(screen.getByText(RIVAL_STORY.logHeading)).toBeTruthy();
  });

  it('the default audience shows no business copy', () => {
    render(<RivalStory />);
    expect(screen.queryByText(BUSINESS.rivalStory.intro)).toBeNull();
    expect(screen.getByText(RIVAL_STORY.closing)).toBeTruthy();
  });
});

describe('AgencyCeiling', () => {
  it('renders the H2, three lines and the closing line after the list', () => {
    const { container } = render(<AgencyCeiling />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SECTIONS.ceiling.heading);
    expect(container.querySelector('section#ceiling')).toBeTruthy();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(CEILING_LINES.length);
    expect(items[0]!.textContent).toContain(CEILING_LINES[0]!.lead);
    const closing = screen.getByText(SECTIONS.ceiling.body);
    expect(closing.compareDocumentPosition(screen.getByRole('list')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe('Opportunity', () => {
  it('renders the H2 and the three outcomes', () => {
    const { container } = render(<Opportunity />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SECTIONS.opportunity.heading);
    expect(container.querySelector('section#opportunity')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(OPPORTUNITY.outcomes.length);
  });

  it('shows the example as four labelled cells', () => {
    const { container } = render(<Opportunity />);
    expect(screen.getByText(OPPORTUNITY.exampleLabel)).toBeTruthy();
    const cells = opportunityCells();
    expect(cells).toHaveLength(4);
    const terms = [...container.querySelectorAll('dl dt')].map((el) => el.textContent);
    const defs = [...container.querySelectorAll('dl dd')].map((el) => el.textContent);
    expect(terms).toEqual(cells.map((c) => c.value));
    expect(defs).toEqual(cells.map((c) => c.label));
    expect(container.textContent).toContain('$2,608');
  });

  it('keeps the note and the link to /partners', () => {
    render(<Opportunity />);
    expect(screen.getByText(OPPORTUNITY.exampleNote)).toBeTruthy();
    expect(screen.getByRole('link', { name: OPPORTUNITY.link.label }).getAttribute('href')).toBe('/partners');
  });
});

describe('Commercial', () => {
  it('shows the three points, one calculator and the roadmap link', () => {
    const { container } = render(<Commercial />);
    expect(screen.getByRole('heading', { level: 2, name: SECTIONS.commercial.heading })).toBeTruthy();
    expect(container.querySelector('section#commercial')).toBeTruthy();
    for (const p of COMMERCIAL.points) {
      expect(screen.getByRole('heading', { level: 3, name: p.heading })).toBeTruthy();
      expect(screen.getByText(p.body)).toBeTruthy();
    }
    expect(container.querySelectorAll('[data-slot=margin-example]')).toHaveLength(1);
    expect(container.textContent).not.toContain(`$${PRICING.business.monthlyUsd}/mo`);
    expect(container.querySelector('input[type="range"]')).toBeTruthy();
    expect(screen.getByText(COMMERCIAL.roadmapLine.text)).toBeTruthy();
    expect(screen.getByRole('link', { name: COMMERCIAL.roadmapLine.link.label }).getAttribute('href')).toBe('/roadmap');
  });

  it('pilot on: the plan line starts with the pilot lead and holds the three cells', () => {
    const { container } = render(<Commercial />);
    const line = container.querySelector('[data-slot=plan-line]')!;
    expect(line.textContent!.startsWith(PRICING_LINES.strong)).toBe(true);
    expect(line.textContent).toContain(PRICING_LINES.lead);
    expect(line.querySelectorAll('dl dt')).toHaveLength(3);
    for (const c of planCells()) {
      expect(line.textContent).toContain(c.value);
      expect(line.textContent).toContain(c.label);
    }
  });

  it('pilot off: the trial lead and no pilot wording', () => {
    pilot.pilotMode = false;
    const { container } = render(<Commercial />);
    const line = container.querySelector('[data-slot=plan-line]')!;
    expect(line.textContent).toContain(PRICING_LINES_TRIAL.lead);
    expect(line.textContent).not.toContain('Free during the pilot');
    expect(line.textContent).not.toMatch(/pilot/i);
    expect(line.querySelectorAll('dl dt')).toHaveLength(3);
  });
});

describe('CloseBand', () => {
  it('has #join once, the close copy, one button and the fine print', () => {
    const { container } = render(<JoinProvider><CloseBand /></JoinProvider>);
    expect(container.querySelectorAll('#join')).toHaveLength(1);
    expect(container.querySelector('section#join')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(CLOSE.heading);
    expect(screen.getByText(CLOSE.body)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: CLOSE.button })).toHaveLength(1);
    expect(screen.getByText(HERO.finePrint)).toBeTruthy();
    expect(container.textContent).not.toContain(`$${PRICING.business.monthlyUsd}`);
  });

  it('the button opens the agency step with the sample ticked', () => {
    render(<JoinProvider><CloseBand /></JoinProvider>);
    fireEvent.click(screen.getByRole('button', { name: CLOSE.button }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    expect((screen.getByLabelText('Send me a real sample brief for one of my clients') as HTMLInputElement).checked).toBe(true);
  });

  it('the card sits straight', () => {
    const { container } = render(<JoinProvider><CloseBand /></JoinProvider>);
    const classes = [...container.querySelectorAll('[class]')].map((e) => e.getAttribute('class')).join(' ');
    expect(classes).not.toContain('rotate');
  });

  it('the preview is a decorative illustration whose scorecard matches the sample', () => {
    const { container } = render(<JoinProvider><CloseBand /></JoinProvider>);
    const fig = container.querySelector('figure')!;
    expect(fig.getAttribute('aria-hidden')).toBe('true');
    const { top3, points } = weekStats(SAMPLE.rankGrid.weeks.at(-1)!.you);
    expect(fig.textContent).toContain(`${top3} of ${points} points`);
    expect(fig.textContent).toContain(`${SAMPLE.rivals.length}, ${SAMPLE.rivals.filter((r) => r.tier === 'top').length} of them top rivals`);
    expect(fig.textContent).toContain(REAL_SAMPLE_PREVIEW.note);
  });
});

describe('shared opt-outs', () => {
  it('Steps hides the industries block and prints afterSteps, and keeps both by default', () => {
    const { container } = render(<Steps industries={false} afterSteps={HOW_STEPS_NOTE} />);
    expect(container.querySelector('[data-slot="any-industry"]')).toBeNull();
    expect(screen.queryByText(ANY_INDUSTRY.heading)).toBeNull();
    expect(screen.getByText(HOW_STEPS_NOTE)).toBeTruthy();
    cleanup();
    const def = render(<Steps />);
    expect(def.container.querySelector('[data-slot="any-industry"]')).toBeTruthy();
    expect(screen.queryByText(HOW_STEPS_NOTE)).toBeNull();
  });

  it('CtaBand and the recommendations section carry the decided headings', () => {
    render(<JoinProvider><CtaBand /></JoinProvider>);
    expect(screen.getByRole('heading', { name: 'Try it on one client, free.' })).toBeTruthy();
    cleanup();
    render(<RecommendationsSection />);
    expect(screen.getByRole('heading', { name: 'Every rival move comes with a next step.' })).toBeTruthy();
  });

  it('RecommendationsSection drops the roadmap block only when asked', () => {
    render(<RecommendationsSection roadmap={false} />);
    expect(screen.queryByText(RECOMMENDATIONS_ROADMAP.heading)).toBeNull();
    cleanup();
    render(<RecommendationsSection />);
    expect(screen.getByText(RECOMMENDATIONS_ROADMAP.heading)).toBeTruthy();
  });

  it('ChecksHub heading overrides the visible H2 only; the diagram title stays', () => {
    const { container } = render(<ChecksHub hideLink heading={SECTIONS.checks.homeHeading} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SECTIONS.checks.homeHeading);
    expect(container.querySelector('svg[role="group"]')!.getAttribute('aria-label')).toContain(SECTIONS.checks.heading.replace(/\.$/, ''));
    cleanup();
    render(<ChecksHub />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SECTIONS.checks.heading);
  });
});
