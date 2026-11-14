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
  effort: 'L' | 'M' | 'H';
  impact: 'L' | 'M' | 'H';
};

export interface SelfRuleInput {
  scorecard: Scorecard;
  topics: BenchmarkBusiness[];
  profile: { claimed: boolean | null; hasHours: boolean | null; categoryCount: number | null };
  rules: PackSelfRule[];
  /** The pack's `playbooks`; each rule's playbook supplies the finding's effort and impact. */
  playbooks: { id: string; effort?: 'L' | 'M' | 'H'; impact?: 'L' | 'M' | 'H' }[];
  /** The latest rank scan recorded vendor captures (Phase 12b Q1); `map_visibility_gap` is skipped without it. */
  rankHasEvidence: boolean;
  /** Pack `audience_noun` ("patients", "customers"), used by the strength fact. */
  audienceNoun: string;
  /**
   * Evidence per business (keyed by `competitorId`, the client's own row included) and the map-pack captures. Findings cite only the
   * evidence of the businesses they compare, never the whole scorecard; a finding with no evidence is dropped (no evidence, no claim).
   */
  evidenceByCompetitor: Record<string, string[]>;
  /** Evidence of each business's latest ok `google_ads` capture (keyed by `competitorId`, self included): what `rival_only_advertiser` cites. */
  adEvidenceByCompetitor: Record<string, string[]>;
  rankEvidenceIds: string[];
  /**
   * Phase 18c: the client's own directory listings from the latest audit; null = never audited (rule skipped). `not_checked` hosts never
   * count; `total` = catalogue hosts that were listed or not found. Evidence = the stored captures behind those rows.
   */
  citations: {
    checkedAt: string; total: number;
    missing: { host: string; label: string; rivalsListed: number }[];
    mismatched: { host: string; label: string; field: 'name' | 'phone' }[];
    evidenceIds: string[];
  } | null;
  /**
   * Phase 18d (D11, Task 12 fix ruling 1): upcoming non-series events each business currently shows (`upcomingEvents`). `selfCount` null =
   * your events were never measured (rule skipped);
   * `rivals` = measured rivals only. Evidence = the newest measured events capture of you and the rivals named.
   */
  events: { selfCount: number | null; rivals: { competitorId: string; name: string; count: number }[]; evidenceIds: string[] } | null;
  /**
   * Phase 18e (P7): evidence ids of each business's newest ok social captures, keyed by `competitorId` (`social_gap` cites the qualifying rivals'). Absent = rule skipped.
   */
  socialEvidenceByCompetitor?: Record<string, string[]>;
}

export const SELF_FINDINGS_MAX = 5;
const EVIDENCE_PER_FINDING = 12;

/** `social_gap` fact (draft for copy review); also the scorecard evidence line the rule checker reads. */
export const socialGapFact = (n: number) => `${n} ${n === 1 ? 'rival posts' : 'rivals post'} weekly on Facebook or Instagram; you haven't posted in 30 days.`;

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
 * The `citation_gap` finding: fixed-template fact over the client's own directory rows. Shared by the starting point (via
 * `evaluateSelfRules`) and the recommendations board (`recommendForCitations`). No evidence, no finding.
 */
export function citationGapFinding(rule: PackSelfRule, c: SelfRuleInput['citations'], playbooks: SelfRuleInput['playbooks']): SelfFinding | null {
  if (!c || c.total === 0) return null;
  const listed = c.missing.length >= param(rule, 'min_missing', 3) ? c.missing : [];
  if (listed.length === 0 && c.mismatched.length === 0) return null;
  const evidenceIds = c.evidenceIds.slice(0, EVIDENCE_PER_FINDING);
  if (evidenceIds.length === 0) return null;
  const labels = joinNames(listed.map((m) => m.label));
  const facts: string[] = [];
  if (listed.length) facts.push(`Google search found no listing for you on ${listed.length} of ${c.total} directories we check: ${labels}.`);
  for (const m of c.mismatched.slice(0, 2)) facts.push(`${m.label} shows a different ${m.field} for you than your Google profile.`);
  const pb = playbooks.find((p) => p.id === rule.playbook);
  return {
    ruleId: rule.id, strength: rule.strength, score: score(rule, c.missing.length + 2 * c.mismatched.length, c.total), fact: facts.join(' '),
    values: { missing: listed.length, total: c.total, directories: labels || joinNames([...new Set(c.mismatched.map((m) => m.label))]) },
    evidenceIds, playbookId: rule.playbook, effort: pb?.effort ?? 'M', impact: pb?.impact ?? 'M',
  };
}

/**
 * Spec § Self-rules: a closed set of named predicates over the scorecard, review topics and profile facts. Each qualifying rule yields
 * a fixed-template fact with its own evidence; findings are ranked by `weight × min(1, |gap| / normaliser)`, at most 5, at most one strength.
 */
