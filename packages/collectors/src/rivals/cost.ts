/** Per-call vendor cost estimates (USD) for a discovery run; the run's `cost_usd` is the sum over the calls it made. */
export const DISCOVERY_CALL_COST_USD = { maps: 0.002, advertisers: 0.0006, ads: 0.002, meta: 0.01, reviews: 0.0015 } as const;
const C = DISCOVERY_CALL_COST_USD;
const PER_SHORTLISTED = C.advertisers + C.ads + C.meta + C.reviews;

export function estimateCostUsd(plan: { searches: number; shortlist: number }): number {
  return plan.searches * C.maps + plan.shortlist * PER_SHORTLISTED;
}
