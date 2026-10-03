import type { ChangeType } from '@cs/core';
import type { ChangeDetails, NumericChange, ScoreFactors, ScoreThresholds } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';

export type Route = 'alert' | 'brief' | 'archive';

export interface ScoreInput {
  changeType: ChangeType;
  facts: NumericChange[];
  serviceId: string | null;
  zips: string[];
  needsReview: boolean;
  maxSimilarity: number | null;
  details: ChangeDetails;
  /** Days between the event and the scoring run. */
  ageDays: number;
}

export interface ClientProfile {
  services: string[];
  zips: string[];
  thresholds: ScoreThresholds | null;
}

/**
 * Change types whose ZIP codes describe territory. For any other type a 5-digit number is far more
 * likely a model number or a capacity ("36000 BTU") than a ZIP, so territory does not apply (= 1).
 */
export const TERRITORIAL_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['service_area_change', 'new_location']);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function sizeFactor(input: ScoreInput, pack: VerticalPack): number {
  const s = pack.scoring.size;
  const d = input.details;
  const curve = (x: number | undefined | null, full: number) =>
    x === undefined || x === null || Number.isNaN(x) ? s.default : clamp(Math.abs(x) / full, s.structured_min, 1);
  switch (input.changeType) {
    case 'price_change': {
      const pcts = input.facts.filter((f) => f.kind === 'price' && f.pct !== null).map((f) => Math.abs(f.pct!));
      return pcts.length > 0 ? clamp(Math.max(...pcts) / s.price_pct_for_full, s.price_min, 1) : s.default;
    }
    case 'ad_started':
    case 'ad_stopped':
      return curve(d.count, s.ads_for_full);
    case 'hiring':
      return curve(d.count, s.jobs_for_full);
    case 'review_spike':
      return curve(d.z, s.review_z_for_full);
    case 'rating_change':
      return curve(d.ratingBefore !== undefined && d.ratingAfter !== undefined ? d.ratingAfter - d.ratingBefore : undefined, s.rating_delta_for_full);
    case 'rank_change':
      return curve(d.avgRankBefore !== undefined && d.avgRankAfter !== undefined ? d.avgRankBefore - d.avgRankAfter : undefined, s.rank_delta_for_full);
    default:
      return s.default;
  }
}

export function serviceOverlap(serviceId: string | null, clientServices: string[], pack: VerticalPack): number {
  const r = pack.scoring.relevance;
  if (clientServices.length === 0) return 1;
  if (!serviceId) return r.unmapped;
  return clientServices.includes(serviceId) ? r.matched : r.unmatched;
}

export function territoryOverlap(eventZips: string[], clientZips: string[], pack: VerticalPack): number {
  if (eventZips.length === 0 || clientZips.length === 0) return 1;
  return eventZips.some((z) => clientZips.includes(z)) ? 1 : pack.scoring.relevance.outside_territory;
}

/** Spec §6.3 novelty = 1 − max_similarity, rescaled so similarity at or below the floor counts as fully novel. */
export function noveltyFactor(maxSimilarity: number | null, pack: VerticalPack): number {
  if (maxSimilarity === null) return 1;
  const floor = pack.scoring.novelty_similarity_floor;
  return clamp((1 - maxSimilarity) / (1 - floor), 0, 1);
}

/** Phase 3d decision 13: numbers, 0 ≤ brief < alert ≤ 100 (the DB CHECK enforces the same on client rows). */
export function validThresholds(t: ScoreThresholds | null | undefined): t is ScoreThresholds {
  return !!t && Number.isFinite(t.alert) && Number.isFinite(t.brief) && t.brief >= 0 && t.alert <= 100 && t.brief < t.alert;
}

export function scoreForClient(input: ScoreInput, profile: ClientProfile, pack: VerticalPack): { score: number; route: Route; factors: ScoreFactors } {
  const typeWeight = pack.type_weights[input.changeType];
  const size = sizeFactor(input, pack);
  const svc = serviceOverlap(input.serviceId, profile.services, pack);
  const territory = TERRITORIAL_TYPES.has(input.changeType) ? territoryOverlap(input.zips, profile.zips, pack) : 1;
  const relevance = svc * territory;
  const novelty = noveltyFactor(input.maxSimilarity, pack);
  const score = Math.round(100 * typeWeight * size * relevance * novelty * 10) / 10;
  if (profile.thresholds && !validThresholds(profile.thresholds)) console.warn('[engine] invalid client score thresholds; using the pack routing', profile.thresholds);
  const thresholds = validThresholds(profile.thresholds) ? profile.thresholds : pack.scoring.routing;
  let route: Route = score >= thresholds.alert ? 'alert' : score >= thresholds.brief ? 'brief' : 'archive';
  const needsReviewCap = input.needsReview && route === 'alert';
  if (needsReviewCap) route = 'brief';
  const staleCap = route === 'alert' && input.ageDays > pack.scoring.alert_max_age_days;
  if (staleCap) route = 'brief';
  return {
    score,
    route,
    factors: {
      typeWeight, size, serviceOverlap: svc, territoryOverlap: territory, relevance, novelty, maxSimilarity: input.maxSimilarity,
      needsReviewCap, staleCap, thresholds: { alert: thresholds.alert, brief: thresholds.brief }, scoringVersion: pack.scoring.version,
    },
  };
}
