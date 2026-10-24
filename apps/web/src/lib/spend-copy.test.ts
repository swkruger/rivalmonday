import { describe, expect, it } from 'vitest';
import { askQuotaText, longDate } from './spend-copy';

describe('longDate', () => {
  const now = new Date('2026-12-14T12:00:00Z');
  it('omits the year in the current year', () => {
    expect(longDate('2026-11-01T00:00:00Z', now)).toBe('November 1');
  });
  it('matches the C6 email label for a December pause (January 1, 2027)', () => {
    expect(longDate('2027-01-01T00:00:00Z', now)).toBe('January 1, 2027');
  });
});

describe('askQuotaText', () => {
  it('quota 0 says Ask is turned off by limit', () => {
    expect(askQuotaText({ used: 4, quota: 0 })).toBe('4 used · Ask turned off by limit');
  });
  it('otherwise used of quota', () => {
    expect(askQuotaText({ used: 4, quota: 50 })).toBe('4 of 50');
  });
});
