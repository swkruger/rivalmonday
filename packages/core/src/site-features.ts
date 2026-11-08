/** Phase 18a-2: the website tools a rival can add or drop that we report (a `site_feature` change). */
export const SITE_FEATURE_CATEGORIES = ['online_booking', 'live_chat', 'financing', 'review_widget'] as const;
export type SiteFeatureCategory = (typeof SITE_FEATURE_CATEGORIES)[number];

export const SITE_FEATURE_CATEGORY_LABEL: Record<SiteFeatureCategory, string> = {
  online_booking: 'online booking',
  live_chat: 'live chat',
  financing: 'financing',
  review_widget: 'review widget',
};
