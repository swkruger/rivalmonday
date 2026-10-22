import { describe, expect, it } from 'vitest';
import { formatMiles, formatMilesAway, kmToMiles, milesToKm, radiusChoiceForKm, radiusKmFromMiles, radiusOptions } from './distance';

describe('distance', () => {
  it('kmToMiles/milesToKm round trip', () => {
    expect(kmToMiles(milesToKm(7))).toBeCloseTo(7, 10);
    expect(milesToKm(1)).toBeCloseTo(1.609344, 6);
  });
  it('formatMiles under and over 1 mile', () => {
    expect(formatMiles(0.64)).toBe('0.4 mi');
    expect(formatMiles(4.83)).toBe('3 mi');
    expect(formatMiles(16.1)).toBe('10 mi');
  });
  it('formatMilesAway keeps one decimal under 10 mi', () => {
    expect(formatMilesAway(3.7)).toBe('2.3 mi');
    expect(formatMilesAway(20)).toBe('12 mi');
  });
  it('radiusKmFromMiles(25) is 40', () => {
    expect(radiusKmFromMiles(25)).toBe(40);
    expect(radiusKmFromMiles(10)).toBe(16.1);
  });
  it('radiusChoiceForKm(8) is 5', () => {
    expect(radiusChoiceForKm(8)).toBe(5);
  });
  it('radiusChoiceForKm(7) is null', () => {
    expect(radiusChoiceForKm(7)).toBeNull();
  });
  it('radiusOptions adds a custom first option only for unmatched values', () => {
    expect(radiusOptions(8)[0]).toEqual({ value: '3.2', label: '2 mi' });
    const o = radiusOptions(7);
    expect(o[0]).toEqual({ value: '7', label: '≈ 4 mi (custom)' });
    expect(o).toHaveLength(8);
  });
});
