import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { beforeAll, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { detectMoves, type MoveContext, moveConfidence, type MoveEvent } from './rules';

let hvac: VerticalPack;
beforeAll(async () => {
  hvac = await loadVerticalPack('hvac_plumbing');
});
const now = day(100);
let n = 0;
const ev = (over: Partial<MoveEvent>): MoveEvent => ({
  id: `e${++n}`, changeType: 'content', channels: ['web'], occurredAt: day(95), services: { hvac_plumbing: null }, facts: [], zips: [], summary: '', details: {}, ...over,
});
const ctx = (over: Partial<MoveContext> = {}): MoveContext => ({
  now, verticalId: 'hvac_plumbing', clientServices: ['ac_tune_up'], clientZips: ['75023'], clientTowns: ['Frisco'], thresholds: hvac.move_thresholds, ads: { activeNow: 2, baseline: 2 }, ...over,
});
const cut = (from: string, to: string) => diffFacts(extractNumericFacts(from), extractNumericFacts(to));
const types = (events: MoveEvent[], c = ctx()) => detectMoves(events, c).map((f) => f.type);

describe('moveConfidence', () => {
  it('grows with extra events and channels, capped at 1', () => {
    expect(moveConfidence(2, 1, 2)).toBe(0.4);
    expect(moveConfidence(3, 2, 2)).toBe(0.7);
    expect(moveConfidence(9, 4, 1)).toBe(1);
  });
});

describe('detectMoves', () => {
  it('price war: two cuts on the client services inside 90 days', () => {
    const cuts = [ev({ changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, facts: cut('$100', '$80') }), ev({ changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, facts: cut('$80', '$70'), occurredAt: day(60) })];
    const [f] = detectMoves(cuts, ctx());
    expect(f).toMatchObject({ type: 'price_war', eventIds: cuts.map((e) => e.id), confidence: 0.4, lastEvidenceAt: day(95), facts: { cuts: 2 } });
    expect(types([cuts[0]!, ev({ ...cuts[1]!, services: { hvac_plumbing: 'drain_cleaning' } })])).toEqual([]); // not the client's service
    expect(types([cuts[0]!, ev({ ...cuts[1]!, occurredAt: day(5) })])).toEqual([]); // outside the 90-day window
    expect(types([cuts[0]!, ev({ ...cuts[1]!, facts: cut('$70', '$90') })])).toEqual([]); // a price rise is not a cut
  });

  it('price war: a promo plus an ad burst', () => {
    const events = [ev({ changeType: 'promo' }), ev({ changeType: 'ad_started', channels: ['meta_ads'], details: { count: 3 }, occurredAt: day(90) })];
    expect(types(events)).toContain('price_war');
    expect(types([events[0]!, ev({ ...events[1]!, details: { count: 2 } })])).not.toContain('price_war');
  });

  it('territory expansion: two kinds of signal touching the client ZIPs or towns', () => {
    const area = ev({ changeType: 'service_area_change', zips: ['75023'] });
    const jobs = ev({ changeType: 'hiring', channels: ['google_jobs'], summary: '2 new job postings: Technician — Frisco, TX', details: { count: 2 } });
    expect(types([area, jobs])).toContain('territory_expansion');
    expect(types([area, ev({ ...area, id: 'e-dup' })])).not.toContain('territory_expansion'); // one kind of signal twice
    expect(types([area, ev({ ...jobs, summary: '2 new job postings: Technician — Austin, TX' })])).not.toContain('territory_expansion');
    expect(types([area, jobs], ctx({ clientZips: [], clientTowns: [] }))).not.toContain('territory_expansion'); // no territory to compare
    const ads = ev({ changeType: 'ad_started', channels: ['google_ads'], summary: 'New Google ads: AC tune-up in Frisco' });
    expect(types([ads, jobs])).not.toContain('territory_expansion'); // ads + jobs naming the town: already local, not expanding
    expect(types([area, ads])).toContain('territory_expansion');
  });

  it('new service line: a web launch confirmed by GBP or ads for the same service', () => {
    const web = ev({ changeType: 'new_service', services: { hvac_plumbing: 'water_heater' } });
    expect(types([web, ev({ changeType: 'ad_started', channels: ['google_ads'], services: { hvac_plumbing: 'water_heater' } })])).toContain('new_service_line');
    expect(types([web, ev({ changeType: 'ad_started', channels: ['google_ads'], services: { hvac_plumbing: 'ac_repair' } })])).not.toContain('new_service_line');
  });

  it('new service line: one merged launch event already carrying a GBP or ads channel confirms itself', () => {
    const merged = ev({ changeType: 'new_service', channels: ['google_business_profile', 'web'], services: { hvac_plumbing: 'water_heater' } });
    const [f] = detectMoves([merged], ctx());
    expect(f).toMatchObject({ type: 'new_service_line', eventIds: [merged.id], channels: ['google_business_profile', 'web'] });
    expect(types([ev({ ...merged, channels: ['meta_ads', 'web'] })])).toContain('new_service_line');
    expect(types([ev({ ...merged, channels: ['web'] })])).not.toContain('new_service_line'); // web alone is not confirmed
  });

  it('hiring push: enough postings in 30 days', () => {
    expect(types([ev({ changeType: 'hiring', channels: ['google_jobs'], details: { count: 3 } })])).toContain('hiring_push');
    expect(types([ev({ changeType: 'hiring', channels: ['google_jobs'], details: { count: 3 }, occurredAt: day(60) })])).not.toContain('hiring_push');
  });

  it('promo blitz: promos in two channels within the window', () => {
    const web = ev({ changeType: 'promo' });
    const ad = ev({ changeType: 'ad_started', channels: ['meta_ads'], details: { offer: true } });
    expect(types([web, ad])).toContain('promo_blitz');
    expect(types([web, ev({ ...ad, details: { offer: false } })])).not.toContain('promo_blitz');
    expect(types([web, ev({ ...ad, occurredAt: day(70) })])).not.toContain('promo_blitz');
  });

  it('reputation slump: rating drops adding up to the threshold', () => {
    const drop = (a: number, b: number) => ev({ changeType: 'rating_change', channels: ['google_business_profile'], details: { ratingBefore: a, ratingAfter: b } });
    expect(types([drop(4.6, 4.5), drop(4.5, 4.4)])).toContain('reputation_slump');
    expect(types([drop(4.6, 4.5)])).not.toContain('reputation_slump');
  });

  it('ad surge: active ads at least the multiplier times the baseline, with a started-ad event as evidence', () => {
    const started = ev({ changeType: 'ad_started', channels: ['meta_ads'], details: { count: 1 } });
    expect(types([started], ctx({ ads: { activeNow: 8, baseline: 3 } }))).toContain('ad_surge');
    expect(types([started], ctx({ ads: { activeNow: 5, baseline: 3 } }))).not.toContain('ad_surge');
    expect(types([], ctx({ ads: { activeNow: 8, baseline: 3 } }))).not.toContain('ad_surge'); // no evidence, no claim
  });
});
