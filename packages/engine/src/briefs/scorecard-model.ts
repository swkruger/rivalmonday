import type { ScorecardModel } from '@cs/email';
import type { Scorecard, ScorecardMetric } from './scorecard';

type Kind = 'rating' | 'count' | 'pct';
const KIND: Record<ScorecardMetric, Kind> = { rating: 'rating', reviews90d: 'count', replyRate: 'pct', mapTop3Share: 'pct', adsActive: 'count', metaAdsActive: 'count', googlePosts30d: 'count', listings: 'count', upcomingEvents: 'count', tripadvisorRating: 'rating', socialPosts30d: 'count' };
const TILE_LABEL: Record<string, string> = { rating: 'Rating', reviews90d: 'New reviews · 90 d', replyRate: 'Reply rate', mapTop3Share: 'Top-3 in map pack' };
const HEADER: Record<ScorecardMetric, string> = {
  rating: 'Rating', reviews90d: 'Reviews 90 d', replyRate: 'Reply rate', mapTop3Share: 'Map top-3', adsActive: 'Google ads', metaAdsActive: 'Meta ads',
  googlePosts30d: 'Google posts (30 days)', listings: 'Directory listings', upcomingEvents: 'Upcoming events', tripadvisorRating: 'Tripadvisor rating', socialPosts30d: 'Social posts (30 days)',
};
const COLUMNS: ScorecardMetric[] = ['rating', 'reviews90d', 'replyRate', 'mapTop3Share', 'adsActive', 'metaAdsActive', 'googlePosts30d', 'listings', 'upcomingEvents', 'tripadvisorRating', 'socialPosts30d'];
type Row = Scorecard['rows'][number];
/** 18d P6 / 18e P7: only these columns drop out when no row has a value (events: null or 0), so HVAC/dental scorecards look as before. */
const DROP_WHEN_EMPTY: Partial<Record<ScorecardMetric, (r: Row) => boolean>> = {
  upcomingEvents: (r) => (r.values.upcomingEvents ?? 0) === 0,
  tripadvisorRating: (r) => r.values.tripadvisorRating === null || r.values.tripadvisorRating === undefined,
  socialPosts30d: (r) => r.values.socialPosts30d === null || r.values.socialPosts30d === undefined,
};

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
  const columns = COLUMNS.filter((m) => !DROP_WHEN_EMPTY[m] || !s.rows.every(DROP_WHEN_EMPTY[m]));
  return {
    tiles: s.tiles.map((t) => {
      const kind = KIND[t.metric];
      return { label: TILE_LABEL[t.metric] ?? t.metric, value: formatMetric(kind, t.you), sub: `rivals ${formatMetric(kind, t.rivalMedian)} median`, ...trendOf(kind, t.deltaSinceStart) };
    }),
    table: {
      headers: ['Business', ...columns.map((m) => HEADER[m])],
      rows: s.rows.map((r) => ({
        cells: [r.self ? `${r.name || opts.clientName} (you)` : r.name, ...columns.map((m) => formatMetric(KIND[m], r.values[m] ?? null))],
        self: r.self, tier: r.tier,
      })),
    },
    openFirstMoves: s.openFirstMoves.map((m) => m.title),
  };
}
