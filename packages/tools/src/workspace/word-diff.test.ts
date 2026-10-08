import { describe, expect, it } from 'vitest';
import { type DiffSegment, MAX_DIFF_CELLS, wordDiff } from './word-diff';

const side = (segs: DiffSegment[], drop: 'insert' | 'delete') => segs.filter((s) => s.op !== drop).map((s) => s.text).join('');

describe('wordDiff', () => {
  it('marks a changed price and keeps the rest equal', () => {
    expect(wordDiff('AC tune-up $99 today', 'AC tune-up $79 today')).toEqual([
      { op: 'equal', text: 'AC tune-up ' },
      { op: 'delete', text: '$99' },
      { op: 'insert', text: '$79' },
      { op: 'equal', text: ' today' },
    ]);
  });
  it('handles an empty side', () => {
    expect(wordDiff('', 'New fall special')).toEqual([{ op: 'insert', text: 'New fall special' }]);
    expect(wordDiff('Old promo', '')).toEqual([{ op: 'delete', text: 'Old promo' }]);
    expect(wordDiff('', '')).toEqual([]);
  });
  it('always recomposes both sides exactly', () => {
    const pairs: [string, string][] = [
      ['Furnace check $89. Call now!', 'Furnace check from $69. Call  now! Fall special — limited time'],
      ['a b c d e', 'e d c b a'],
      ['  leading and trailing  ', 'leading and\ttrailing'],
    ];
    for (const [a, b] of pairs) {
      const d = wordDiff(a, b);
      expect(side(d, 'insert')).toBe(a);
      expect(side(d, 'delete')).toBe(b);
      expect(d.every((s) => s.text.length > 0)).toBe(true);
      for (let i = 1; i < d.length; i++) expect(d[i]!.op).not.toBe(d[i - 1]!.op);
    }
  });
  it('falls back to a whole delete + insert when the texts are too large to align', () => {
    const big = Array.from({ length: Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10 }, (_, i) => `w${i}`).join(' ');
    const d = wordDiff(big, `${big} x`);
    expect(d).toEqual([{ op: 'delete', text: big }, { op: 'insert', text: `${big} x` }]);
  });
});
