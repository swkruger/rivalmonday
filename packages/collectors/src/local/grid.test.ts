import { describe, expect, it } from 'vitest';
import { gridPoints } from './grid';

describe('gridPoints', () => {
  it('returns size×size points spanning the radius, centered', () => {
    const pts = gridPoints({ lat: 33.9, lng: -84.3 }, 10, 3);
    expect(pts).toHaveLength(9);
    expect(pts[4]).toEqual({ lat: 33.9, lng: -84.3 });
    const dLat = (pts[0]?.lat ?? 0) - 33.9;
    expect(Math.abs(dLat * 111.32)).toBeCloseTo(10, 0);
  });
  it('returns just the center for size 1', () => {
    expect(gridPoints({ lat: 1, lng: 2 }, 5, 1)).toEqual([{ lat: 1, lng: 2 }]);
  });
});
