import { describe, expect, it } from 'vitest';
import { SITE_FEATURE_CATEGORIES, SITE_FEATURE_CATEGORY_LABEL } from './site-features';
import { CADENCES, CAPTURE_STATUSES, CHANGE_TYPES, CHANNELS, MOVE_TYPES, PAGE_TYPES } from './domain';

describe('domain constants', () => {
  it('lists the spec change types plus rank_change (Phase 3b)', () => {
    expect(CHANGE_TYPES).toEqual([
      'price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location',
      'hiring', 'ad_started', 'ad_stopped', 'review_spike', 'rating_change', 'rank_change', 'tier_change', 'content', 'cosmetic',
      'status_change', 'profile_change', 'audience_growth', 'site_feature', 'new_page',
    ]);
  });

  it('lists the channels a change can come from (capture sources plus rank scans)', () => {
    expect(CHANNELS).toEqual(['web', 'google_ads', 'meta_ads', 'google_business_profile', 'google_reviews', 'google_jobs', 'rank']);
  });

  it('lists the spec move types', () => {
    expect(MOVE_TYPES).toEqual([
      'territory_expansion', 'price_war', 'new_service_line', 'hiring_push', 'promo_blitz', 'reputation_slump', 'ad_surge', 'map_climb',
    ]);
  });
});

describe('site feature categories', () => {
  it('lists the categories and gives each a label', () => {
    expect(SITE_FEATURE_CATEGORIES).toEqual(['online_booking', 'live_chat', 'financing', 'review_widget']);
    expect(SITE_FEATURE_CATEGORY_LABEL).toEqual({ online_booking: 'online booking', live_chat: 'live chat', financing: 'financing', review_widget: 'review widget' });
  });
});

describe('collection constants', () => {
  it('lists page types, capture statuses and cadences', () => {
    expect(PAGE_TYPES).toEqual(['home', 'pricing', 'service', 'service_area', 'promo', 'careers', 'team', 'about', 'contact', 'blog', 'other']);
    expect(CAPTURE_STATUSES).toEqual(['ok', 'unchanged', 'blocked', 'robots_disallowed', 'vendor_error', 'timeout', 'error']);
    expect(CADENCES).toEqual(['daily', 'weekly']);
  });
});
