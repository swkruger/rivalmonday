import { describe, expect, it } from 'vitest';
import { nextMonthLabel } from './spend-guard';

describe('nextMonthLabel', () => {
  it('names the next month and the 1st', () => {
    expect(nextMonthLabel(new Date('2026-10-14T12:00:00Z'))).toBe('November 1');
  });
  it('adds the year when the pause lifts in January (a December pause)', () => {
    expect(nextMonthLabel(new Date('2026-12-14T12:00:00Z'))).toBe('January 1, 2027');
  });
});
