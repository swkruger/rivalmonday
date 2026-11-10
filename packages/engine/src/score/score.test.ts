import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { noveltyFactor, scoreForClient, type ScoreInput, serviceOverlap, sizeFactor, TERRITORIAL_TYPES, WHOLE_BUSINESS_TYPES } from './score';

let pack: VerticalPack;
beforeAll(async () => {
  pack = await loadVerticalPack('hvac_plumbing');
});
const cut = (from: string, to: string) => diffFacts(extractNumericFacts(from), extractNumericFacts(to));
const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  changeType: 'price_change', facts: cut('$100', '$80'), serviceId: 'ac_tune_up', zips: [], needsReview: false, maxSimilarity: null, details: {}, ageDays: 0, ...over,
});
const client = { services: ['ac_tune_up'], zips: ['75024'], thresholds: null };

describe('scoreForClient', () => {
  it('routes a 20% price cut on a matched service to alert, with its factor breakdown', () => {
    const r = scoreForClient(input(), client, pack);
    expect(r.score).toBe(100);
    expect(r.route).toBe('alert');
    expect(r.factors).toMatchObject({ typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 6 });
  });

  it('scales size with the percent change, floored at price_min', () => {
    expect(scoreForClient(input({ facts: cut('$100', '$90') }), client, pack)).toMatchObject({ score: 50, route: 'brief' });
    expect(scoreForClient(input({ facts: cut('$100', '$99') }), client, pack).factors.size).toBe(0.3);
  });

  it('archives low-weight content changes', () => {
    expect(scoreForClient(input({ changeType: 'content', facts: [] }), client, pack)).toMatchObject({ score: 12, route: 'archive' });
  });

  it('applies service relevance: unmatched, unmapped, and clients without a service list', () => {
    expect(scoreForClient(input({ serviceId: 'drain_cleaning' }), client, pack).factors.serviceOverlap).toBe(0.2);
    expect(scoreForClient(input({ serviceId: null }), client, pack).factors.serviceOverlap).toBe(0.6);
    expect(scoreForClient(input({ serviceId: 'drain_cleaning' }), { ...client, services: [] }, pack).factors.serviceOverlap).toBe(1);
  });

  it('applies territory overlap only when the event names ZIP codes', () => {
    const area = (zips: string[]) => input({ changeType: 'service_area_change', facts: [], serviceId: null, zips });
    expect(scoreForClient(area(['75024']), client, pack).factors.territoryOverlap).toBe(1);
    expect(scoreForClient(area(['10001']), client, pack).factors.territoryOverlap).toBe(0.3);
    expect(scoreForClient(area([]), client, pack).factors.territoryOverlap).toBe(1);
  });

  it('applies territory overlap only to territorial change types, so a stray 5-digit number cannot archive a price cut', () => {
    expect([...TERRITORIAL_TYPES].sort()).toEqual(['new_location', 'service_area_change']);
    const price = scoreForClient(input({ zips: ['10001'] }), { ...client, zips: ['75024'] }, pack);
    expect(price.factors.territoryOverlap).toBe(1);
    expect(price.route).toBe('alert');
    expect(scoreForClient(input({ changeType: 'service_area_change', zips: ['10001'] }), { ...client, zips: ['75024'] }, pack).factors.territoryOverlap).toBe(0.3);
  });

  it('discounts repeats of earlier events (novelty)', () => {
    expect(noveltyFactor(null, pack)).toBe(1);
    expect(noveltyFactor(0.3, pack)).toBe(1);
    expect(noveltyFactor(0.9, pack)).toBeCloseTo(0.2, 10);
    expect(noveltyFactor(1, pack)).toBe(0);
  });

  it('caps an unverified classification at brief', () => {
    expect(scoreForClient(input({ needsReview: true }), client, pack)).toMatchObject({ score: 100, route: 'brief', factors: { needsReviewCap: true } });
  });

  it('honours per-client thresholds', () => {
    expect(scoreForClient(input({ facts: cut('$100', '$90') }), { ...client, thresholds: { alert: 45, brief: 20 } }, pack).route).toBe('alert');
  });

  it('falls back to the pack routing when a client threshold row is malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = scoreForClient(input(), { ...client, thresholds: { alert: 30, brief: 60 } }, pack);
    expect(r.factors.thresholds).toEqual({ alert: 70, brief: 40 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(scoreForClient(input(), { ...client, thresholds: { alert: 90, brief: 50 } }, pack).factors.thresholds).toEqual({ alert: 90, brief: 50 });
  });
});

describe('structured size curves and the alert age cap (Phase 3b)', () => {
  const structured = (over: Partial<ScoreInput>) => input({ changeType: 'ad_started', facts: [], serviceId: null, ...over });

  it('sizes structured events from their details', () => {
    expect(sizeFactor(structured({ changeType: 'ad_started', details: { count: 2 } }), pack)).toBeCloseTo(0.4);
    expect(sizeFactor(structured({ changeType: 'ad_stopped', details: { count: 1 } }), pack)).toBeCloseTo(0.3); // floor
    expect(sizeFactor(structured({ changeType: 'hiring', details: { count: 12 } }), pack)).toBe(1); // cap
    expect(sizeFactor(structured({ changeType: 'review_spike', details: { z: 2 } }), pack)).toBeCloseTo(0.5);
    expect(sizeFactor(structured({ changeType: 'rating_change', details: { ratingBefore: 4.6, ratingAfter: 4.45 } }), pack)).toBeCloseTo(0.5);
    expect(sizeFactor(structured({ changeType: 'rank_change', details: { avgRankBefore: 9, avgRankAfter: 3 } }), pack)).toBe(1);
    expect(sizeFactor(structured({ changeType: 'review_spike', details: {} }), pack)).toBe(pack.scoring.size.default);
  });

  it('never alerts on an event older than alert_max_age_days; caps it to brief and says so', () => {
    const profile = { services: ['ac_tune_up'], zips: [], thresholds: null };
    const fresh = scoreForClient(input({ ageDays: 2 }), profile, pack); // the default input is a 20% cut on ac_tune_up
    const stale = scoreForClient(input({ ageDays: 10 }), profile, pack);
    expect([fresh.route, fresh.factors.staleCap]).toEqual(['alert', false]);
    expect([stale.route, stale.factors.staleCap, stale.score]).toEqual(['brief', true, fresh.score]);
  });
});

describe('tier_change scoring (P10)', () => {
  const tier = (from: 'top' | 'watch' | 'minor', to: 'top' | 'watch' | 'minor', over: Partial<ScoreInput> = {}) =>
    input({ changeType: 'tier_change', facts: [], serviceId: null, details: { changeType: 'tier_change', from, to }, ...over });

  it('promotion to top routes alert', () => {
    expect(scoreForClient(tier('watch', 'top'), client, pack)).toMatchObject({ score: 70, route: 'alert' });
    expect(scoreForClient(tier('minor', 'top'), client, pack).route).toBe('alert');
  });

  it('watch promotion routes brief', () => {
    expect(scoreForClient(tier('minor', 'watch'), client, pack)).toMatchObject({ score: 40, route: 'brief' });
  });

  it('demotion archives', () => {
    expect(scoreForClient(tier('top', 'watch'), client, pack)).toMatchObject({ score: 0, route: 'archive' });
    expect(scoreForClient(tier('watch', 'minor'), client, pack).route).toBe('archive');
  });

  it('demotion, same tier and missing tiers archive even with a brief threshold of 0', () => {
    const zero = { ...client, thresholds: { alert: 70, brief: 0 } };
    expect(scoreForClient(tier('top', 'watch'), zero, pack)).toMatchObject({ score: 0, route: 'archive' });
    expect(scoreForClient(tier('watch', 'watch'), zero, pack).route).toBe('archive');
    const missing = input({ changeType: 'tier_change', facts: [], serviceId: null, details: { changeType: 'tier_change' } as ScoreInput['details'] });
    expect(scoreForClient(missing, zero, pack).route).toBe('archive');
    // A promotion still routes by the thresholds.
    expect(scoreForClient(tier('minor', 'watch'), zero, pack).route).toBe('brief');
  });

  it('needs-review cap still applies', () => {
    const r = scoreForClient(tier('watch', 'top', { needsReview: true }), client, pack);
    expect([r.route, r.factors.needsReviewCap]).toEqual(['brief', true]);
  });

  it('stale cap still applies', () => {
    expect(scoreForClient(tier('watch', 'top', { ageDays: 10 }), client, pack)).toMatchObject({ route: 'brief' });
  });
});

describe('Google post offers (18b-1)', () => {
  const postPromo = (over: Partial<ScoreInput> = {}) =>
    input({ changeType: 'promo', facts: [], serviceId: null, details: { field: 'post', postId: 'p', offer: true }, ...over });
  it('an unmapped post promo scores whole_business and routes brief', () => {
    const r = scoreForClient(postPromo(), client, pack);
    expect(r.factors).toMatchObject({ serviceOverlap: 1, wholeBusiness: true });
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.score).toBeLessThan(70);
    expect(r.route).toBe('brief');
  });
  it('a mapped, matching post promo routes brief and never alert', () => {
    const r = scoreForClient(postPromo({ serviceId: 'ac_tune_up' }), client, pack);
    expect(r.route).toBe('brief');
    expect(r.score).toBeLessThan(70);
  });
  it('a web promo with no service still scores unmapped', () => {
    const r = scoreForClient(input({ changeType: 'promo', facts: [], serviceId: null, details: {} }), client, pack);
    expect(r.factors).toMatchObject({ serviceOverlap: 0.6, wholeBusiness: false });
  });
});

