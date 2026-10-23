import { describe, expect, it } from 'vitest';
import { SPEND_NEAR_RATIO, spendLevel, usdToCredits } from './spend';

describe('usdToCredits', () => {
  it('rounds usd × rate to an integer', () => {
    expect(usdToCredits(1.234, 100)).toBe(123);
    expect(usdToCredits(0.005, 100)).toBe(1);
    expect(usdToCredits(15, 100)).toBe(1500);
    expect(usdToCredits(0, 100)).toBe(0);
  });
});

describe('spendLevel', () => {
  it('is near at 80 %, reached at 100 %, paused when set (paused wins)', () => {
    expect(SPEND_NEAR_RATIO).toBe(0.8);
    expect(spendLevel(11.99, 15, null)).toBe('ok');
    expect(spendLevel(12, 15, null)).toBe('near');
    expect(spendLevel(14.99, 15, null)).toBe('near');
    expect(spendLevel(15, 15, null)).toBe('reached');
    expect(spendLevel(1, 15, new Date())).toBe('paused');
    expect(spendLevel(1, 15, '2026-10-01T00:00:00Z')).toBe('paused');
  });
});
