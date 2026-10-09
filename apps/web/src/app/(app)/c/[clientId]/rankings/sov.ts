import type { ShareOfVoiceView } from '@cs/tools';
import { type ChartSeries, foldSeries } from '@/components/charts/line-chart';

const pct = (points: (number | null)[]) => points.map((v) => (v === null ? null : Math.round(v * 1000) / 10));

/** Decision 10: you first (slot 1), then the three largest others name-sorted, the rest folded into "Other" — at most 5 lines. */
export function sovSeries(view: ShareOfVoiceView): ChartSeries[] {
  const self = view.series.filter((s) => s.self).map((s) => ({ key: s.key, name: 'You', points: pct(s.points) }));
  const others = view.series.filter((s) => !s.self).map((s) => ({ key: s.key, name: s.name, points: pct(s.points) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [...self, ...foldSeries(others, self.length ? 4 : 5)];
}
