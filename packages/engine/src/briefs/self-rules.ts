import type { SelfRuleId } from '@cs/core';
import type { PackSelfRule } from '@cs/verticals';
import type { BenchmarkBusiness } from '../reviews/benchmark';
import { median, type Scorecard, type ScorecardMetric } from './scorecard';

export type SelfFinding = {
  ruleId: SelfRuleId;
  strength: boolean;
  score: number;
  fact: string;
  values: Record<string, number | string>;
  evidenceIds: string[];
  playbookId: string;
};

export interface SelfRuleInput {
  scorecard: Scorecard;
  themes: BenchmarkBusiness[];
  profile: { claimed: boolean | null; hasHours: boolean | null; categoryCount: number | null };
  rules: PackSelfRule[];
  /** The latest rank scan recorded vendor captures (Phase 12b Q1); `map_visibility_gap` is skipped without it. */
  rankHasEvidence: boolean;
  /** Pack `audience_noun` ("patients", "customers"), used by the strength fact. */
  audienceNoun: string;
  /**
   * Evidence per business (keyed by `competitorId`, the client's own row included) and the map-pack captures. Findings cite only the
   * evidence of the businesses they compare, never the whole scorecard; a finding with no evidence is dropped (no evidence, no claim).
   */
  evidenceByCompetitor: Record<string, string[]>;
  rankEvidenceIds: string[];
}

export const SELF_FINDINGS_MAX = 5;
const EVIDENCE_PER_FINDING = 12;

const pct = (x: number) => Math.round(x * 100);
const r2 = (x: number) => Math.round(x * 100) / 100;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const param = (rule: PackSelfRule, key: string, fallback: number) => rule.params[key] ?? fallback;
const score = (rule: PackSelfRule, gap: number, normaliser: number) => r2(rule.weight * Math.min(1, Math.abs(gap) / normaliser));
const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
/** One decimal, or two when one decimal would make the two ratings look equal. */
const ratings = (a: number, b: number): [string, string] => {
  const [x, y] = [a.toFixed(1), b.toFixed(1)];
  return x === y ? [a.toFixed(2), b.toFixed(2)] : [x, y];
};

/**
 * Spec § Self-rules: a closed set of named predicates over the scorecard, review themes and profile facts. Each qualifying rule yields
 * a fixed-template fact with its own evidence; findings are ranked by `weight × min(1, |gap| / normaliser)`, at most 5, at most one strength.
 */
