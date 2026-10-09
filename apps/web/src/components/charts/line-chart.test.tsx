// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { foldSeries, LineChart, OTHER_COLOR, SERIES_COLORS } from './line-chart';

const labels = ['2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];

describe('foldSeries', () => {
  it('keeps the strongest series and folds the rest into Other', () => {
    const s = Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, name: `C${i}`, points: [null, i, i, i] }));
    const f = foldSeries(s, 5);
    expect(f.map((x) => x.name)).toEqual(['C3', 'C4', 'C5', 'C6', 'Other']);
    expect(f[4]!.points).toEqual([null, 3, 3, 3]);
  });

  it('keeps the alphabetically first of tied series when a tie straddles the cut', () => {
    const s = (name: string) => ({ key: name, name, points: [1] });
    const folded = foldSeries([s('C'), s('A'), s('D'), s('B')], 3);
    expect(folded.map((x) => x.name)).toEqual(['A', 'B', 'Other']);
    expect(folded.at(-1)!.points).toEqual([2]);
  });

  it('breaks ties alphabetically, ranks an all-null series last, and gives Other null points when the folded rest has no data', () => {
    const s = (name: string, points: (number | null)[]) => ({ key: name, name, points });
    const folded = foldSeries([s('E', [1]), s('D', [1]), s('C', [5]), s('B', [null]), s('A', [5]), s('F', [null])]);
    expect(folded.map((x) => x.name)).toEqual(['A', 'C', 'D', 'E', 'Other']);
    expect(folded.at(-1)!.points).toEqual([null]);
  });
});

describe('LineChart', () => {
  it('draws one path segment per run of known points, with a legend and a table', () => {
    render(<LineChart title="Active competitor ads" valueLabel="active ads" labels={labels} series={[
      { key: 'a', name: 'Smith HVAC', points: [7, null, 9, 13] },
      { key: 'b', name: 'Peachtree', points: [2, 3, 3, 4] },
    ]} />);
    const svg = screen.getByRole('img', { name: /Active competitor ads/ });
    expect(svg.querySelectorAll('polyline[data-series="a"]')).toHaveLength(1);
    const marker = svg.querySelector('circle[data-marker="a"]');
    expect(marker?.getAttribute('fill')).toBe(SERIES_COLORS[0]);
    expect(marker?.getAttribute('r')).toBe('3');
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
    expect(document.querySelector('polyline[data-series="a"]')?.getAttribute('stroke')).toBe(SERIES_COLORS[0]);
  });

  it('labels the y axis with exact integers for small maxima', () => {
    const { container } = render(<LineChart title="T" valueLabel="ads" labels={labels} series={[{ key: 'a', name: 'A', points: [1, 3, 5, 7] }]} />);
    const ticks = [...container.querySelectorAll('svg > g > text')].map((n) => n.textContent);
    expect(ticks).toEqual(['0', '4', '8']);
  });

  it('formats values, fixes the axis top and labels months (decision 15)', () => {
    render(
      <LineChart
        title="Rating trend"
        labels={['2026-09', '2026-10']}
        series={[{ key: 'a', name: 'You', points: [4.5, 4.75] }]}
        valueLabel="stars"
        yMax={5}
        period="month"
        formatValue={(v) => v.toFixed(1)}
      />,
    );
    expect(screen.getByText('5.0')).toBeTruthy(); // the axis top
    expect(screen.getByText('2.5')).toBeTruthy(); // the mid gridline, not rounded to 3
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Rating trend. Latest: You 4.8.');
    expect(screen.getAllByText('Oct 2026').length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: 'Month' })).toBeTruthy();
    expect(document.querySelector('title')!.textContent).toBe('You: 4.5 stars (Sep 2026)');
  });

  it('gives the table a caption and header scopes, and ignores points beyond the labels', () => {
    const { container } = render(<LineChart title="Ads" labels={['2026-10-01']} series={[{ key: 'a', name: 'A', points: [3, 9] }]} valueLabel="ads" period="scan" />);
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')!.textContent).toBe('Ads');
    expect(table.querySelector('th[scope="col"]')!.textContent).toBe('Scan of');
    expect(table.querySelectorAll('th[scope="row"]')).toHaveLength(1);
    // the stray 9 must not stretch the axis (it would be 0/5/10) or draw a second point
    expect([...container.querySelectorAll('svg > g > text')].map((n) => n.textContent)).toEqual(['0', '2', '4']);
    expect(container.querySelectorAll('svg title')).toHaveLength(1);
  });
});

describe('foldSeries aggregates', () => {
  const mk = (name: string, points: (number | null)[]) => ({ key: name, name, points });
  const base = [mk('A', [9, 9]), mk('B', [8, 8]), mk('C', [7, 7]), mk('D', [6, 6]), mk('E', [4, null]), mk('F', [2, null])];

  it('means the folded series and ignores nulls', () => {
    const f = foldSeries(base, 5, { aggregate: 'mean' });
    expect(f.at(-1)!.points).toEqual([3, null]);
  });

  it('takes the minimum of the folded series and ignores nulls', () => {
    const f = foldSeries([...base.slice(0, 4), mk('E', [4, 5]), mk('F', [2, null])], 5, { aggregate: 'min' });
    expect(f.at(-1)!.points).toEqual([2, 5]);
  });

  it('is null in a bucket where every folded value is null, for every mode', () => {
    for (const aggregate of ['sum', 'mean', 'min'] as const) {
      expect(foldSeries(base, 5, { aggregate }).at(-1)!.points[1]).toBeNull();
    }
  });

  it('labels Other as asked', () => {
    expect(foldSeries(base, 5, { label: 'Other (average)' }).at(-1)!.name).toBe('Other (average)');
  });

  it('never folds a pinned series, even when it is the lowest', () => {
    const f = foldSeries([mk('You', [1, 1]), ...base], 5, { pin: ['You'], aggregate: 'mean' });
    expect(f).toHaveLength(5);
    expect(f[0]!.name).toBe('You');
    expect(f.at(-1)!.name).toBe('Other');
    expect(f.at(-1)!.points).toEqual([4, 6]);
    expect(f.slice(1, 4).map((x) => x.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('LineChart robustness', () => {
  it('extends the axis when a value goes above yMax', () => {
    const { container } = render(<LineChart title="T" valueLabel="x" labels={labels} yMax={5} series={[{ key: 'a', name: 'A', points: [1, 2, 6, 3] }]} />);
    const ticks = [...container.querySelectorAll('svg > g > text')].map((n) => n.textContent);
    expect(ticks).toEqual(['0', '3', '6']);
  });

  it('logs no duplicate-key warning when two labels are the same', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LineChart title="T" valueLabel="x" labels={['2026-10-01', '2026-10-01']} series={[{ key: 'a', name: 'A', points: [1, 2] }]} />);
    const keyWarnings = err.mock.calls.filter((c) => String(c[0]).includes('same key'));
    err.mockRestore();
    expect(keyWarnings).toHaveLength(0);
  });
});
