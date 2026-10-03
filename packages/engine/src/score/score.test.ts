import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { noveltyFactor, scoreForClient, type ScoreInput, sizeFactor, TERRITORIAL_TYPES } from './score';

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
    expect(r.factors).toMatchObject({ typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 2 });
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
