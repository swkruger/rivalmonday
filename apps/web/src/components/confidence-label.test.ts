import { describe, expect, it } from 'vitest';
import { confidenceLabel, HIGH_CONFIDENCE } from './confidence-label';

describe('confidenceLabel', () => {
  it('is "High confidence" at and above the amber-border threshold, plain "Confidence" below', () => {
    expect(HIGH_CONFIDENCE).toBe(0.85);
    expect(confidenceLabel(0.85)).toEqual({ high: true, text: 'High confidence 85%' });
    expect(confidenceLabel(0.9)).toEqual({ high: true, text: 'High confidence 90%' });
    expect(confidenceLabel(0.84)).toEqual({ high: false, text: 'Confidence 84%' });
    expect(confidenceLabel(0.5)).toEqual({ high: false, text: 'Confidence 50%' });
  });
});
