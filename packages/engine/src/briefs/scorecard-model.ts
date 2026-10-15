import type { ScorecardModel } from '@cs/email';
import type { Scorecard, ScorecardMetric } from './scorecard';

type Kind = 'rating' | 'count' | 'pct';
const KIND: Record<ScorecardMetric, Kind> = { rating: 'rating', reviews90d: 'count', replyRate: 'pct', mapTop3Share: 'pct', adsActive: 'count', metaAdsActive: 'count' };
const TILE_LABEL: Record<string, string> = { rating: 'Rating', reviews90d: 'New reviews · 90 d', replyRate: 'Reply rate', mapTop3Share: 'Top-3 in map pack' };
const HEADERS = ['Business', 'Rating', 'Reviews 90 d', 'Reply rate', 'Map top-3', 'Google ads', 'Meta ads'];
const COLUMNS: ScorecardMetric[] = ['rating', 'reviews90d', 'replyRate', 'mapTop3Share', 'adsActive', 'metaAdsActive'];

/** Rating: one decimal unless a second is needed ("4.6", "4.65"); percentages are whole numbers; counts are integers; null is "—". */
export function formatMetric(kind: Kind, v: number | null): string {
  if (v === null) return '—';
  if (kind === 'pct') return `${Math.round(v * 100)}%`;
  if (kind === 'count') return String(Math.round(v));
  const r = Math.round(v * 100) / 100;
  return Math.round(r * 10) / 10 === r ? r.toFixed(1) : r.toFixed(2);
}

function trendOf(kind: Kind, delta: number | null): { trend: 'up' | 'down' | null; trendText: string | null } {
  if (delta === null) return { trend: null, trendText: null };
  const mag = kind === 'pct' ? Math.round(Math.abs(delta) * 100) : kind === 'count' ? Math.round(Math.abs(delta)) : Math.round(Math.abs(delta) * 100) / 100;
  if (mag === 0) return { trend: null, trendText: 'No change since your starting point' };
  const text = kind === 'pct' ? `${mag} pts` : kind === 'rating' ? formatMetric('rating', mag) : String(mag);
  return delta > 0 ? { trend: 'up', trendText: `▲ ${text} since your starting point` } : { trend: 'down', trendText: `▼ ${text} since your starting point` };
}

/** The shared display model for the starting-point and quiet-week scorecard (web, email and PDF all render this). All four tiles are higher-is-better. */
export function scorecardModel(s: Scorecard, opts: { clientName: string }): ScorecardModel {
  return {
    tiles: s.tiles.map((t) => {
      const kind = KIND[t.metric];
      return { label: TILE_LABEL[t.metric] ?? t.metric, value: formatMetric(kind, t.you), sub: `rivals ${formatMetric(kind, t.rivalMedian)} median`, ...trendOf(kind, t.deltaSinceStart) };
    }),
    table: {
      headers: HEADERS,
      rows: s.rows.map((r) => ({
        cells: [r.self ? `${r.name || opts.clientName} (you)` : r.name, ...COLUMNS.map((m) => formatMetric(KIND[m], r.values[m] ?? null))],
        self: r.self, tier: r.tier,
      })),
    },
    openFirstMoves: s.openFirstMoves.map((m) => m.title),
  };
}
