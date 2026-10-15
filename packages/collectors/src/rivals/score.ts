import type { Tier } from '@cs/db';
import type { DiscoveryConfig } from '@cs/verticals';
import type { KeptCandidate } from './filters';
import type { Signals } from './signals';

/** Rank weight: rank 1 → 1, rank 4 → 0.5. */
export const rankWeight = (r: number) => 1 / (1 + (r - 1) / 3);
const w = rankWeight;

/** Overlap per placeId: presence normalised by the run's max presence, x category x distance factor. */
export function overlapScores(kept: KeptCandidate[], searches: number, radiusKm: number): Map<string, number> {
  const presence = kept.map((c) => c.ranks.reduce((s, r) => s + w(r), 0) / Math.max(1, searches));
  const max = Math.max(0, ...presence);
  const out = new Map<string, number>();
  kept.forEach((c, i) => {
    const d = c.distanceKm;
    const distanceFactor = d == null ? 0.75 : 1 - 0.5 * Math.min(1, d / Math.max(radiusKm, 1e-9));
    const norm = max > 0 ? presence[i]! / max : 0;
    out.set(c.placeId, norm * (c.categoryMatch === 'main' ? 1 : 0.5) * distanceFactor);
  });
  return out;
}

/** Null terms (not checked / unavailable) are dropped and the weights renormalised; all null -> null. */
export function activityScore(s: Signals, runMedianReviews30d: number): number | null {
  const terms: { weight: number; value: number }[] = [];
  // One of the two counts null (other known): the null side contributes 0 to the sum; both null drops the term.
  if (s.googleAdsActive != null || s.googleAdsNew30d != null) {
    terms.push({ weight: 0.35, value: Math.min(1, ((s.googleAdsActive ?? 0) + (s.googleAdsNew30d ?? 0)) / 5) });
  }
  if (s.metaAdsActive != null) terms.push({ weight: 0.25, value: Math.min(1, s.metaAdsActive / 3) });
  if (s.reviews30d != null) terms.push({ weight: 0.3, value: Math.min(1, s.reviews30d / Math.max(3, runMedianReviews30d * 2)) });
  if (s.claimed != null) terms.push({ weight: 0.1, value: s.claimed ? 1 : 0 });
  if (terms.length === 0) return null;
  const total = terms.reduce((a, t) => a + t.weight, 0);
  return terms.reduce((a, t) => a + t.weight * t.value, 0) / total;
}

/** With activity null only overlap counts, so the best possible tier is 'watch'. */
export function tierFor(overlap: number, activity: number | null, t: DiscoveryConfig['tiers']): Tier {
  if (activity != null && overlap >= t.top.overlap && activity >= t.top.activity) return 'top';
  if (overlap >= t.watch.overlap || (activity != null && activity >= t.watch.activity)) return 'watch';
  return 'minor';
}

/** Median of the known values; 0 when there are none (the Activity review term then uses its floor of 3). */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
