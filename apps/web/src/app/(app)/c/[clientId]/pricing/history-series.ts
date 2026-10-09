import type { PriceHistoryView } from '@cs/tools';
import { type ChartSeries, foldSeries } from '@/components/charts/line-chart';

/** Prices are not additive: the folded competitors show the lowest price. (The view holds tracked competitors only, so nothing is pinned.) */
export function historySeries(history: PriceHistoryView): ChartSeries[] {
  return foldSeries(history.series.map((s) => ({ key: s.competitorId, name: s.name, points: s.points })), 5, { aggregate: 'min', label: 'Other (lowest)' });
}
