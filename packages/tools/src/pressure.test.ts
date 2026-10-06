import { describe, expect, it } from 'vitest';
import { combinePressure, moveWeight } from './pressure';

describe('combinePressure (decision 10)', () => {
  it('is quiet with no signals', () => {
    expect(combinePressure([])).toEqual({ score: 0, level: 'low', reasons: ['Quiet'] });
  });

  it('combines signals noisy-OR style, bounded at 100', () => {
    expect(combinePressure([{ weight: 0.5, label: 'Price change' }]).score).toBe(50);
    expect(combinePressure([{ weight: 0.5, label: 'Price change' }, { weight: 0.5, label: 'New ads' }]).score).toBe(75);
    expect(combinePressure(Array.from({ length: 20 }, () => ({ weight: 0.9, label: 'x' }))).score).toBe(100);
  });

  it('levels and names the two strongest distinct reasons', () => {
    const p = combinePressure([{ weight: 0.3, label: 'Hiring' }, { weight: 0.86, label: 'Price change' }, { weight: 0.6, label: 'Price change' }, { weight: 0.5, label: 'Ad surge' }]);
    expect(p.level).toBe('high');
    expect(p.reasons).toEqual(['Price change', 'Ad surge']);
    expect(combinePressure([{ weight: 0.45, label: 'Promo' }]).level).toBe('elevated');
  });

  it('weights moves by status', () => {
    expect(moveWeight('active', 1)).toBeCloseTo(0.8);
    expect(moveWeight('emerging', 1)).toBeCloseTo(0.5);
    expect(moveWeight('fading', 0.5)).toBeCloseTo(0.15);
  });
});
