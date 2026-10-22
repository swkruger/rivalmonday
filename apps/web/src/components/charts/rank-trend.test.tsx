// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SERIES_COLORS } from './line-chart';
import { RankTrend, rankSeries } from './rank-trend';

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

  it('draws You in var(--you) and the competitor in slot 1, never slot 0', () => {
    const { container } = render(<RankTrend keyword="ac repair" scans={[scan(1, false, 4, 8), scan(2, false, 3, 6)]} />);
    expect(container.querySelector('polyline[data-series="self"]')!.getAttribute('stroke')).toBe('var(--you)');
    expect(container.querySelector(`polyline[data-series="${id(9)}"]`)!.getAttribute('stroke')).toBe(SERIES_COLORS[1]);
  });

  it('says so when there is no history', () => {
    render(<RankTrend keyword="ac repair" scans={[]} />);
    expect(screen.getByText('No rank history yet.')).toBeTruthy();
  });
});
