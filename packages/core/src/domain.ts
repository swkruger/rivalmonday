export const CHANGE_TYPES = [
  'price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location',
  'hiring', 'ad_started', 'ad_stopped', 'review_spike', 'rating_change', 'rank_change', 'tier_change', 'content', 'cosmetic',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Display names of the competitor rating tiers (`competitor_signal.tier`); also the `tier_change` before/after text. */
export const TIER_LABELS = { top: 'Top rival', watch: 'Worth watching', minor: 'Minor' } as const;

/** Where a detected change came from: the `capture.source` of its evidence, or `rank` for tenant-private rank scans. */
export const CHANNELS = ['web', 'google_ads', 'meta_ads', 'google_business_profile', 'google_reviews', 'google_jobs', 'rank'] as const;
export type Channel = (typeof CHANNELS)[number];

export const MOVE_TYPES = [
  'territory_expansion', 'price_war', 'new_service_line', 'hiring_push', 'promo_blitz', 'reputation_slump', 'ad_surge', 'map_climb',
] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

/** Findings about the client's own business versus its rivals (Phase 12b starting point); their playbooks share the pack `playbooks` list. */
export const SELF_RULE_IDS = [
  'review_velocity_gap', 'reply_rate_gap', 'rating_gap', 'rival_only_advertiser', 'theme_weakness', 'theme_strength', 'map_visibility_gap', 'profile_gap',
] as const;
export type SelfRuleId = (typeof SELF_RULE_IDS)[number];

export const PAGE_TYPES = ['home', 'pricing', 'service', 'service_area', 'promo', 'careers', 'team', 'about', 'contact', 'blog', 'other'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const CAPTURE_STATUSES = ['ok', 'unchanged', 'blocked', 'robots_disallowed', 'vendor_error', 'timeout', 'error'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export const CADENCES = ['daily', 'weekly'] as const;
export type Cadence = (typeof CADENCES)[number];
