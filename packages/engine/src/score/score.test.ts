import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { beforeAll, describe, expect, it } from 'vitest';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { noveltyFactor, scoreForClient, type ScoreInput } from './score';

let pack: VerticalPack;
beforeAll(async () => {
  pack = await loadVerticalPack('hvac_plumbing');
});
const cut = (from: string, to: string) => diffFacts(extractNumericFacts(from), extractNumericFacts(to));
const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({ changeType: 'price_change', facts: cut('$100', '$80'), serviceId: 'ac_tune_up', zips: [], needsReview: false, maxSimilarity: null, ...over });
const client = { services: ['ac_tune_up'], zips: ['75024'], thresholds: null };

describe('scoreForClient', () => {
  it('routes a 20% price cut on a matched service to alert, with its factor breakdown', () => {
    const r = scoreForClient(input(), client, pack);
    expect(r.score).toBe(100);
    expect(r.route).toBe('alert');
    expect(r.factors).toMatchObject({ typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 1 });
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
    expect(scoreForClient(input({ zips: ['75024'] }), client, pack).factors.territoryOverlap).toBe(1);
    expect(scoreForClient(input({ zips: ['10001'] }), client, pack).factors.territoryOverlap).toBe(0.3);
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
});
