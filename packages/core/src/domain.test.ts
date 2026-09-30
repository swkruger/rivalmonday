import { describe, expect, it } from 'vitest';
import { CHANGE_TYPES, MOVE_TYPES } from './domain';

describe('domain constants', () => {
  it('lists the spec change types', () => {
    expect(CHANGE_TYPES).toEqual([
      'price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location',
      'hiring', 'ad_started', 'ad_stopped', 'review_spike', 'rating_change', 'content', 'cosmetic',
    ]);
  });

  it('lists the spec move types', () => {
    expect(MOVE_TYPES).toEqual([
      'territory_expansion', 'price_war', 'new_service_line', 'hiring_push', 'promo_blitz', 'reputation_slump', 'ad_surge',
    ]);
  });
});
