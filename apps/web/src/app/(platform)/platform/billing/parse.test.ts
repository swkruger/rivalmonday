import { describe, expect, it } from 'vitest';
import { endOfDayIso, parseTierRows, toCents, toFeatures, toInt, toPercent } from './parse';

describe('toCents', () => {
  it.each([['229.99', 22999], ['0.1', 10], ['229', 22900], ['0', 0]])('%s -> %s', (v, c) => expect(toCents(v as string)).toBe(c));
  it.each(['1,000', '-5', '', '.5', '12.345', '1e2', '0x10', 'NaN', ' 5'])('rejects %j', (v) => expect(toCents(v)).toBeNull());
});

describe('toInt / toPercent', () => {
  it('accept plain digits', () => {
    expect(toInt('30')).toBe(30);
    expect(toPercent('12.5')).toBe(12.5);
  });
  it.each(['', 'NaN', '1e2', '0x10', '-1', '1.5'])('toInt rejects %j', (v) => expect(toInt(v)).toBeNull());
  it.each(['', 'NaN', '1e2', '0x10', '-1', '.5'])('toPercent rejects %j', (v) => expect(toPercent(v)).toBeNull());
});

describe('endOfDayIso', () => {
  it('maps a real date to the end of that UTC day', () => expect(endOfDayIso('2026-11-30')).toBe('2026-11-30T23:59:59.000Z'));
  it.each(['', '2026-1-3', '11/30/2026', '2026-02-31', '2026-13-01'])('rejects %j', (v) => expect(endOfDayIso(v)).toBeNull());
});

describe('toFeatures', () => {
  it('keeps checked known features in a fixed order and drops the rest', () => {
    expect(toFeatures(['mcp', 'ask', 'ask', 'bogus'])).toEqual(['ask', 'mcp']);
    expect(toFeatures(['mcp'])).toEqual(['mcp']);
    expect(toFeatures([])).toEqual([]);
  });
});

describe('parseTierRows', () => {
  const rows = (...r: [string, string][]) => r.map(([from, price]) => ({ from, price }));
  it('rows 4–10 $79 and 11+ $59 with 3 included → v2 tiers', () => {
    expect(parseTierRows(rows(['4', '79'], ['11', '59']), 3)).toEqual({ ok: true, tiers: [{ upTo: 7, unitCents: 7900 }, { upTo: null, unitCents: 5900 }] });
  });
  it('one row is a flat price; blank rows are skipped', () => {
    expect(parseTierRows(rows(['4', '49'], ['', ''], ['', '']), 3)).toEqual({ ok: true, tiers: [{ upTo: null, unitCents: 4900 }] });
  });
  it.each([
    [rows(['', '']), 3],
    [rows(['5', '79']), 3],
    [rows(['4', '79'], ['4', '59']), 3],
    [rows(['4', '79'], ['x', '59']), 3],
    [rows(['4', '7,9']), 3],
  ])('rejects %j', (r, n) => expect(parseTierRows(r, n).ok).toBe(false));
});
