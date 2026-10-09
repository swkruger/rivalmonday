import { describe, expect, it } from 'vitest';
import { sovSeries } from './sov';

const s = (key: string, name: string, points: (number | null)[], self = false) => ({ key, name, self, points });

describe('sovSeries (decision 10)', () => {
  it('puts you first as percentages and folds the rest beyond three into Other', () => {
    const out = sovSeries({
      keyword: null, keywords: [], scans: [],
      series: [s('self', 'A1 HVAC', [0.3, 0.34], true), s('a', 'Alpha', [0.1, 0.2]), s('b', 'Bravo', [0.1, 0.05]), s('c', 'Charlie', [0.1, 0.1]), s('d', 'Delta', [0.1, 0.01]), s('other_businesses', 'Other businesses', [0.3, 0.3])],
    });
    expect(out.map((x) => x.name)).toEqual(['You', 'Alpha', 'Charlie', 'Other businesses', 'Other']);
    expect(out[0]!.points).toEqual([30, 34]);
    expect(out.at(-1)!.points).toEqual([20, 6]);
  });

  it('keeps nulls as gaps', () => {
    expect(sovSeries({ keyword: null, keywords: [], scans: [], series: [s('other_businesses', 'Other businesses', [null])] })[0]!.points).toEqual([null]);
  });
});
