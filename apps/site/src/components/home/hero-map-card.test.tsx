import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE } from '../../sample/schema';
import { weekStats } from '../sample/rank-map';
import { HeroMapCard } from './hero-map-card';

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

const weeks = SAMPLE.rankGrid.weeks;
const caption = (i: number) => {
  const { top3, points } = weekStats(weeks[i]!.you);
  return `Top 3 in ${top3} of ${points} map points`;
};

describe('HeroMapCard', () => {
  it('replays the twelve scans from week 1 out to the latest, then rests there', () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    const { container } = render(<HeroMapCard />);
    expect(screen.getByText(caption(0))).toBeTruthy();
    expect(screen.getByText(`Week 1 of ${weeks.length}`)).toBeTruthy();
    expect(container.querySelector('.hero-map')!.hasAttribute('data-ready')).toBe(true);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText(caption(weeks.length - 1))).toBeTruthy();
    expect(screen.getByText(/^Up from \d+ twelve weeks ago$/)).toBeTruthy();
  });

  it('reduced motion: the latest scan at once, no replay', () => {
    vi.useFakeTimers();
    stubReducedMotion(true);
    render(<HeroMapCard />);
    expect(screen.getByText(caption(weeks.length - 1))).toBeTruthy();
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText(caption(weeks.length - 1))).toBeTruthy();
  });

  it('without matchMedia it still shows the map (never stuck hidden)', () => {
    const { container } = render(<HeroMapCard />);
    expect(container.querySelector('.hero-map')!.hasAttribute('data-ready')).toBe(true);
    expect(container.querySelectorAll('[data-rank-cell]')).toHaveLength(SAMPLE.rankGrid.size ** 2);
  });
});
