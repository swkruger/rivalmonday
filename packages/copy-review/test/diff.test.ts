import { describe, expect, it } from 'vitest';
import { wordDiff } from '../src/diff.js';

describe('wordDiff', () => {
  it('wordDiff marks one replaced word', () => {
    expect(wordDiff('Save your seat today', 'Save your spot today')).toEqual([
      { op: 'eq', text: 'Save your' }, { op: 'del', text: 'seat' }, { op: 'add', text: 'spot' }, { op: 'eq', text: 'today' },
    ]);
  });
  it('identical text is one eq run', () => {
    expect(wordDiff('a b', 'a  b')).toEqual([{ op: 'eq', text: 'a b' }]);
  });
});
