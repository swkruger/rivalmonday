// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushRecent, readIds, togglePin, writeIds } from './switcher-storage';

const M = 'mem-1';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('switcher storage (spec §2.4: browser storage, every access in try/catch)', () => {
  it('readIds returns [] for a missing key, non-JSON, non-array JSON and drops non-string entries', () => {
    expect(readIds('k')).toEqual([]);
    localStorage.setItem('k', '{not json');
    expect(readIds('k')).toEqual([]);
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    expect(readIds('k')).toEqual([]);
    localStorage.setItem('k', JSON.stringify('abc'));
    expect(readIds('k')).toEqual([]);
    localStorage.setItem('k', JSON.stringify(['a', 3, null, 'b', { x: 1 }]));
    expect(readIds('k')).toEqual(['a', 'b']);
  });

  it('readIds and writeIds swallow a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(readIds('k')).toEqual([]);
    expect(() => writeIds('k', ['a'])).not.toThrow();
    expect(() => pushRecent(M, 'c1')).not.toThrow();
    expect(togglePin(M, 'c1')).toEqual(['c1']);
  });

  it('writeIds caps the list at max', () => {
    writeIds('k', ['a', 'b', 'c'], 2);
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual(['a', 'b']);
  });

  it('pushRecent keeps the newest first, de-duplicated, at most 5, per membership', () => {
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) pushRecent(M, id);
    pushRecent(M, 'c4');
    expect(readIds(`rm.switcher.recent.${M}`)).toEqual(['c4', 'c6', 'c5', 'c3', 'c2']);
    expect(readIds('rm.switcher.recent.other')).toEqual([]);
  });

  it('togglePin adds then removes an id and returns the new list', () => {
    expect(togglePin(M, 'c1')).toEqual(['c1']);
    expect(togglePin(M, 'c2')).toEqual(['c1', 'c2']);
    expect(togglePin(M, 'c1')).toEqual(['c2']);
    expect(readIds(`rm.switcher.pins.${M}`)).toEqual(['c2']);
  });
});
