import { describe, expect, it } from 'vitest';
import { type ChartSeries } from './brief-report';
import { chartRole, foldSeries, linePath, niceMax, yTicks } from './charts';

const mk = (key: string, name: string, points: (number | null)[], you?: boolean): ChartSeries => ({ key, name, points, ...(you ? { you } : {}) });

describe('foldSeries unchanged', () => {
  it('keeps the strongest series and folds the rest into Other', () => {
    const s = Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, name: `C${i}`, points: [null, i, i, i] }));
    const f = foldSeries(s, 5);
    expect(f.map((x) => x.name)).toEqual(['C3', 'C4', 'C5', 'C6', 'Other']);
    expect(f[4]!.points).toEqual([null, 3, 3, 3]);
  });
  it('breaks ties alphabetically, ranks all-null last, Other null when rest has no data', () => {
    const folded = foldSeries([mk('E', 'E', [1]), mk('D', 'D', [1]), mk('C', 'C', [5]), mk('B', 'B', [null]), mk('A', 'A', [5]), mk('F', 'F', [null])]);
    expect(folded.map((x) => x.name)).toEqual(['A', 'C', 'D', 'E', 'Other']);
    expect(folded.at(-1)!.points).toEqual([null]);
  });
  it('name-sorts a pinned series', () => {
    const f = foldSeries([mk('z', 'Delta (you)', [1]), mk('a', 'Alpha', [9]), mk('b', 'Beta', [8]), mk('c', 'Gamma', [7]), mk('d', 'Zulu', [6]), mk('e', 'Eps', [5])], 5, { pin: ['z'] });
    expect(f.map((x) => x.name)).toEqual(['Alpha', 'Beta', 'Delta (you)', 'Gamma', 'Other']);
  });
});

describe('chartRole matches the old seriesColor for <=2 and >2 rivals, lowerIsBetter, other', () => {
  it('you and other', () => {
    const all = [mk('me', 'Me', [1], true), mk('other', 'Other', [1]), mk('a', 'A', [1])];
    expect(chartRole(all[0]!, all)).toBe('you');
    expect(chartRole(all[1]!, all)).toBe('context');
  });
  it('<= 2 rivals keep their order', () => {
    const all = [mk('a', 'A', [1]), mk('b', 'B', [9])];
    expect(all.map((s) => chartRole(s, all))).toEqual(['rival1', 'rival2']);
  });
  it('> 2 rivals: two highest latest values highlighted', () => {
    const all = [mk('a', 'A', [1]), mk('b', 'B', [9]), mk('c', 'C', [5])];
    expect(all.map((s) => chartRole(s, all))).toEqual(['context', 'rival1', 'rival2']);
  });
  it('lowerIsBetter highlights the lowest, and an all-null series is worst', () => {
    const all = [mk('a', 'A', [1]), mk('b', 'B', [9]), mk('c', 'C', [5]), mk('d', 'D', [null])];
    expect(all.map((s) => chartRole(s, all, { lowerIsBetter: true }))).toEqual(['rival1', 'context', 'rival2', 'context']);
  });
});

describe('helpers', () => {
  it('niceMax and yTicks', () => {
    expect(niceMax(3)).toBe(4);
    expect(niceMax(13)).toBe(20);
    expect(yTicks(20, 2)).toEqual([0, 10, 20]);
  });
  it('linePath breaks at nulls', () => {
    const p = linePath([1, 2, null, 3, 4], (i) => i * 10, (v) => v);
    expect(p).toBe('M0,1L10,2M30,3L40,4');
  });
  it('linePath draws nothing for all-null and a lone point as a move', () => {
    expect(linePath([null, null], (i) => i, (v) => v)).toBe('');
    expect(linePath([null, 2], (i) => i, (v) => v)).toBe('M1,2');
  });
});
