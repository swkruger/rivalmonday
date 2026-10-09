import type { RatingTrendView } from '@cs/tools';
import { type ChartSeries, foldSeries } from '@/components/charts/line-chart';

/** Average stars are not additive: "You" is pinned and the folded rivals are averaged. */
export function trendSeries(trend: RatingTrendView): ChartSeries[] {
  const series = [...trend.businesses].sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((b) => ({ key: b.competitorId, name: b.self ? 'You' : b.name, points: b.monthly.map((m) => m.avgRating), self: b.self }));
  const pin = series.filter((s) => s.self).map((s) => s.key);
  return foldSeries(series.map(({ key, name, points }) => ({ key, name, points })), 5, { aggregate: 'mean', pin, label: 'Other (average)' });
}
