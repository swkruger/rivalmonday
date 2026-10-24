import { describe, expect, it } from 'vitest';
import { formatCount } from './number';

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount(0)).toBe('0');
  });
  it('shows up to 2 decimals only for fractional values', () => {
    expect(formatCount(1234.5678)).toBe('1,234.57');
    expect(formatCount(2.5)).toBe('2.5');
  });
});