export function evaluateSelfRules(input: SelfRuleInput): SelfFinding[] {
  const { scorecard, rules } = input;
  const self = scorecard.rows.find((r) => r.self);
  const rivals = scorecard.rows.filter((r) => !r.self);
  const evidenceOf = (ids: (string | null)[], by: Record<string, string[]> = input.evidenceByCompetitor): string[] => {
    const out: string[] = [];
    for (const id of ids) for (const e of (id ? by[id] : undefined) ?? []) if (!out.includes(e) && out.length < EVIDENCE_PER_FINDING) out.push(e);
    return out;
  };
  const hasAdEvidence = (id: string | null) => id !== null && (input.adEvidenceByCompetitor[id]?.length ?? 0) > 0;
  const you = (m: ScorecardMetric) => self?.values[m] ?? null;
  const rivalMedian = (m: ScorecardMetric) => median(rivals.map((r) => r.values[m]));
  const selfId = self?.competitorId ?? null;
  const selfTopic = input.topics.find((b) => b.self);
  const rivalTopics = input.topics.filter((b) => !b.self);

  const out: SelfFinding[] = [];
  const push = (rule: PackSelfRule, s: number, fact: string, values: Record<string, number | string>, evidenceIds: string[]) => {
    if (evidenceIds.length === 0) return;
    const pb = input.playbooks.find((p) => p.id === rule.playbook);
    out.push({ ruleId: rule.id, strength: rule.strength, score: s, fact, values, evidenceIds, playbookId: rule.playbook, effort: pb?.effort ?? 'M', impact: pb?.impact ?? 'M' });
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
        push(rule, score(rule, med - y, 0.5), `You replied to ${pct(y)}% of reviews; the rival median is ${pct(med)}%.`, { you: y, median: med },
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
        // Cites ad captures only: a named advertiser without ad evidence is left out, and "you run none" needs your own ad check.
        const advertisers = rivals.filter((r) => (r.values.adsActive ?? 0) > 0 && hasAdEvidence(r.competitorId));
        if (you('adsActive') !== 0 || !hasAdEvidence(selfId) || advertisers.length === 0) break;
        const named = advertisers.slice(0, 3);
        const names = named.map((r) => r.name);
        push(rule, r2(rule.weight), `${joinNames(names)} run ads; you run none.`, { advertisers: advertisers.length, rivalNames: joinNames(names) },
          evidenceOf([selfId, ...named.map((r) => r.competitorId)], input.adEvidenceByCompetitor));
        break;
      }
      case 'topic_weakness':
      case 'topic_strength': {
        if (!selfTopic || rivalTopics.length === 0) break;
        const threshold = param(rule, 'gap', 0.1);
        let best: { name: string; you: number; med: number; gap: number; sentiment: number; rivalIds: string[] } | null = null;
        for (const t of selfTopic.topics) {
          if (t.share === null || t.sentiment === null) continue;
          const rs = rivalTopics
            .map((b) => ({ id: b.competitorId, share: b.topics.find((x) => x.topicId === t.topicId)?.share ?? null }))
            .filter((x): x is { id: string; share: number } => x.share !== null);
          const med = median(rs.map((x) => x.share));
          if (med === null) continue;
          const gap = t.share - med;
          // The client is mentioned at least `threshold` more than rivals for the topic; the sentiment decides weakness (negative) or strength (positive).
          const ok = gap >= threshold && (rule.id === 'topic_weakness' ? t.sentiment < 0 : t.sentiment > 0);
          if (ok && (best === null || Math.abs(gap) > Math.abs(best.gap))) best = { name: t.name, you: t.share, med, gap, sentiment: t.sentiment, rivalIds: rs.map((x) => x.id) };
        }
        if (!best) break;
        const fact = rule.id === 'topic_weakness'
          ? `${best.name} comes up in ${pct(best.you)}% of your reviews vs ${pct(best.med)}% for rivals.`
          : `${capitalise(input.audienceNoun)} mention ${lowerFirst(best.name)} in ${pct(best.you)}% of your reviews vs ${pct(best.med)}% for rivals.`;
        push(rule, score(rule, best.gap, 0.3), fact, { topic: best.name, you: best.you, median: best.med, sentiment: best.sentiment }, evidenceOf([selfId, ...best.rivalIds]));
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
      case 'citation_gap': {
        const f = citationGapFinding(rule, input.citations, input.playbooks);
        if (f) out.push(f);
        break;
      }
      case 'event_gap': {
        const e = input.events;
        if (!e || e.selfCount !== 0) break;
        const total = e.rivals.reduce((n, r) => n + r.count, 0);
        if (total < param(rule, 'min_rival_events', 2)) break;
        const named = e.rivals.filter((r) => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 3).map((r) => r.name);
        const names = joinNames(named);
        // Fact copy: draft for copy review (Task 12 fix ruling 1). Verb and noun agree in number.
        push(rule, score(rule, total, 6), `${names} ${named.length === 1 ? 'lists' : 'list'} ${total} upcoming event${total === 1 ? '' : 's'}; none found for you.`, { total, rivalNames: names },
          e.evidenceIds.slice(0, EVIDENCE_PER_FINDING));
        break;
      }
      case 'social_gap': {
        // You have a confirmed account (count not null) but no post in 30 days, while enough rivals post at least weekly.
        if (you('socialPosts30d') !== 0) break;
        const minPosts = param(rule, 'min_rival_posts', 4);
        const posting = input.scorecard.rows.filter((r) => !r.self && r.competitorId && (r.values.socialPosts30d ?? 0) >= minPosts);
        const n = posting.length;
        if (n < param(rule, 'min_rivals', 2)) break;
        const evidenceIds = [...new Set(posting.flatMap((r) => input.socialEvidenceByCompetitor?.[r.competitorId!] ?? []))];
        // Fact copy: draft for copy review (18e Task 8).
        push(rule, score(rule, n, 4), socialGapFact(n), { rivals: n }, evidenceIds.slice(0, EVIDENCE_PER_FINDING));
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
        push(rule, score(rule, missing.length, 1), `Your Google profile is missing: ${missing.join(', ')}.`, { missing: missing.join(', '), count: missing.length }, evidenceOf([selfId]));
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
