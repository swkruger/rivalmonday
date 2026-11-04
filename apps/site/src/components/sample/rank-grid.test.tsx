import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rivalRanks } from '../../sample/rival-grid';
import { SAMPLE } from '../../sample/schema';
import { RankGrid, type RankGridSubject } from './rank-grid';
import { weekStats } from './rank-map';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const subject: RankGridSubject = { title: 'Rival map rankings for "x"', ranks: rivalRanks, tone: 'rival' };
const last = SAMPLE.rankGrid.weeks.length - 1;
const toLast = () => fireEvent.change(screen.getByRole('slider', { name: 'Week' }), { target: { value: String(last) } });

describe('RankGrid with a subject', () => {
  it('shows the subject title and keeps the ringed-point line', () => {
    render(<RankGrid data={SAMPLE} onOpen={() => {}} subject={subject} />);
    expect(screen.getByText(subject.title)).toBeTruthy();
    expect(screen.queryByText(/Your map rankings for/)).toBeNull();
    expect(screen.getByText(new RegExp(`The ringed point is ${SAMPLE.business.name}\\.`))).toBeTruthy();
  });

  it('summarises the subject ranks: top 3 in 31 of 49 on the last week, up from 8', () => {
    render(<RankGrid data={SAMPLE} onOpen={() => {}} subject={subject} />);
    expect(screen.getByText('Top 3 in 8 of 49 points')).toBeTruthy();
    toLast();
    expect(screen.getByText('Top 3 in 31 of 49 points')).toBeTruthy();
    expect(screen.getByText('up from 8 in week 1')).toBeTruthy();
    const grid = screen.getByRole('img', { name: /week of/ });
    expect(grid.textContent).toBe(rivalRanks(SAMPLE.rankGrid.weeks[last]!.weekOf).map((r) => (r! > 20 ? '20+' : String(r))).join(''));
  });

  it('hides the leader lines and the rank-evidence chips (they describe the client’s scans)', () => {
    render(<RankGrid data={SAMPLE} onOpen={() => {}} subject={subject} />);
    for (let i = 0; i <= last; i++) {
      fireEvent.change(screen.getByRole('slider', { name: 'Week' }), { target: { value: String(i) } });
      expect(screen.queryByRole('button', { name: /^Evidence \d+: / }), `week ${i + 1}`).toBeNull();
      expect(screen.queryByText(/Quillstone Climate Pros: top 3/)).toBeNull();
    }
  });

  it('weekly bars and table use the subject ranks, painted in the rival tone', () => {
    const { container } = render(<RankGrid data={SAMPLE} onOpen={() => {}} subject={subject} />);
    toLast();
    const final = rivalRanks(SAMPLE.rankGrid.weeks[last]!.weekOf);
    expect(screen.getByTitle(`Week ${last + 1}: top 3 in ${weekStats(final).top3} of 49`)).toBeTruthy();
    const cells = Array.from(container.querySelectorAll('tbody td')).map((td) => td.textContent);
    expect(cells).toEqual(final.map((r) => (r! > 20 ? 'not found' : String(r))));
    const top3Cell = Array.from(container.querySelectorAll('[data-rank-cell]')).find((el) => Number(el.textContent) <= 3)!;
    expect(top3Cell.className).toContain('bg-chart-rival-1');
    expect(container.innerHTML).not.toContain('bg-rank-top3');
    expect(container.querySelector('[data-rank-cell].outline-ink')).toBeTruthy();
  });
});

describe('RankGrid without a subject', () => {
  it('keeps the client title, the you ramp and the "You:" evidence chip', () => {
    const { container } = render(<RankGrid data={SAMPLE} onOpen={() => {}} />);
    expect(screen.getByText(/Your map rankings for/)).toBeTruthy();
    toLast();
    const you = SAMPLE.rankGrid.weeks[last]!.you;
    expect(screen.getByText(`Top 3 in ${weekStats(you).top3} of ${weekStats(you).points} points`)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Evidence \d+: / }).length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('bg-rank-top3');
    expect(container.innerHTML).not.toContain('chart-rival-1');
  });
});
