import { describe, expect, it } from 'vitest';
import type { KeptCandidate } from './filters';
import { activityScore, overlapScores, tierFor } from './score';
import type { Signals } from './signals';
import { candidates, pack } from './test/helpers';

const kc = (over: Partial<KeptCandidate>): KeptCandidate => ({ ...candidates()[0]!, distanceKm: 0, categoryMatch: 'main', ...over });
const sig = (over: Partial<Signals> = {}): Signals => ({
  rating: null, votes: null, reviews30d: null, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null,
  googleAccount: null, metaPage: null, metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null, ...over,
});

describe('overlapScores', () => {
  it('rank 1 outweighs rank 18', () => {
    const m = overlapScores([kc({ placeId: 'a', ranks: [1] }), kc({ placeId: 'b', ranks: [18] })], 1, 15);
    expect(m.get('a')).toBe(1);
    expect(m.get('b')!).toBeLessThan(0.2);
  });
  it('related halves; distance and null distance scale', () => {
    const m = overlapScores(
      [kc({ placeId: 'a', ranks: [1] }), kc({ placeId: 'r', ranks: [1], categoryMatch: 'related' }),
       kc({ placeId: 'far', ranks: [1], distanceKm: 15 }), kc({ placeId: 'nul', ranks: [1], distanceKm: null })], 1, 15);
    expect(m.get('r')).toBeCloseTo(0.5);
    expect(m.get('far')).toBeCloseTo(0.5);
    expect(m.get('nul')).toBeCloseTo(0.75);
  });
});

describe('activityScore', () => {
  it('computes the full weighted formula', () => {
    const a = activityScore(sig({ googleAdsActive: 3, googleAdsNew30d: 2, metaAdsActive: 3, reviews30d: 6, claimed: true }), 3);
    expect(a).toBeCloseTo(1);
  });
  it('activity renormalises with nulls', () => {
    // only reviews (0.3, velocity 1) and claimed=false (0.1, value 0) -> 0.3 / 0.4
    expect(activityScore(sig({ reviews30d: 3, claimed: false }), 1)).toBeCloseTo(0.3 / 0.4);
  });
  it('activity all null -> null and tier <= watch', () => {
    expect(activityScore(sig(), 2)).toBeNull();
    expect(tierFor(1, null, pack.tiers)).toBe('watch');
    expect(tierFor(0.1, null, pack.tiers)).toBe('minor');
  });
  it('0 is not null: checked-and-none counts', () => {
    expect(activityScore(sig({ googleAdsActive: 0, googleAdsNew30d: 0 }), 2)).toBe(0);
  });
});

describe('tierFor', () => {
  it('top needs both thresholds; watch needs either', () => {
    expect(tierFor(0.7, 0.6, pack.tiers)).toBe('top');
    expect(tierFor(0.7, 0.4, pack.tiers)).toBe('watch');
    expect(tierFor(0.1, 0.4, pack.tiers)).toBe('watch');
    expect(tierFor(0.1, 0.1, pack.tiers)).toBe('minor');
  });
});
