import { loadVerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import type { BenchmarkBusiness, TopicShare } from '../reviews/benchmark';
import type { Scorecard } from './scorecard';
import { evaluateSelfRules, type SelfRuleInput } from './self-rules';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SELF = ID(1);
type Vals = Partial<Scorecard['rows'][number]['values']>;
const vals = (v: Vals): Scorecard['rows'][number]['values'] => ({ rating: null, reviews90d: null, replyRate: null, mapTop3Share: null, adsActive: null, metaAdsActive: null, ...v });
const row = (n: number, name: string, v: Vals, self = false): Scorecard['rows'][number] => ({ competitorId: ID(n), name, self, tier: self ? null : 'top', values: vals(v) });
const card = (rows: Scorecard['rows']): Scorecard => ({ asOf: '2026-10-14T00:00:00Z', baselineBriefId: null, tiles: [] as never, rows, evidenceIds: [], openFirstMoves: [] });
const theme = (topicId: string, share: number | null, sentiment: number | null): TopicShare =>
  ({ topicId, name: topicId === 'wait_time' ? 'Wait time' : 'Staff friendliness', mentions: 5, asked: 10, share, sentiment, prevShare: null, prevSentiment: null, shareDelta: null, sentimentDelta: null });
const biz = (n: number, self: boolean, themes: TopicShare[]): BenchmarkBusiness =>
  ({ competitorId: ID(n), name: `B${n}`, self, reviews: 10, avgRating: 4, prevReviews: 0, prevAvgRating: null, topics: themes });

const ALL_OK = { claimed: true, hasHours: true, categoryCount: 3 };
const evidence = Object.fromEntries([1, 2, 3, 4].map((n) => [ID(n), [ID(100 + n)]]));
const adEvidence = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [ID(n), [ID(200 + n)]]));

async function base(over: Partial<SelfRuleInput> = {}): Promise<SelfRuleInput> {
  const pack = await loadVerticalPack('dental');
  return {
    scorecard: card([row(1, 'Me', {}, true), row(2, 'Alpha', {}), row(3, 'Beta', {}), row(4, 'Gamma', {})]),
    themes: [], profile: ALL_OK, rules: pack.self_rules, playbooks: pack.playbooks, rankHasEvidence: true, audienceNoun: pack.audience_noun,
    evidenceByCompetitor: evidence, adEvidenceByCompetitor: adEvidence, rankEvidenceIds: [ID(900)], ...over,
  };
}
const find = (r: ReturnType<typeof evaluateSelfRules>, id: string) => r.find((f) => f.ruleId === id);