export function evaluateSelfRules(input: SelfRuleInput): SelfFinding[] {
  const { scorecard, rules } = input;
  const self = scorecard.rows.find((r) => r.self);
  const rivals = scorecard.rows.filter((r) => !r.self);
  const evidenceOf = (ids: (string | null)[]): string[] => {
    const out: string[] = [];
    for (const id of ids) for (const e of (id ? input.evidenceByCompetitor[id] : undefined) ?? []) if (!out.includes(e) && out.length < EVIDENCE_PER_FINDING) out.push(e);
    return out;
  };
  const you = (m: ScorecardMetric) => self?.values[m] ?? null;
  const rivalMedian = (m: ScorecardMetric) => median(rivals.map((r) => r.values[m]));
  const selfId = self?.competitorId ?? null;
  const selfTheme = input.themes.find((b) => b.self);
  const rivalThemes = input.themes.filter((b) => !b.self);

  const out: SelfFinding[] = [];
  const push = (rule: PackSelfRule, s: number, fact: string, values: Record<string, number | string>, evidenceIds: string[]) => {
    if (evidenceIds.length === 0) return;
    out.push({ ruleId: rule.id, strength: rule.strength, score: s, fact, values, evidenceIds, playbookId: rule.playbook });
  };

  for (const rule of rules) {
    switch (rule.id) {
      case 'review_velocity_gap': {
        const y = you('reviews90d');
        const med = rivalMedian('reviews90d');
        const ratio = param(rule, 'ratio', 0.5);
        if (y === null || med === null || med <= 0 || !(y < ratio * med)) break;
        const top = rivals.filter((r) => r.values.reviews90d !== null).sort((a, b) => b.values.reviews90d! - a.values.reviews90d!)[0]!;
        push(rule, score(rule, 1 - y / med, ratio), `You got ${y} new reviews in 90 days; ${top.name} got ${top.values.reviews90d}.`,
          { you: y, median: med, topRival: top.name, theirs: top.values.reviews90d! }, evidenceOf([selfId, top.competitorId]));
        break;
      }
      case 'reply_rate_gap': {
        const y = you('replyRate');
        const med = rivalMedian('replyRate');
        const gap = param(rule, 'gap', 0.25);
        if (y === null || med === null || !(y < med - gap)) break;
        push(rule, score(rule, med - y, 0.5), `You replied to ${pct(y)}% of reviews; rivals average ${pct(med)}%.`, { you: y, median: med },
          evidenceOf([selfId, ...rivals.filter((r) => r.values.replyRate !== null).map((r) => r.competitorId)]));
        break;
      }
      case 'rating_gap': {
        const y = you('rating');
        const med = rivalMedian('rating');
        const gap = param(rule, 'gap', 0.2);
        if (y === null || med === null || !(y < med - gap)) break;
        const [ys, ms] = ratings(y, med);
        push(rule, score(rule, med - y, 1), `Your rating is ${ys}; the rival median is ${ms}.`, { you: y, median: med },
          evidenceOf([selfId, ...rivals.filter((r) => r.values.rating !== null).map((r) => r.competitorId)]));
        break;
      }
      case 'rival_only_advertiser': {
        const advertisers = rivals.filter((r) => (r.values.adsActive ?? 0) > 0);
        if (you('adsActive') !== 0 || advertisers.length === 0) break;
        const names = advertisers.slice(0, 3).map((r) => r.name);
        push(rule, r2(rule.weight), `${joinNames(names)} run ads; you run none.`, { advertisers: advertisers.length, rivalNames: joinNames(names) },
          evidenceOf([selfId, ...advertisers.map((r) => r.competitorId)]));
        break;
      }
      case 'theme_weakness':
      case 'theme_strength': {
        if (!selfTheme || rivalThemes.length === 0) break;
        const threshold = param(rule, 'gap', 0.1);
        let best: { name: string; you: number; med: number; gap: number; sentiment: number; rivalIds: string[] } | null = null;
        for (const t of selfTheme.themes) {
          if (t.share === null || t.sentiment === null) continue;
          const rs = rivalThemes
            .map((b) => ({ id: b.competitorId, share: b.themes.find((x) => x.themeId === t.themeId)?.share ?? null }))
            .filter((x): x is { id: string; share: number } => x.share !== null);
          const med = median(rs.map((x) => x.share));
          if (med === null) continue;
          const gap = t.share - med;
          const ok = rule.id === 'theme_weakness' ? gap <= -threshold && t.sentiment < 0 : gap >= threshold && t.sentiment > 0;
          if (ok && (best === null || Math.abs(gap) > Math.abs(best.gap))) best = { name: t.name, you: t.share, med, gap, sentiment: t.sentiment, rivalIds: rs.map((x) => x.id) };
        }
        if (!best) break;
        const fact = rule.id === 'theme_weakness'
          ? `${best.name} comes up in ${pct(best.you)}% of your reviews vs ${pct(best.med)}% for rivals.`
          : `${capitalise(input.audienceNoun)} mention ${lowerFirst(best.name)} in ${pct(best.you)}% of your reviews vs ${pct(best.med)}% for rivals.`;
        push(rule, score(rule, best.gap, 0.3), fact, { theme: best.name, you: best.you, median: best.med, sentiment: best.sentiment }, evidenceOf([selfId, ...best.rivalIds]));
        break;
      }
      case 'map_visibility_gap': {
        const y = you('mapTop3Share');
        const med = rivalMedian('mapTop3Share');
        const gap = param(rule, 'gap', 0.1);
        if (!input.rankHasEvidence || y === null || med === null || !(y < med - gap)) break;
        push(rule, score(rule, med - y, 0.5), `You appear in the map top 3 in ${pct(y)}% of searches; rivals ${pct(med)}%.`, { you: y, median: med },
          input.rankEvidenceIds.slice(0, EVIDENCE_PER_FINDING));
        break;
      }
      case 'profile_gap': {
        const { claimed, hasHours, categoryCount } = input.profile;
        const missing = [
          ...(claimed === false ? ['ownership claim'] : []),
          ...(hasHours === false ? ['opening hours'] : []),
          ...(categoryCount !== null && categoryCount < param(rule, 'min_categories', 2) ? ['additional categories'] : []),
        ];
        if (missing.length === 0) break;
        push(rule, score(rule, missing.length, 3), `Your Google profile is missing: ${missing.join(', ')}.`, { missing: missing.join(', '), count: missing.length }, evidenceOf([selfId]));
        break;
      }
    }
  }

  const ranked = out.map((f, i) => ({ f, i })).sort((a, b) => b.f.score - a.f.score || a.i - b.i).map((x) => x.f);
  const picked: SelfFinding[] = [];
  let strengths = 0;
  for (const f of ranked) {
    if (picked.length >= SELF_FINDINGS_MAX) break;
    if (f.strength && strengths >= 1) continue;
    if (f.strength) strengths++;
    picked.push(f);
  }
  return picked;
}
