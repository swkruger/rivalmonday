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

/**
 * brief-signal D2/P1: change types that describe the whole business, so "no service for the client's vertical" is not a
 * sign the tagger failed. They score with `scoring.relevance.whole_business` instead of `unmapped`.
 * - review_spike, rating_change: reviews and rating are about the business; the tag stage never maps a service.
 * - new_location: a new address or location page is the whole business; territory still applies (TERRITORIAL_TYPES).
 * - ad_started, ad_stopped: service-mapped by the tag stage; "none" = a branding or general ad = the whole business.
 * - hiring: service-mapped; "none" = general hiring (capacity of the whole business).
 * - rank_change: keyword to service by phrase; no match = a generic keyword ("hvac company near me").
 * Excluded: content (shared with web page edits; no service = generic copy), tier_change (deterministic score, P10),
 * and the service-specific types (price_change, promo, new_service, service_removed, service_area_change, cosmetic).
 */
export const WHOLE_BUSINESS_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['ad_started', 'ad_stopped', 'hiring', 'rank_change', 'review_spike', 'rating_change', 'new_location', 'status_change', 'profile_change', 'audience_growth', 'citation_added', 'site_feature', 'new_page', 'event_listed']);

/** Phase 18a-2: website changes are brief news only; they never page anyone. 18d D9: nor do listed events. */
export const BRIEF_ONLY_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['site_feature', 'new_page', 'event_listed']);

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
      if (d.surface === 'organic') return d.direction === 'entered' ? 1 : s.default; // 18b-2: a rival newly on page one is a full-size move, an exit a default one
      return curve(d.avgRankBefore !== undefined && d.avgRankAfter !== undefined ? d.avgRankBefore - d.avgRankAfter : undefined, s.rank_delta_for_full);
    case 'status_change':
      return d.direction === 'closed' ? 1 : s.default;
    case 'audience_growth':
      return curve(d.pct, s.audience_pct_for_full);
    case 'event_listed': // 18d D9: a ticketed announcement is full size; the aggregate scales with its count
      if (!d.eventKey) return curve(d.count, s.events_for_full);
      return d.lifecycle === 'announced' && d.ticketed === true ? 1 : s.default;
    default:
      return s.default;
  }
}

/** 18b-1: a Google post offer is service-mapped like an ad, so "no service" = a general offer = the whole business. Web promos stay as they were. */
export const isPostOffer = (changeType: ChangeType, details: ChangeDetails | undefined): boolean => changeType === 'promo' && details?.field === 'post';

export function serviceOverlap(serviceId: string | null, clientServices: string[], pack: VerticalPack, changeType: ChangeType, details?: ChangeDetails): { value: number; wholeBusiness: boolean } {
  const r = pack.scoring.relevance;
  if (clientServices.length === 0) return { value: 1, wholeBusiness: false };
  if (serviceId) return { value: clientServices.includes(serviceId) ? r.matched : r.unmatched, wholeBusiness: false };
  if (WHOLE_BUSINESS_TYPES.has(changeType) || isPostOffer(changeType, details)) return { value: r.whole_business, wholeBusiness: true };
  return { value: r.unmapped, wholeBusiness: false };
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

const TIER_RANK = { minor: 0, watch: 1, top: 2 } as const;

const isTierPromotion = (d: ChangeDetails): boolean => !!d.from && !!d.to && TIER_RANK[d.to] > TIER_RANK[d.from];

function tierChangeScore(d: ChangeDetails, t: ScoreThresholds): number {
  if (!isTierPromotion(d)) return 0;
  return d.to === 'top' ? t.alert : t.brief;
}

export function scoreForClient(input: ScoreInput, profile: ClientProfile, pack: VerticalPack): { score: number; route: Route; factors: ScoreFactors } {
  const typeWeight = pack.type_weights[input.changeType];
  const size = sizeFactor(input, pack);
  const svc = serviceOverlap(input.serviceId, profile.services, pack, input.changeType, input.details);
  const territory = TERRITORIAL_TYPES.has(input.changeType) ? territoryOverlap(input.zips, profile.zips, pack) : 1;
  const relevance = svc.value * territory;
  // Phase 18a-1: a closure is always news, so novelty never discounts it.
  const novelty = input.changeType === 'status_change' && input.details.direction === 'closed' ? 1 : noveltyFactor(input.maxSimilarity, pack);
  if (profile.thresholds && !validThresholds(profile.thresholds)) console.warn('[engine] invalid client score thresholds; using the pack routing', profile.thresholds);
  const thresholds = validThresholds(profile.thresholds) ? profile.thresholds : pack.scoring.routing;
  if (input.changeType === 'citation_added') { // C8: Minor, brief-only line; never an item or alert
    return { score: Math.round((thresholds.brief / 4) * 10) / 10, route: 'archive', factors: {
      typeWeight, size: 1, serviceOverlap: 1, wholeBusiness: true, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: input.maxSimilarity,
      needsReviewCap: false, staleCap: false, profileCap: false, briefOnly: false, citationMinor: true,
      thresholds: { alert: thresholds.alert, brief: thresholds.brief }, scoringVersion: pack.scoring.version } };
  }
  // P10: a tier change is deterministic. Promotion to top scores the alert threshold, any other promotion the brief threshold, a demotion 0.
  const score = input.changeType === 'tier_change'
    ? tierChangeScore(input.details, thresholds)
    : Math.round(100 * typeWeight * size * relevance * novelty * 10) / 10;
  // A tier non-promotion (demotion, same tier, missing tiers) always archives, even when the brief threshold is 0.
  const tierArchive = input.changeType === 'tier_change' && !isTierPromotion(input.details);
  let route: Route = tierArchive ? 'archive' : score >= thresholds.alert ? 'alert' : score >= thresholds.brief ? 'brief' : 'archive';
  const needsReviewCap = input.needsReview && route === 'alert';
  if (needsReviewCap) route = 'brief';
  const staleCap = route === 'alert' && input.ageDays > pack.scoring.alert_max_age_days;
  if (staleCap) route = 'brief';
  // Phase 18a-1: profile edits (hours, phone, categories) never page anyone.
  const profileCap = input.changeType === 'profile_change' && route === 'alert';
  if (profileCap) route = 'brief';
  const briefOnly = BRIEF_ONLY_TYPES.has(input.changeType) && route === 'alert';
  if (briefOnly) route = 'brief';
  return {
    score,
    route,
    factors: {
      typeWeight, size, serviceOverlap: svc.value, wholeBusiness: svc.wholeBusiness, territoryOverlap: territory, relevance, novelty, maxSimilarity: input.maxSimilarity,
      needsReviewCap, staleCap, profileCap, briefOnly, thresholds: { alert: thresholds.alert, brief: thresholds.brief }, scoringVersion: pack.scoring.version,
    },
  };
}