describe('whole-business relevance (brief-signal D2)', () => {
  const whole = (over: Partial<ScoreInput>) => input({ facts: [], serviceId: null, ...over });

  it('rating_change with no service scores 100·0.7·size·1·novelty and wholeBusiness true', () => {
    const r = scoreForClient(whole({ changeType: 'rating_change', details: { ratingBefore: 4.6, ratingAfter: 4.45 }, maxSimilarity: 0.75 }), client, pack);
    const novelty = noveltyFactor(0.75, pack);
    expect(r.factors).toMatchObject({ serviceOverlap: 1, relevance: 1, wholeBusiness: true });
    expect(r.score).toBe(Math.round(100 * 0.7 * 0.5 * 1 * novelty * 10) / 10);
  });

  it('ad_started with a mapped matching service uses matched, wholeBusiness false', () => {
    const r = scoreForClient(whole({ changeType: 'ad_started', serviceId: 'ac_tune_up', details: { count: 5 } }), client, pack);
    expect(r.factors).toMatchObject({ serviceOverlap: 1, wholeBusiness: false });
  });

  it('ad_started with an unmatched service uses unmatched', () => {
    const r = scoreForClient(whole({ changeType: 'ad_started', serviceId: 'drain_cleaning', details: { count: 5 } }), client, pack);
    expect(r.factors).toMatchObject({ serviceOverlap: 0.2, wholeBusiness: false });
  });

  it('price_change with no service stays unmapped', () => {
    const r = scoreForClient(whole({ changeType: 'price_change' }), client, pack);
    expect(r.factors).toMatchObject({ serviceOverlap: 0.6, wholeBusiness: false });
  });

  it('content with no service stays unmapped', () => {
    expect(scoreForClient(whole({ changeType: 'content' }), client, pack).factors).toMatchObject({ serviceOverlap: 0.6, wholeBusiness: false });
  });

  it('client without services → 1, wholeBusiness false', () => {
    expect(serviceOverlap(null, [], pack, 'rating_change')).toEqual({ value: 1, wholeBusiness: false });
    expect(scoreForClient(whole({ changeType: 'rating_change' }), { ...client, services: [] }, pack).factors.wholeBusiness).toBe(false);
  });

  it('serviceOverlap returns the rule table', () => {
    expect(serviceOverlap(null, ['a'], pack, 'hiring')).toEqual({ value: pack.scoring.relevance.whole_business, wholeBusiness: true });
    expect(serviceOverlap('a', ['a'], pack, 'hiring')).toEqual({ value: 1, wholeBusiness: false });
    expect(serviceOverlap(null, ['a'], pack, 'promo')).toEqual({ value: 0.6, wholeBusiness: false });
    expect([...WHOLE_BUSINESS_TYPES].sort()).toEqual(['ad_started', 'ad_stopped', 'audience_growth', 'hiring', 'new_location', 'new_page', 'profile_change', 'rank_change', 'rating_change', 'review_spike', 'site_feature', 'status_change']);
  });

  it('new_location outside territory = whole_business × outside_territory', () => {
    const r = scoreForClient(whole({ changeType: 'new_location', zips: ['10001'] }), client, pack);
    expect(r.factors).toMatchObject({ serviceOverlap: 1, territoryOverlap: 0.3, relevance: 0.3, wholeBusiness: true });
  });

  it('review_spike z ≥ 4 reaches the brief bar (60)', () => {
    const r = scoreForClient(whole({ changeType: 'review_spike', details: { z: 4 } }), client, pack);
    expect(r).toMatchObject({ score: 60, route: 'brief' });
  });

  it('ad_stopped never reaches 40', () => {
    const r = scoreForClient(whole({ changeType: 'ad_stopped', details: { count: 50 } }), client, pack);
    expect(r.score).toBe(30);
    expect(r.route).toBe('archive');
  });

  it('rating_change Δ0.3, novelty 1 routes alert (70)', () => {
    const r = scoreForClient(whole({ changeType: 'rating_change', details: { ratingBefore: 4.6, ratingAfter: 4.3 } }), client, pack);
    expect(r).toMatchObject({ score: 70, route: 'alert' });
  });

  it('tier_change unchanged', () => {
    const r = scoreForClient(input({ changeType: 'tier_change', facts: [], serviceId: null, details: { changeType: 'tier_change', from: 'watch', to: 'top' } }), client, pack);
    expect(r).toMatchObject({ score: 70, route: 'alert' });
    expect(r.factors.wholeBusiness).toBe(false);
  });

  it('closed status_change scores 100 and alerts with novelty 0.9', () => {
    // maxSimilarity 0.95 would give a raw novelty of 0.1 (floor 0.5); the closure skips novelty entirely.
    const r = scoreForClient(whole({ changeType: 'status_change', maxSimilarity: 0.95, details: { direction: 'closed' } }), client, pack);
    expect(r).toMatchObject({ score: 100, route: 'alert' });
    expect(r.factors.novelty).toBe(1);
  });

  it('reopened scores 60 to brief', () => {
    const r = scoreForClient(whole({ changeType: 'status_change', maxSimilarity: null, details: { direction: 'reopened' } }), client, pack);
    expect(r).toMatchObject({ score: 60, route: 'brief' });
  });

  it('profile_change never alerts even with thresholds {alert: 10, brief: 5}', () => {
    const r = scoreForClient(whole({ changeType: 'profile_change', details: { field: 'hours' } }), { ...client, thresholds: { alert: 10, brief: 5 } }, pack);
    expect(r.route).toBe('brief');
    expect(r.factors.profileCap).toBe(true);
  });

  it('site_feature added scores 42 and routes brief', () => {
    const r = scoreForClient(whole({ changeType: 'site_feature', details: { feature: 'Online scheduling', direction: 'added' } }), client, pack);
    expect(r).toMatchObject({ score: 42, route: 'brief' });
    expect(r.factors.briefOnly).toBe(false);
  });

  it('site_feature with thresholds {alert:10,brief:5} routes brief, briefOnly true', () => {
    const r = scoreForClient(whole({ changeType: 'site_feature', details: { direction: 'added' } }), { ...client, thresholds: { alert: 10, brief: 5 } }, pack);
    expect(r.route).toBe('brief');
    expect(r.factors.briefOnly).toBe(true);
  });

  it('new_page none-service scores 42, unmatched 8', () => {
    expect(scoreForClient(whole({ changeType: 'new_page', details: { pageKey: 'k' } }), client, pack).score).toBe(42);
    expect(scoreForClient(whole({ changeType: 'new_page', serviceId: 'other', details: { pageKey: 'k' } }), client, pack).score).toBeCloseTo(8, 0);
  });

  it('status_change sizing stays on direction closed (not widened by added/removed)', () => {
    expect(sizeFactor(whole({ changeType: 'status_change', details: { direction: 'added' } }), pack)).toBe(pack.scoring.size.default);
  });

  it('audience_growth pct 15 scores about 52.5 to brief', () => {
    const r = scoreForClient(whole({ changeType: 'audience_growth', details: { pct: 15 } }), client, pack);
    expect(r.score).toBeCloseTo(52.5, 1);
    expect(r.route).toBe('brief');
  });

  it('factors.scoringVersion is 6 with the shipped pack', () => {
    expect(scoreForClient(whole({ changeType: 'hiring' }), client, pack).factors.scoringVersion).toBe(6);
  });
});
