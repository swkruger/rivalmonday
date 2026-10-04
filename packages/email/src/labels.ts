/** Reader-facing names for change types (shared by alert templates and the quarterly trend report). */
export const CHANGE_LABELS: Record<string, string> = {
  price_change: 'price change', promo: 'new promotion', new_service: 'new service', service_removed: 'service removed',
  service_area_change: 'service area change', new_location: 'new location', hiring: 'hiring', ad_started: 'new ads', ad_stopped: 'ads stopped',
  review_spike: 'complaint spike in reviews', rating_change: 'rating change', rank_change: 'local ranking change', content: 'website change', cosmetic: 'minor change',
};

/** "price_change" → "Price change"; an unknown key is humanised instead of printed raw. */
export const changeTypeLabel = (type: string): string => {
  const s = CHANGE_LABELS[type] ?? type.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
