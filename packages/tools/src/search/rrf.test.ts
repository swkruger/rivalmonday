import { describe, expect, it } from 'vitest';
import { rrfMerge } from './rrf';

const items = (...keys: string[]) => keys.map((key) => ({ key, from: 'x' }));

describe('rrfMerge', () => {
  it('item in both lists outranks single-list items', () => {
    const out = rrfMerge([items('a', 'b', 'c'), items('d', 'c')]);
    expect(out[0]!.key).toBe('c');
  });

  it('ties break by best rank then key', () => {
    // a (list 0 rank 0) and b (list 1 rank 0) tie on score and best rank -> key order; c/d tie at rank 1.
    expect(rrfMerge([items('b', 'd'), items('a', 'c')]).map((x) => x.key)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('first list wins the displayed item', () => {
    const out = rrfMerge([[{ key: 'k', from: 'fts' }], [{ key: 'k', from: 'vec' }]]);
    expect(out).toEqual([{ key: 'k', from: 'fts' }]);
  });

  it('respects limit', () => {
    expect(rrfMerge([items('a', 'b', 'c', 'd')], 60, 2).map((x) => x.key)).toEqual(['a', 'b']);
    expect(rrfMerge([items(...Array.from({ length: 15 }, (_, i) => `k${String(i).padStart(2, '0')}`))])).toHaveLength(10);
  });

  it('k=60 values', () => {
    // a: 1/61 + 1/62 ≈ 0.03252; b: 1/61 ≈ 0.01639 — so a first even though b is rank 0 in list 1.
    expect(rrfMerge([items('b', 'a'), items('a')], 60).map((x) => x.key)).toEqual(['a', 'b']);
    // a is rank 3 in both lists: k=0 -> a = 1/4 + 1/4 = 0.5 < b = 1/1; k=60 -> a = 2/64 ≈ 0.0313 > b = 1/61 ≈ 0.0164.
    const lists = [items('b', 'x', 'y', 'a'), items('p', 'q', 'r', 'a')];
    const order = (k: number) => rrfMerge(lists, k, 10).map((x) => x.key);
    expect(order(0).indexOf('b')).toBeLessThan(order(0).indexOf('a'));
    expect(order(60)[0]).toBe('a');
  });
});
