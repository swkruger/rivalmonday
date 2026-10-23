import { describe, expect, it } from 'vitest';
import { KM_PER_MILE } from './index';

describe('units', () => {
  it('KM_PER_MILE is 1.609344', () => {
    expect(KM_PER_MILE).toBe(1.609344);
  });
});
