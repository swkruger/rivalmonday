// @vitest-environment jsdom
import type { GlossaryTerm } from '@cs/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_PAGE_GUIDE_EVENT, renderCopy, resolveTip } from '@/help/copy';
import { EmptyState } from './empty-state';
import { FieldHint, useFieldHint } from './field-hint';
import { HelpText, useHelp, useRegisterPageGuide } from './help-context';
import { HelpProvider } from './help-provider';
import { HelpTip } from './help-tip';

const TERMS: GlossaryTerm[] = [
  { id: 'share-of-voice', term: 'Share of voice', audience: 'all', short: 'Your slice of the mentions for {client}.', long: 'Longer text.' },
  { id: 'upsell-tag', term: 'Upsell tag', audience: 'agency', short: 'Agency only.' },
  { id: 'pool', term: 'Pool', audience: 'operator', short: 'Operator only.' },
];

function mockPointer(fine: boolean) {
  window.matchMedia = ((q: string) => ({ matches: fine && q.includes('fine'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
}

beforeEach(() => mockPointer(true));
afterEach(cleanup);

const wrap = (audience: 'client' | 'agency' | 'operator', ui: React.ReactNode, client?: string) => (
  <HelpProvider value={{ audience, names: { agency: 'Acme Agency', assistant: 'Friday', client } }}>{ui}</HelpProvider>
);

/** Stands in for `PageGuide`: the page has a guide while this is mounted. */
function GuideMounted() {
  useRegisterPageGuide();
  return null;
}

describe('HelpTip', () => {
  it('opens on click, shows rendered copy and labels the button', () => {
    render(wrap('client', <HelpTip term="share-of-voice" terms={TERMS} />, 'Bob HVAC'));
    const btn = screen.getByRole('button', { name: 'What is Share of voice?' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Your slice of the mentions for Bob HVAC.')).toBeTruthy();
    expect(screen.getByText('Longer text.')).toBeTruthy();
  });

  it('opens by touch (click without a mouse pointer) and does not open on touch hover', () => {
    render(wrap('client', <HelpTip term="share-of-voice" terms={TERMS} />));
    const btn = screen.getByRole('button');
    fireEvent.pointerEnter(btn, { pointerType: 'touch' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens on hover only with a fine pointer', async () => {
    render(wrap('client', <HelpTip term="share-of-voice" terms={TERMS} />));
    const btn = screen.getByRole('button');
    fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerLeave(btn, { pointerType: 'mouse' });
    await waitFor(() => expect(btn.getAttribute('aria-expanded')).toBe('false'));
    cleanup();
    mockPointer(false);
    render(wrap('client', <HelpTip term="share-of-voice" terms={TERMS} />));
    const coarse = screen.getByRole('button');
    fireEvent.pointerEnter(coarse, { pointerType: 'mouse' });
    expect(coarse.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and returns focus to the button', async () => {
    render(wrap('client', <HelpTip term="share-of-voice" terms={TERMS} />));
    const btn = screen.getByRole('button');
    btn.focus();
    fireEvent.click(btn);
    expect(screen.getByText('Longer text.')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(document.activeElement).toBe(btn));
  });

  it('filters by audience: a hidden term renders nothing, an unknown term renders nothing', () => {
    const { container, rerender } = render(wrap('client', <HelpTip term="upsell-tag" terms={TERMS} />));
    expect(container.innerHTML).toBe('');
    rerender(wrap('client', <HelpTip term="nope" terms={TERMS} />));
    expect(container.innerHTML).toBe('');
    rerender(wrap('agency', <HelpTip term="upsell-tag" terms={TERMS} />));
    expect(screen.getByRole('button', { name: 'What is Upsell tag?' })).toBeTruthy();
    rerender(wrap('agency', <HelpTip term="pool" terms={TERMS} />));
    expect(container.innerHTML).toBe('');
    rerender(wrap('operator', <HelpTip term="pool" terms={TERMS} />));
    expect(screen.getByRole('button', { name: 'What is Pool?' })).toBeTruthy();
  });

  it('resolves a page tip, labels it with its title, and a tip with no audience counts as all', () => {
    render(wrap('client', <HelpTip tip="client.overview.ratingVsArea" />, 'Bob HVAC'));
    fireEvent.click(screen.getByRole('button', { name: 'Your rating vs area' }));
    expect(screen.getByText("Bob HVAC's Google rating next to the average rating of the tracked competitors.")).toBeTruthy();
  });

  it('audience-specific page tips: routing is agency-only, the plain route wording client-only', () => {
    const both = <><HelpTip tip="client.changes.routes" /><HelpTip tip="client.changes.routing" /></>;
    const { rerender } = render(wrap('client', both));
    expect(screen.getByRole('button', { name: 'Alert, Brief and Archived' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Routing' })).toBeNull();
    rerender(wrap('agency', both));
    expect(screen.getByRole('button', { name: 'Routing' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Alert, Brief and Archived' })).toBeNull();
  });

  it('shows "More in the guide" only while the page has a guide (a PageGuide is mounted)', () => {
    const { rerender } = render(wrap('client', <><HelpTip tip="client.overview.changesWeek" />{null}</>));
    fireEvent.click(screen.getByRole('button', { name: 'Changes this week' }));
    expect(screen.queryByText(/More in the guide/)).toBeNull();
    // A sibling mounts and unmounts, the tip itself stays mounted and open.
    rerender(wrap('client', <><HelpTip tip="client.overview.changesWeek" /><GuideMounted /></>));
    expect(screen.getByText(/More in the guide/)).toBeTruthy();
    rerender(wrap('client', <><HelpTip tip="client.overview.changesWeek" />{null}</>));
    expect(screen.queryByText(/More in the guide/)).toBeNull();
  });

  it('falls back to the client audience outside a provider', () => {
    expect(() => render(<HelpTip term="upsell-tag" terms={TERMS} />)).not.toThrow();
    expect(screen.queryByRole('button')).toBeNull();
    function Probe() {
      const h = useHelp();
      return <p>{`${h.audience}|${h.names.agency}|${h.names.assistant}`}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('client|your agency|your assistant')).toBeTruthy();
  });

  it('shows no guide link without an anchor (glossary terms have none), even when the page has a guide', () => {
    render(wrap('client', <><GuideMounted /><HelpTip term="share-of-voice" terms={TERMS} /></>));
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText(/More in the guide/)).toBeNull();
  });
});

describe('HelpTip hover behaviour', () => {
  afterEach(() => vi.useRealTimers());
  const tipWithGuide = () => render(wrap('client', <><GuideMounted /><HelpTip tip="client.overview.changesWeek" /></>));

  it('stays open while the pointer moves from the trigger onto the content, and the guide link works', async () => {
    vi.useFakeTimers();
    const seen = vi.fn();
    window.addEventListener(OPEN_PAGE_GUIDE_EVENT, seen);
    tipWithGuide();
    const btn = screen.getByRole('button');
    fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
    fireEvent.pointerLeave(btn, { pointerType: 'mouse' });
    const content = document.querySelector('[data-slot="popover-content"]')!;
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.pointerEnter(content, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(500); });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByText(/More in the guide/));
    window.removeEventListener(OPEN_PAGE_GUIDE_EVENT, seen);
    expect((seen.mock.calls[0]![0] as CustomEvent).detail).toEqual({ anchor: 'common-questions' });
  });

  it('a click after a hover-open keeps it open (pinned, no close on leave); a second click closes', () => {
    vi.useFakeTimers();
    tipWithGuide();
    const btn = screen.getByRole('button');
    fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerLeave(btn, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(500); });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes after the delay when the pointer leaves and does not return', () => {
    vi.useFakeTimers();
    tipWithGuide();
    const btn = screen.getByRole('button');
    fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
    fireEvent.pointerLeave(btn, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    act(() => { vi.advanceTimersByTime(100); });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('copy', () => {
  it('renderCopy fills single-brace names and defaults a missing client', () => {
    expect(renderCopy('{agency} / {assistant} / {client}', { agency: 'A', assistant: 'F', client: 'C' })).toBe('A / F / C');
    expect(renderCopy('For {client}.', { agency: 'A', assistant: 'F' })).toBe('For your business.');
    expect(renderCopy('{{client}} {other}', { agency: 'A', assistant: 'F', client: 'C' })).toBe('{C} {other}');
  });

  it('renderCopy: a missing client reads "your business" to clients and "the client" to agency staff and operators', () => {
    const n = { agency: 'A', assistant: 'F' };
    expect(renderCopy('For {client}.', n, 'client')).toBe('For your business.');
    expect(renderCopy('For {client}.', n, 'agency')).toBe('For the client.');
    expect(renderCopy('For {client}.', n, 'operator')).toBe('For the client.');
    expect(renderCopy('For {client}.', { ...n, client: 'C' }, 'agency')).toBe('For C.');
  });

  it('resolveTip handles dotted page keys and unknown keys', () => {
    expect(resolveTip('client.changes.score')?.title).toBe('How the score works');
    expect(resolveTip('client.changes.nope')).toBeNull();
    // `client.competitors` is a prefix of `client.competitors.detail`: a detail tip still resolves, and so does a tip of the shorter key.
    expect(resolveTip('client.competitors.detail.collection')?.title).toBe('Collection status');
    expect(resolveTip('client.competitors.tiers')?.title).toBe('Competitor tiers');
    expect(resolveTip('client.competitors.detail.nope')).toBeNull();
    expect(resolveTip('other.page.x')).toBeNull();
  });
});

describe('FieldHint', () => {
  it('derives matching ids and aria-describedby', () => {
    function Field() {
      const { describedBy } = useFieldHint('phone');
      return (
        <>
          <input aria-label="Phone" {...describedBy} />
          <FieldHint id="phone">Digits only.</FieldHint>
        </>
      );
    }
    render(<Field />);
    expect(useHintId()).toBe('phone-hint');
    const input = screen.getByLabelText('Phone');
    expect(input.getAttribute('aria-describedby')).toBe('phone-hint');
    expect(document.getElementById('phone-hint')?.textContent).toBe('Digits only.');
  });
});
function useHintId() {
  let id = '';
  function P() { id = useFieldHint('phone').hintId; return null; }
  render(<P />);
  return id;
}

describe('EmptyState', () => {
  it('renders title, body and the action', () => {
    render(<EmptyState title="No changes yet" body="We check weekly." action={<button type="button">Add competitor</button>} />);
    expect(screen.getByRole('heading', { name: 'No changes yet' })).toBeTruthy();
    expect(screen.getByText('We check weekly.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add competitor' })).toBeTruthy();
    expect(screen.queryByText(/More in the guide/)).toBeNull();
  });

  it('fills the copy placeholders with the viewer names, and hides the guide link when the page has no guide', () => {
    render(wrap('client', <EmptyState title="No briefs for {client}" body="Ask {agency} or {assistant}." guideAnchor="how-to-use-it" />, 'Bob HVAC'));
    expect(screen.getByRole('heading', { name: 'No briefs for Bob HVAC' })).toBeTruthy();
    expect(screen.getByText('Ask Acme Agency or Friday.')).toBeTruthy();
    expect(screen.queryByText(/More in the guide/)).toBeNull();
  });

  it('opens the page guide at the anchor', () => {
    const seen = vi.fn();
    window.addEventListener(OPEN_PAGE_GUIDE_EVENT, seen);
    render(<><GuideMounted /><EmptyState title="t" body="b" guideAnchor="changes" /></>);
    act(() => { fireEvent.click(screen.getByText(/More in the guide/)); });
    window.removeEventListener(OPEN_PAGE_GUIDE_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect((seen.mock.calls[0]![0] as CustomEvent).detail).toEqual({ anchor: 'changes' });
  });

  it('an audience-limited empty state renders only for viewers in that audience', () => {
    const es = <EmptyState audience="agency" title="No upsells yet" body="Tag items for {client}." />;
    const { rerender } = render(wrap('client', es));
    expect(screen.queryByRole('heading', { name: 'No upsells yet' })).toBeNull();
    rerender(wrap('agency', es));
    expect(screen.getByRole('heading', { name: 'No upsells yet' })).toBeTruthy();
    expect(screen.getByText('Tag items for the client.')).toBeTruthy();
    rerender(wrap('operator', es));
    expect(screen.getByRole('heading', { name: 'No upsells yet' })).toBeTruthy();
    rerender(wrap('agency', <EmptyState audience="operator" title="Pool empty" body="b" />));
    expect(screen.queryByRole('heading', { name: 'Pool empty' })).toBeNull();
  });
});

describe('HelpText', () => {
  it('renders short copy with the viewer names; a missing client reads "your business" to clients, "the client" to agency staff', () => {
    const { rerender } = render(wrap('agency', <p><HelpText text="How {client} compares." /></p>, 'Bob HVAC'));
    expect(screen.getByText('How Bob HVAC compares.')).toBeTruthy();
    rerender(wrap('agency', <p><HelpText text="How {client} compares." /></p>));
    expect(screen.getByText('How the client compares.')).toBeTruthy();
    rerender(wrap('client', <p><HelpText text="How {client} compares." /></p>));
    expect(screen.getByText('How your business compares.')).toBeTruthy();
  });
});
