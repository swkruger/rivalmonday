// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { foldSeries, LineChart, OTHER_COLOR, SERIES_COLORS } from './line-chart';

const labels = ['2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];

describe('foldSeries', () => {
  it('keeps the strongest series and folds the rest into Other', () => {
    const s = Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, name: `C${i}`, points: [null, i, i, i] }));
    const f = foldSeries(s, 5);
    expect(f.map((x) => x.name)).toEqual(['C3', 'C4', 'C5', 'C6', 'Other']);
    expect(f[4]!.points).toEqual([null, 3, 3, 3]);
  });
});

describe('LineChart', () => {
  it('draws one path segment per run of known points, with a legend and a table', () => {
    render(<LineChart title="Active competitor ads" valueLabel="active ads" labels={labels} series={[
      { key: 'a', name: 'Smith HVAC', points: [7, null, 9, 13] },
      { key: 'b', name: 'Peachtree', points: [2, 3, 3, 4] },
    ]} />);
    const svg = screen.getByRole('img', { name: /Active competitor ads/ });
    expect(svg.querySelectorAll('polyline[data-series="a"]')).toHaveLength(2);
    expect(svg.querySelector('polyline[data-series="a"]')?.getAttribute('stroke')).toBe(SERIES_COLORS[0]);
    expect(screen.getByText('Smith HVAC', { selector: 'li *' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(5); // header + 4 weeks
    expect(svg.querySelector('title')?.textContent).toMatch(/Smith HVAC: 7 active ads/);
  });

  it('has no legend for a single series and an empty state with no data', () => {
    const { rerender } = render(<LineChart title="T" valueLabel="ads" labels={labels} series={[{ key: 'a', name: 'Solo', points: [1, 2, 3, 4] }]} />);
    expect(screen.queryByRole('list')).toBeNull();
    rerender(<LineChart title="T" valueLabel="ads" labels={labels} series={[{ key: 'a', name: 'Solo', points: [null, null, null, null] }]} />);
    expect(screen.getByText('No data yet.')).toBeTruthy();
  });

  it('paints Other grey', () => {
    render(<LineChart title="T" valueLabel="ads" labels={labels} series={[{ key: 'other', name: 'Other', points: [1, 1, 1, 1] }, { key: 'a', name: 'A', points: [1, 1, 1, 1] }]} />);
    expect(document.querySelector('polyline[data-series="other"]')?.getAttribute('stroke')).toBe(OTHER_COLOR);
  });
});
