import { describe, expect, it } from 'vitest';
import { offsetParam, one, uuidParam } from './search-params';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

describe('search params', () => {
  it('takes the first value, trimmed, and nothing when blank', () => {
    expect(one(['a ', 'b'])).toBe('a');
    expect(one('  ')).toBeUndefined();
    expect(one(undefined)).toBeUndefined();
  });
  it('accepts only a uuid', () => {
    expect(uuidParam({ c: ID }, 'c')).toBe(ID);
    expect(uuidParam({ c: 'nope' }, 'c')).toBeUndefined();
    expect(uuidParam({}, 'c')).toBeUndefined();
  });
  it('accepts a non-negative integer offset up to the cap, else 0', () => {
    expect(offsetParam({ offset: '40' })).toBe(40);
    expect(offsetParam({ offset: '5000' })).toBe(5000);
    expect(offsetParam({ offset: '5001' })).toBe(0);
    expect(offsetParam({ offset: '-1' })).toBe(0);
    expect(offsetParam({ offset: '1.5' })).toBe(0);
    expect(offsetParam({ offset: '9' }, 5)).toBe(0);
    expect(offsetParam({})).toBe(0);
  });
});
