import { describe, expect, it } from 'vitest';
import { brandLeaks, PLATFORM_BRAND_RE } from './white-label';

describe('brandLeaks', () => {
  it('brandLeaks finds each pattern; clean text → []', () => {
    for (const s of ['Rival Monday', 'rival-monday', 'RIVAL  MONDAY', 'rivalmonday.app', 'RivalMonday']) {
      expect(PLATFORM_BRAND_RE.test(s), s).toBe(true);
      expect(brandLeaks(s), s).not.toEqual([]);
    }
    expect(brandLeaks('<span data-part="monday">m</span>')).toHaveLength(1);
    expect(brandLeaks('<svg data-slot="radar-mark"></svg>')).toHaveLength(1);
    expect(brandLeaks('<link rel="icon" href="/brand/favicon.svg">')).toHaveLength(1);
    expect(brandLeaks('Cool Agency weekly brief. Rivals on Monday.')).toEqual([]);
    expect(brandLeaks('')).toEqual([]);
  });
});