describe('evaluateSelfRules', () => {
  it('review_velocity_gap fires below half the rival median and names the top rival (positive)', async () => {
    const sc = card([row(1, 'Me', { reviews90d: 4 }, true), row(2, 'Alpha', { reviews90d: 20 }), row(3, 'Beta', { reviews90d: 12 }), row(4, 'Gamma', { reviews90d: 8 })]);
    const f = find(evaluateSelfRules(await base({ scorecard: sc })), 'review_velocity_gap')!;
    expect(f.fact).toBe('You got 4 new reviews in 90 days; Alpha got 20.');
    expect(f.evidenceIds).toEqual([ID(101), ID(102)]);
    expect(f.score).toBeCloseTo(1 * Math.min(1, (1 - 4 / 12) / 0.5), 2);
    expect(f.playbookId).toBe('ask_for_reviews');
  });
  it('review_velocity_gap stays quiet at or above half the median (negative)', async () => {
    const sc = card([row(1, 'Me', { reviews90d: 6 }, true), row(2, 'A', { reviews90d: 12 }), row(3, 'B', { reviews90d: 12 })]);
    expect(find(evaluateSelfRules(await base({ scorecard: sc })), 'review_velocity_gap')).toBeUndefined();
  });

  it('reply_rate_gap fires when the reply rate trails the median by more than 25 points (positive)', async () => {
    const sc = card([row(1, 'Me', { replyRate: 0.1 }, true), row(2, 'A', { replyRate: 0.8 }), row(3, 'B', { replyRate: 0.6 })]);
    const f = find(evaluateSelfRules(await base({ scorecard: sc })), 'reply_rate_gap')!;
    expect(f.fact).toBe('You replied to 10% of reviews; the rival median is 70%.');
    expect(f.score).toBeCloseTo(0.8, 2);
  });
  it('reply_rate_gap stays quiet within 25 points, or when you are not measured (negative)', async () => {
    const near = card([row(1, 'Me', { replyRate: 0.5 }, true), row(2, 'A', { replyRate: 0.7 })]);
    expect(find(evaluateSelfRules(await base({ scorecard: near })), 'reply_rate_gap')).toBeUndefined();
    const nul = card([row(1, 'Me', { replyRate: null }, true), row(2, 'A', { replyRate: 0.9 })]);
    expect(find(evaluateSelfRules(await base({ scorecard: nul })), 'reply_rate_gap')).toBeUndefined();
  });

  it('rating_gap fires more than 0.2 below the median, with one decimal (positive)', async () => {
    const sc = card([row(1, 'Me', { rating: 4.1 }, true), row(2, 'A', { rating: 4.7 }), row(3, 'B', { rating: 4.5 }), row(4, 'C', { rating: 4.9 })]);
    const f = find(evaluateSelfRules(await base({ scorecard: sc })), 'rating_gap')!;
    expect(f.fact).toBe('Your rating is 4.1; the rival median is 4.7.');
    expect(f.score).toBeCloseTo(0.9 * 0.6, 2);
  });
  it('rating_gap uses two decimals when one would not differ, and stays quiet within 0.2 (negative)', async () => {
    const close = card([row(1, 'Me', { rating: 4.51 }, true), row(2, 'A', { rating: 4.54 })]);
    expect(find(evaluateSelfRules(await base({ scorecard: close })), 'rating_gap')).toBeUndefined();
    const tight = (await base()).rules.map((r) => ({ ...r, params: { gap: 0.01 } }));
    expect(find(evaluateSelfRules(await base({ scorecard: close, rules: tight })), 'rating_gap')?.fact).toBe('Your rating is 4.51; the rival median is 4.54.');
  });

  it('rival_only_advertiser names up to three advertisers (positive)', async () => {
    const sc = card([row(1, 'Me', { adsActive: 0 }, true), row(2, 'Alpha', { adsActive: 3 }), row(3, 'Beta', { adsActive: 1 }), row(4, 'Gamma', { adsActive: 2 }), row(5, 'Delta', { adsActive: 4 })]);
    const f = find(evaluateSelfRules(await base({ scorecard: sc })), 'rival_only_advertiser')!;
    expect(f.fact).toBe('Alpha, Beta and Gamma run ads; you run none.');
    expect(f.score).toBe(0.6);
    expect(f.evidenceIds).toEqual([ID(201), ID(202), ID(203), ID(204)]); // ad captures of you and the named advertisers, not GBP/review evidence
  });
  it('rival_only_advertiser names only advertisers with ad evidence, and needs your own ad evidence', async () => {
    const sc = card([row(1, 'Me', { adsActive: 0 }, true), row(2, 'Alpha', { adsActive: 3 }), row(3, 'Beta', { adsActive: 1 })]);
    const f = find(evaluateSelfRules(await base({ scorecard: sc, adEvidenceByCompetitor: { [SELF]: [ID(201)], [ID(3)]: [ID(203)] } })), 'rival_only_advertiser')!;
    expect(f.fact).toBe('Beta run ads; you run none.');
    expect(f.values.advertisers).toBe(1);
    expect(f.evidenceIds).toEqual([ID(201), ID(203)]);
    expect(find(evaluateSelfRules(await base({ scorecard: sc, adEvidenceByCompetitor: { [SELF]: [ID(201)] } })), 'rival_only_advertiser')).toBeUndefined();
    expect(find(evaluateSelfRules(await base({ scorecard: sc, adEvidenceByCompetitor: { [ID(2)]: [ID(202)] } })), 'rival_only_advertiser')).toBeUndefined();
  });
  it('rival_only_advertiser stays quiet when you advertise, are unchecked, or no rival does (negative)', async () => {
    const mine = card([row(1, 'Me', { adsActive: 2 }, true), row(2, 'A', { adsActive: 3 })]);
    const unchecked = card([row(1, 'Me', { adsActive: null }, true), row(2, 'A', { adsActive: 3 })]);
    const none = card([row(1, 'Me', { adsActive: 0 }, true), row(2, 'A', { adsActive: 0 })]);
    for (const scorecard of [mine, unchecked, none]) expect(find(evaluateSelfRules(await base({ scorecard })), 'rival_only_advertiser')).toBeUndefined();
  });

  it('topic_weakness fires when a negatively felt theme is mentioned 10+ points more than rivals (positive)', async () => {
    const themes = [biz(1, true, [theme('wait_time', 0.45, -0.5)]), biz(2, false, [theme('wait_time', 0.3, 0)]), biz(3, false, [theme('wait_time', 0.2, 0)])];
    const f = find(evaluateSelfRules(await base({ themes })), 'topic_weakness')!;
    expect(f.fact).toBe('Wait time comes up in 45% of your reviews vs 25% for rivals.');
    expect(f.score).toBeCloseTo(0.7 * Math.min(1, 0.2 / 0.3), 2);
    expect(f).toMatchObject({ effort: 'M', impact: 'M', playbookId: 'fix_topic' });
  });
  it('topic_weakness stays quiet for positive sentiment or a small gap (negative)', async () => {
    const pos = [biz(1, true, [theme('wait_time', 0.45, 0.5)]), biz(2, false, [theme('wait_time', 0.25, 0)])];
    const small = [biz(1, true, [theme('wait_time', 0.3, -0.5)]), biz(2, false, [theme('wait_time', 0.25, 0)])];
    const less = [biz(1, true, [theme('wait_time', 0.1, -0.5)]), biz(2, false, [theme('wait_time', 0.35, 0)])];
    for (const themes of [pos, small, less]) expect(find(evaluateSelfRules(await base({ themes })), 'topic_weakness')).toBeUndefined();
  });

  it('topic_strength uses the audience noun and a lower-cased theme (positive)', async () => {
    const themes = [biz(1, true, [theme('staff', 0.5, 0.8)]), biz(2, false, [theme('staff', 0.2, 0)])];
    const f = find(evaluateSelfRules(await base({ themes })), 'topic_strength')!;
    expect(f.strength).toBe(true);
    expect(f.fact).toBe('Patients mention staff friendliness in 50% of your reviews vs 20% for rivals.');
    const hv = await loadVerticalPack('hvac_plumbing');
    const g = find(evaluateSelfRules(await base({ themes, rules: hv.self_rules, audienceNoun: hv.audience_noun })), 'topic_strength')!;
    expect(g.fact.startsWith('Customers mention')).toBe(true);
  });
  it('topic_strength stays quiet for negative sentiment (negative)', async () => {
    const themes = [biz(1, true, [theme('staff', 0.5, -0.4)]), biz(2, false, [theme('staff', 0.2, 0)])];
    expect(find(evaluateSelfRules(await base({ themes })), 'topic_strength')).toBeUndefined();
  });

  it('map_visibility_gap fires 10+ points below the rival median and cites the map captures (positive)', async () => {
    const sc = card([row(1, 'Me', { mapTop3Share: 0.1 }, true), row(2, 'A', { mapTop3Share: 0.6 }), row(3, 'B', { mapTop3Share: 0.4 })]);
    const f = find(evaluateSelfRules(await base({ scorecard: sc })), 'map_visibility_gap')!;
    expect(f.fact).toBe('You appear in the map top 3 in 10% of searches; rivals 50%.');
    expect(f.evidenceIds).toEqual([ID(900)]);
  });
  it('map_visibility_gap is skipped without rank evidence, and when the gap is small (negative)', async () => {
    const sc = card([row(1, 'Me', { mapTop3Share: 0.1 }, true), row(2, 'A', { mapTop3Share: 0.6 })]);
    expect(find(evaluateSelfRules(await base({ scorecard: sc, rankHasEvidence: false })), 'map_visibility_gap')).toBeUndefined();
    const near = card([row(1, 'Me', { mapTop3Share: 0.5 }, true), row(2, 'A', { mapTop3Share: 0.55 })]);
    expect(find(evaluateSelfRules(await base({ scorecard: near })), 'map_visibility_gap')).toBeUndefined();
  });

  it('profile_gap lists what is missing and treats unknown (null) as not missing (positive)', async () => {
    const f = find(evaluateSelfRules(await base({ profile: { claimed: false, hasHours: null, categoryCount: 1 } })), 'profile_gap')!;
    expect(f.fact).toBe('Your Google profile is missing: ownership claim, additional categories.');
    expect(f.score).toBe(0.7);
  });
  it('profile_gap stays quiet for a complete or unmeasured profile (negative)', async () => {
    expect(find(evaluateSelfRules(await base()), 'profile_gap')).toBeUndefined();
    expect(find(evaluateSelfRules(await base({ profile: { claimed: null, hasHours: null, categoryCount: null } })), 'profile_gap')).toBeUndefined();
  });

  it('with no rivals only the profile rule can fire (theme rules also need rival shares)', async () => {
    const sc = card([row(1, 'Me', { reviews90d: 0, replyRate: 0, rating: 3, mapTop3Share: 0, adsActive: 0 }, true)]);
    const themes = [biz(1, true, [theme('wait_time', 0.1, -0.5)])];
    const r = evaluateSelfRules(await base({ scorecard: sc, themes, profile: { claimed: false, hasHours: true, categoryCount: 3 } }));
    expect(r.map((f) => f.ruleId)).toEqual(['profile_gap']);
  });

  it('ranks by score, keeps at most five findings and at most one strength', async () => {
    const sc = card([row(1, 'Me', { reviews90d: 0, replyRate: 0, rating: 3.5, mapTop3Share: 0, adsActive: 0 }, true), row(2, 'A', { reviews90d: 20, replyRate: 0.9, rating: 4.8, mapTop3Share: 0.6, adsActive: 2 }), row(3, 'B', { reviews90d: 10, replyRate: 0.9, rating: 4.8, mapTop3Share: 0.6, adsActive: 0 })]);
    const themes = [biz(1, true, [theme('wait_time', 0.6, -0.5), theme('staff', 0.5, 0.8)]), biz(2, false, [theme('wait_time', 0.1, 0), theme('staff', 0.1, 0)])];
    const base0 = await base({ scorecard: sc, themes, profile: { claimed: false, hasHours: false, categoryCount: 1 } });
    const r = evaluateSelfRules({ ...base0, rules: [...base0.rules, { ...base0.rules.find((x) => x.id === 'topic_strength')!, params: { gap: 0.05 } }] });
    expect(r.length).toBe(5);
    expect(r.map((f) => f.score)).toEqual([...r.map((f) => f.score)].sort((a, b) => b - a));
    expect(r.filter((f) => f.strength).length).toBeLessThanOrEqual(1);
    expect(r[0]!.ruleId).toBe('review_velocity_gap');
  });

  it('drops a finding that has no evidence (no evidence, no claim)', async () => {
    const sc = card([row(1, 'Me', { rating: 3 }, true), row(2, 'A', { rating: 4.8 })]);
    expect(evaluateSelfRules(await base({ scorecard: sc, evidenceByCompetitor: {} }))).toEqual([]);
  });
});
