// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONTEXT_COLOR, RIVAL_COLORS } from './line-chart';
import { RankTrend, rankScale, rankSeries } from './rank-trend';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const scan = (n: number, settingsChanged: boolean, self: number | null, rival: number) => ({
  scanId: id(n), finishedAt: `2026-09-0${n}T00:00:00.000Z`, settingsKey: settingsChanged ? 'bbbbbbbbbbbbbbbb' : 'aaaaaaaaaaaaaaaa', settingsChanged,
  self: self === null ? null : { avgRank: self, top3Share: 0.5, points: 9 },
  competitors: [{ competitorId: id(9), name: 'Acme Air', tier: 'top' as const, avgRank: rival, top3Share: 0.2 }],
});

describe('RankTrend', () => {
  it('RankTrend draws a marker at a settings change', () => {
    const { container } = render(<RankTrend keyword="ac repair" scans={[scan(1, false, 4, 8), scan(2, false, 3, 21), scan(3, true, 2, 6)]} />);
    const markers = container.querySelectorAll('[data-settings-marker]');
    expect(markers.length).toBe(1);
    expect(markers[0]!.querySelector('line')!.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(screen.getAllByText('Settings changed').length).toBeGreaterThan(0);
    // One line per business, You and the competitor, with a legend.
    expect(container.querySelectorAll('polyline[data-series]').length).toBe(2);
    expect([...container.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(['Acme Air', 'You', 'Settings changed']);
  });

  it('puts rank 1 at the top and labels 21 as 20+', () => {
    const { container } = render(<RankTrend keyword="ac repair" scans={[scan(1, false, 1, 21), scan(2, false, 1, 21)]} />);
    const ys = (key: string) => container.querySelector(`polyline[data-series="${key}"]`)!.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys('self')[0]!).toBeLessThan(ys(id(9))[0]!);
    expect(screen.getAllByText('20+').length).toBeGreaterThan(0);
  });

  it('keeps You and the best-ranked competitors, folding the rest into Other', () => {
    const rivals = [3, 9, 1, 15, 21, 6].map((r, i) => ({ competitorId: id(i), name: `R${i}`, tier: null, avgRank: r, top3Share: 0 }));
    const s = { ...scan(1, false, 4, 8), competitors: rivals };
    const out = rankSeries([s]);
    expect(out.map((x) => x.name)).toEqual(['R0', 'R2', 'R5', 'You', 'Other']);
    expect(out.at(-1)!.points).toEqual([15]); // mean of 9, 15, 21
  });

  it('draws You in var(--you) and the competitor in the first rival token', () => {
    const { container } = render(<RankTrend keyword="ac repair" scans={[scan(1, false, 4, 8), scan(2, false, 3, 6)]} />);
    expect(container.querySelector('polyline[data-series="self"]')!.getAttribute('stroke')).toBe('var(--you)');
    expect(container.querySelector(`polyline[data-series="${id(9)}"]`)!.getAttribute('stroke')).toBe(RIVAL_COLORS[0]);
  });

  it('highlights the two best-ranked rivals (lowest average rank) and greys the rest', () => {
    const rivals = [12, 3, 20, 5].map((r, i) => ({ competitorId: id(i), name: `R${i}`, tier: null, avgRank: r, top3Share: 0 }));
    const { container } = render(<RankTrend keyword="ac repair" scans={[{ ...scan(1, false, 4, 8), competitors: rivals }]} />);
    const stroke = (i: number) => container.querySelector(`[data-marker="${id(i)}"], polyline[data-series="${id(i)}"]`)?.getAttribute('stroke') ?? container.querySelector(`[data-marker="${id(i)}"]`)?.getAttribute('fill');
    expect(stroke(1)).toBe(RIVAL_COLORS[0]); // rank 3
    expect(stroke(3)).toBe(RIVAL_COLORS[1]); // rank 5
    expect(stroke(0)).toBe(CONTEXT_COLOR);
    expect(stroke(2)).toBe(CONTEXT_COLOR);
  });

  it('fits the axis to the data, so ranks 5 to 7.5 fill the plot', () => {
    const { container } = render(<RankTrend keyword="ac repair" scans={[scan(1, false, 5, 7.5), scan(2, false, 5.5, 7)]} />);
    expect([...container.querySelectorAll('[data-y-tick]')].map((t) => t.textContent)).toEqual(['4', '5', '6', '7', '8']);
    const ys = (key: string) => container.querySelector(`polyline[data-series="${key}"]`)!.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys('self')[0]).toBe(25); // rank 5 on a 4 to 8 axis
    expect(ys(id(9))[0]).toBe(87.5); // rank 7.5
  });

  it('says when the axis is zoomed, and not when it shows the full range', () => {
    const { unmount } = render(<RankTrend keyword="ac repair" scans={[scan(1, false, 5, 7), scan(2, false, 5, 7)]} />);
    expect(screen.getByTestId('rank-scale').textContent).toBe('Scale zoomed to ranks 4 to 8 to show small moves.');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Scale zoomed to ranks 4 to 8');
    unmount();
    render(<RankTrend keyword="ac repair" scans={[scan(1, false, 1, 21), scan(2, false, 1, 21)]} />);
    expect(screen.queryByTestId('rank-scale')).toBeNull();
  });

  describe('rankScale', () => {
    it('never zooms in past 4 ranks, so a tiny wobble does not look like a big swing', () => {
      expect(rankScale([6, 6.1])).toMatchObject({ lo: 4, hi: 8 });
    });

    it('stays inside rank 1 and 20+', () => {
      expect(rankScale([1, 1])).toMatchObject({ lo: 1, hi: 5, ticks: [1, 2, 3, 4, 5] });
      expect(rankScale([21, 21])).toMatchObject({ lo: 17, hi: 21, ticks: [17, 18, 19, 20, 21] });
    });

    it('uses wider tick steps as the range grows, on whole ranks', () => {
      expect(rankScale([3, 12])).toMatchObject({ lo: 2, hi: 14, ticks: [2, 4, 6, 8, 10, 12, 14] });
      expect(rankScale([2, 18]).ticks).toEqual([1, 5, 10, 15, 20]);
    });

    it('keeps the full axis when the data spans it, with no 20 crowding 20+', () => {
      expect(rankScale([1, 21])).toEqual({ lo: 1, hi: 21, ticks: [1, 5, 10, 15, 21] });
    });
  });

  it('says so when there is no history', () => {
    render(<RankTrend keyword="ac repair" scans={[]} />);
    expect(screen.getByText('No rank history yet.')).toBeTruthy();
  });
});
