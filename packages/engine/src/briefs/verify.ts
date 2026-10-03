import type { Ai } from '@cs/ai';
import type { CallScope } from '@cs/core';
import type { BriefDropStats } from '@cs/db';
import { type BriefCandidate, type BriefClient, candidateEvents } from './gather';
import { checkSentence, type RuleContext, type RuleEvidence, splitSentences } from './rules';
import { type ClaimMode, supportCheck } from './support';
import { type BriefDraft, candidateEvidenceText, candidateRef, type DraftItem } from './writer';

export interface VerifiedItem extends DraftItem {
  candidate: BriefCandidate;
}
export interface VerifiedBrief {
  summary: string;
  items: VerifiedItem[];
  dropped: BriefDropStats;
}

const FIELDS: { field: 'headline' | 'what_changed' | 'why_it_matters' | 'recommended_action'; mode: ClaimMode | null }[] = [
  { field: 'headline', mode: 'fact' },
  { field: 'what_changed', mode: 'fact' },
  { field: 'why_it_matters', mode: 'interpretation' },
  { field: 'recommended_action', mode: null }, // advice: deterministic rules only
];

export function ruleEvidenceFor(cands: BriefCandidate[]): RuleEvidence {
  const events = cands.flatMap(candidateEvents);
  return {
    text: cands.map(candidateEvidenceText).join('\n'),
    captureDates: events.flatMap((e) => e.changes.map((c) => c.capturedAt)).filter((d): d is Date => d !== null),
    zips: [...new Set(events.flatMap((e) => e.zips))],
    competitorNames: [...new Set(cands.map((c) => c.competitorName))],
  };
}

const ruleContext = (c: BriefClient, year: number): RuleContext => ({ trackedCompetitorNames: c.competitorNames, clientTowns: c.towns, year });

/** Verifies one block of text against the cited candidates; returns the surviving sentences joined. */
export async function verifyText(
  ai: Ai, scope: CallScope, c: BriefClient, cands: BriefCandidate[], text: string, mode: ClaimMode | null, opts: { year: number },
): Promise<{ kept: string; dropped: number }> {
  const ev = ruleEvidenceFor(cands);
  const sentences = splitSentences(text);
  const passing = sentences.map((s, i) => ({ key: `s${i}`, sentence: s, mode: mode ?? 'fact' })).filter((x) => checkSentence(x.sentence, ev, ruleContext(c, opts.year)).ok);
  const supported = mode === null ? new Set(passing.map((p) => p.key)) : await supportCheck(ai, scope, ev.text, passing);
  const kept = passing.filter((p) => supported.has(p.key)).map((p) => p.sentence);
  return { kept: kept.join(' '), dropped: sentences.length - kept.length };
}

export async function verifyDraft(ai: Ai, scope: CallScope, c: BriefClient, candidates: BriefCandidate[], draft: BriefDraft, opts: { year: number }): Promise<VerifiedBrief> {
  const dropped: BriefDropStats = { items: 0, sentences: 0 };
  const items: VerifiedItem[] = [];
  for (const d of draft.items) {
    const idx = candidates.findIndex((_, i) => candidateRef(i) === d.ref);
    const cand = candidates[idx];
    if (!cand) continue;
    const out: Partial<Record<(typeof FIELDS)[number]['field'], string>> = {};
    let failed = false;
    for (const f of FIELDS) {
      const r = await verifyText(ai, scope, c, [cand], d[f.field], f.mode, opts);
      dropped.sentences += r.dropped;
      out[f.field] = r.kept;
      if ((f.field === 'headline' && (r.dropped > 0 || !r.kept)) || (f.field === 'what_changed' && !r.kept)) {
        failed = true;
        break;
      }
    }
    if (failed) {
      dropped.items++;
      continue;
    }
    items.push({ ...d, headline: out.headline!, what_changed: out.what_changed!, why_it_matters: out.why_it_matters ?? '', recommended_action: out.recommended_action ?? '', candidate: cand });
  }
  let summary = '';
  if (items.length > 0 && draft.summary) {
    const r = await verifyText(ai, scope, c, items.map((i) => i.candidate), draft.summary, 'fact', opts);
    dropped.sentences += r.dropped;
    summary = r.kept;
  }
  if (!summary && items.length > 0) summary = `${items.length} competitor update${items.length === 1 ? '' : 's'} this week.`;
  return { summary, items, dropped };
}
