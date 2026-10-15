const MAPS_PER_SEARCH = 0.002;
const PER_SHORTLISTED = 0.0006 + 0.002 + 0.01 + 0.0015; // advertisers + ads + meta + reviews

export function estimateCostUsd(plan: { searches: number; shortlist: number }): number {
  return plan.searches * MAPS_PER_SEARCH + plan.shortlist * PER_SHORTLISTED;
}
