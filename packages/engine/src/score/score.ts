import type { ChangeType } from '@cs/core';
import type { NumericChange, ScoreFactors, ScoreThresholds } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';

export type Route = 'alert' | 'brief' | 'archive';

export interface ScoreInput {
  changeType: ChangeType;
  facts: NumericChange[];
  serviceId: string | null;
  zips: string[];
  needsReview: boolean;
  maxSimilarity: number | null;
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
  if (input.changeType === 'price_change') {
    const pcts = input.facts.filter((f) => f.kind === 'price' && f.pct !== null).map((f) => Math.abs(f.pct!));
    if (pcts.length > 0) return clamp(Math.max(...pcts) / s.price_pct_for_full, s.price_min, 1);
  }
  return s.default;
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

export function scoreForClient(input: ScoreInput, profile: ClientProfile, pack: VerticalPack): { score: number; route: Route; factors: ScoreFactors } {
  const typeWeight = pack.type_weights[input.changeType];
  const size = sizeFactor(input, pack);
  const svc = serviceOverlap(input.serviceId, profile.services, pack);
  const territory = TERRITORIAL_TYPES.has(input.changeType) ? territoryOverlap(input.zips, profile.zips, pack) : 1;
  const relevance = svc * territory;
  const novelty = noveltyFactor(input.maxSimilarity, pack);
  const score = Math.round(100 * typeWeight * size * relevance * novelty * 10) / 10;
  const thresholds = profile.thresholds ?? pack.scoring.routing;
  let route: Route = score >= thresholds.alert ? 'alert' : score >= thresholds.brief ? 'brief' : 'archive';
  const needsReviewCap = input.needsReview && route === 'alert';
  if (needsReviewCap) route = 'brief';
  return {
    score,
    route,
    factors: {
      typeWeight, size, serviceOverlap: svc, territoryOverlap: territory, relevance, novelty, maxSimilarity: input.maxSimilarity,
      needsReviewCap, thresholds: { alert: thresholds.alert, brief: thresholds.brief }, scoringVersion: pack.scoring.version,
    },
  };
}
