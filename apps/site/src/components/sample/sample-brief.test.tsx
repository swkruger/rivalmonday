import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { SAMPLE } from '../../sample/schema';
import { ReviewsView } from './reviews-view';
import { SampleBrief } from './sample-brief';

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** True once every part of answer `i` has typed in (citation pills sit between parts). */
const showsWholeAnswer = (el: HTMLElement, i: number) => FRIDAY_ANSWERS[i]!.answer.every((p) => el.textContent!.includes(p.text));

describe('SampleBrief', () => {
  it('Sample data label is visible', () => {
    render(<SampleBrief />);
    expect(screen.getByText('Sample data')).toBeTruthy();
    expect(screen.getByText('All businesses, people and places are fictional.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: `Monday brief · ${SAMPLE.business.name}` })).toBeTruthy();
  });

  it('clicking a claim opens its evidence', () => {
    render(<SampleBrief />);
    const snapshotItem = SAMPLE.items.find((i) => SAMPLE.evidence[i.evidenceIds[0]!]!.kind === 'snapshot')!;
    const ev = SAMPLE.evidence[snapshotItem.evidenceIds[0]!]!;
    if (ev.kind !== 'snapshot') throw new Error('fixture');
    fireEvent.click(screen.getByRole('button', { name: snapshotItem.whatChanged }));
    const dialog = screen.getByRole('dialog', { name: `Website snapshot · ${ev.url}` });
    expect(within(dialog).getByText(ev.after[ev.changed]!)).toBeTruthy();
    // Before/after switch shows the earlier text.
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Before' }));
    expect(within(dialog).getByText(ev.before[ev.changed]!)).toBeTruthy();
  });

  it('a headline repeated as what changed shows once, as the claim', () => {
    render(<SampleBrief />);
    const dup = SAMPLE.items.find((i) => i.whatChanged.replace(/\.$/, '') === i.headline)!;
    const heading = screen.getByRole('heading', { name: dup.whatChanged });
    expect(within(heading).getByRole('button', { name: dup.whatChanged })).toBeTruthy();
    expect(screen.getAllByText(dup.whatChanged)).toHaveLength(1);
  });

  it('a citation pill opens its evidence', () => {
    render(<SampleBrief />);
    const adItem = SAMPLE.items.find((i) => i.kind === 'ads')!;
    const pills = screen.getAllByRole('button', { name: /^Evidence/ }).filter((b) => b.closest(`[data-item="${adItem.id}"]`));
    expect(pills.length).toBe(adItem.evidenceIds.length);
    fireEvent.click(pills[0]!);
    const ad = SAMPLE.evidence[adItem.evidenceIds[0]!]!;
    if (ad.kind !== 'ad') throw new Error('fixture');
    const dialog = screen.getByRole('dialog', { name: 'Ad · Meta Ad Library' });
    expect(within(dialog).getByText(ad.headline)).toBeTruthy();
  });

  it('Esc closes and returns focus', async () => {
    render(<SampleBrief />);
    const claim = screen.getByRole('button', { name: SAMPLE.items[0]!.whatChanged });
    claim.focus();
    fireEvent.click(claim);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Radix restores focus on the next tick after the content unmounts.
    await waitFor(() => expect(document.activeElement).toBe(claim));
  });

  it('slider changes the grid and caption', () => {
    render(<SampleBrief />);
    const weeks = SAMPLE.rankGrid.weeks;
    const top3 = (i: number) => weeks[i]!.you.filter((r) => r !== null && r <= 3).length;
    const points = (i: number) => weeks[i]!.you.filter((r) => r !== null).length;
    const slider = screen.getByRole('slider', { name: 'Week' });
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^Week of /);
    expect(screen.getByText(`Top 3 in ${top3(11)} of ${points(11)} points`)).toBeTruthy();
    const grid = () => screen.getByRole('img', { name: /Map rankings for/ }).textContent;
    const before = grid();
    fireEvent.change(slider, { target: { value: '0' } });
    expect(screen.getByText(`Top 3 in ${top3(0)} of ${points(0)} points`)).toBeTruthy();
    expect(grid()).not.toBe(before);
    expect(slider.getAttribute('aria-valuetext')).not.toBe('');
  });

  it('compact shows the first 3 items and no rank grid', () => {
    render(<SampleBrief compact />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('friday question reveals a cited answer', () => {
    vi.useFakeTimers();
    render(<SampleBrief />);
    expect(screen.getByText('Canned answers from the sample data')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: FRIDAY_ANSWERS[0]!.question }));
    const answer = screen.getByTestId('friday-answer');
    expect(showsWholeAnswer(answer, 0)).toBe(false);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(showsWholeAnswer(answer, 0)).toBe(true);
    const cite = FRIDAY_ANSWERS[0]!.answer.find((p) => p.cite)!.cite!;
    const pill = within(answer).getAllByRole('button', { name: /^Evidence/ })[0]!;
    vi.useRealTimers();
    fireEvent.click(pill);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(SAMPLE.evidence[cite]).toBeDefined();
  });

  it('reduced motion shows the answer at once', () => {
    stubReducedMotion(true);
    render(<SampleBrief />);
    fireEvent.click(screen.getByRole('button', { name: FRIDAY_ANSWERS[1]!.question }));
    expect(showsWholeAnswer(screen.getByTestId('friday-answer'), 1)).toBe(true);
  });
});

describe('ReviewsView', () => {
  it('labels stars and shows initials and dates', () => {
    render(<ReviewsView ev={{ id: 'r', kind: 'reviews', rivalId: 'r1', from: '2026-10-01', to: '2026-10-07', count: 1, reviews: [{ author: 'Reviewer A', rating: 4, date: '2026-10-03', text: 'Quick and tidy.' }] }} />);
    expect(screen.getByLabelText('4 out of 5')).toBeTruthy();
    expect(screen.getByText('RA')).toBeTruthy();
    expect(screen.getByText('Oct 3, 2026')).toBeTruthy();
  });
});
