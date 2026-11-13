/** Reader-facing names for change types (shared by alert templates and the quarterly trend report). */
export const CHANGE_LABELS: Record<string, string> = {
  price_change: 'price change', promo: 'new promotion', new_service: 'new service', service_removed: 'service removed',
  service_area_change: 'service area change', new_location: 'new location', hiring: 'hiring', ad_started: 'new ads', ad_stopped: 'ads stopped',
  review_spike: 'complaint spike in reviews', rating_change: 'rating change', rank_change: 'ranking change', tier_change: 'competitor tier change', content: 'website change', cosmetic: 'minor change',
  status_change: 'opening status change', profile_change: 'profile change', audience_growth: 'audience growth',
  site_feature: 'website tool change', new_page: 'new website page', citation_added: 'new directory listing',
  event_listed: 'event update',
};

/** "price_change" → "Price change"; an unknown key is humanised instead of printed raw. */
export const changeTypeLabel = (type: string): string => {
  const s = CHANGE_LABELS[type] ?? type.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Plural group phrase per change type, used when a line merges 2+ events ("3 price changes"). */
export const GROUP_PHRASE: Record<string, (channel: string | null) => string> = {
  price_change: () => 'price changes',
  promo: () => 'new promotions',
  new_service: () => 'new services',
  service_removed: () => 'services removed',
  service_area_change: () => 'service area changes',
  new_location: () => 'new locations',
  hiring: () => 'new job posts',
  ad_started: (c) => (c === 'google_ads' ? 'Google ads started' : c === 'meta_ads' ? 'Meta ads started' : 'new ads'),
  ad_stopped: (c) => (c === 'google_ads' ? 'Google ads stopped' : c === 'meta_ads' ? 'Meta ads stopped' : 'ads stopped'),
  review_spike: () => 'complaint spikes in reviews',
  rating_change: () => 'rating changes',
  rank_change: () => 'ranking changes',
  tier_change: () => 'tier changes',
  content: () => 'website changes',
  status_change: () => 'opening status changes',
  profile_change: () => 'profile changes',
  audience_growth: () => 'audience growth updates',
  site_feature: () => 'website tool changes',
  new_page: () => 'new website pages',
  citation_added: () => 'new directory listings',
  event_listed: () => 'event updates',
};

/** "3 price changes"; an unmapped type falls back to "<label> changes" (label lower-cased, or the humanised type). */
export const groupPhrase = (type: string, channel: string | null, count: number): string => {
  const f = GROUP_PHRASE[type];
  if (f) return `${count} ${f(channel)}`;
  const label = (CHANGE_LABELS[type] ?? type.replace(/_/g, ' ')).toLowerCase();
  return `${count} ${label} changes`;
};

/** "less than a day" (≤ 0), "about 1 day", "about N days": the rounded days-left phrase shared by the platform cost strip and email. */
export const approxDaysText = (days: number): string => {
  const n = Math.round(days);
  if (n <= 0) return 'less than a day';
  return n === 1 ? 'about 1 day' : `about ${n} days`;
};
