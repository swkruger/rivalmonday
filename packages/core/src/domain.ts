export const CHANGE_TYPES = [
  'price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location',
  'hiring', 'ad_started', 'ad_stopped', 'review_spike', 'rating_change', 'content', 'cosmetic',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const MOVE_TYPES = [
  'territory_expansion', 'price_war', 'new_service_line', 'hiring_push', 'promo_blitz', 'reputation_slump', 'ad_surge',
] as const;
export type MoveType = (typeof MOVE_TYPES)[number];
