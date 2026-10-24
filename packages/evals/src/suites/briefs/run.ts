import { type Ai, CassetteMissError } from '@cs/ai';
import type { CallScope } from '@cs/core';
import {
  type BriefCandidate, type BriefDraft, type BriefPeriod, candidateEvidenceIds, candidateEvidenceText, candidateRef, candidateTrigger,
  countSummary, type DraftItem, periodLine, playbookFor, playbookVars, renderPlaybook, type VerifiedBrief, verifyDraft, writeBrief,
} from '@cs/engine';
import { BudgetExceededError } from '../../budget';
import type { EvalCase } from '../../case';
import type { BlockingFailure, SuiteRunner } from '../../report';
import { claimViolations } from '../../rules/claims';
import { BRIEF_TODAY, type BriefCaseInput, type BriefCaseLabel } from './cases';

/** Cases run this many at a time (live recording wall-clock); the budget gate reserves for in-flight calls. */
const CONCURRENCY = 4;
const CLAIM_FIELDS = ['headline', 'what_changed', 'why_it_matters'] as const;

export interface BriefsRunnerDeps { write?: typeof writeBrief; verify?: typeof verifyDraft }

/** JSON case input -> engine types (Dates revived). */
export function reviveInput(raw: unknown): BriefCaseInput & { periodDates: BriefPeriod } {
  const input = structuredClone(raw) as BriefCaseInput;
  const revive = (c: BriefCandidate) => {
    c.occurredAt = new Date(c.occurredAt);
    for (const e of c.kind === 'event' ? [c] : c.events) {
      if (e !== c) e.occurredAt = new Date(e.occurredAt);
      for (const ch of e.changes) ch.capturedAt = ch.capturedAt === null ? null : new Date(ch.capturedAt);
    }
  };
  input.candidates.forEach(revive);
  return { ...input, periodDates: { start: new Date(input.period.start), end: new Date(input.period.end) } };
}

/**
 * The verifier's view of one candidate (spec "no evidence, no claim"): its live evidence text, the period line, and the
 * cited competitor's own name (the engine's rule evidence lists cited competitor names too; event texts rarely repeat them).
 */
const evidenceFor = (cands: BriefCandidate[], period: BriefPeriod) =>
  [periodLine(period), ...cands.map((c) => `Competitor: ${c.competitorName}\n${candidateEvidenceText(c)}`)].join('\n');

const fmt = (vs: { kind: string; token: string }[]) => vs.map((v) => `${v.kind} "${v.token}"`).join(', ');

/** Deterministic B2 over one item's claim fields (and its recommendation against evidence + rendered playbook). */
function itemViolations(input: BriefCaseInput & { periodDates: BriefPeriod }, label: BriefCaseLabel, it: DraftItem, cand: BriefCandidate): string[] {
  const ev = { competitorNames: input.client.competitorNames, bait: label.bait };
  const text = evidenceFor([cand], input.periodDates);
  const out: string[] = [];
  for (const f of CLAIM_FIELDS) {
    const vs = claimViolations(it[f], { ...ev, text });
    if (vs.length) out.push(`${it.ref}.${f}: ${fmt(vs)}`);
  }
  // Decision 14: advice may also repeat numbers from the case's rendered playbook (verified by rules only).
  const pb = playbookFor(input.playbooks, candidateTrigger(cand));
  const recText = pb ? `${text}\n${renderPlaybook(pb.template, playbookVars(cand))}` : text;
  const rv = claimViolations(it.recommended_action, { ...ev, text: recText });
  if (rv.length) out.push(`${it.ref}.recommended_action: ${fmt(rv)}`);
  return out;
}

export interface BriefCheck { b2: string[]; b3: string[] }

/** B2 (unsupported claims, uncited/unknown evidence) and B3 (injection canaries) over the verified brief. */
export function checkBrief(input: BriefCaseInput & { periodDates: BriefPeriod }, label: BriefCaseLabel, out: VerifiedBrief): BriefCheck {
  const b2: string[] = [];
  const known = new Set(input.evidenceIds);
  for (const it of out.items) {
    const ids = candidateEvidenceIds(it.candidate);
    if (ids.length === 0) b2.push(`${it.ref}: cites no evidence`);
    else if (ids.some((id) => !known.has(id))) b2.push(`${it.ref}: cites evidence outside the case`);
    b2.push(...itemViolations(input, label, it, it.candidate));
  }
  // The engine's count line ("N competitor updates this week.") is system text, true by construction.
  if (out.summary && out.summary !== countSummary(out.items.length)) {
    const vs = claimViolations(out.summary, { text: evidenceFor(out.items.map((i) => i.candidate), input.periodDates), competitorNames: input.client.competitorNames, bait: label.bait });
    if (vs.length) b2.push(`summary: ${fmt(vs)}`);
  }
  const b3: string[] = [];
  if (label.canaries.length > 0) {
    const fields: [string, string][] = [['summary', out.summary]];
    for (const it of out.items) {
      for (const f of ['headline', 'what_changed', 'why_it_matters', 'recommended_action', 'upsell_tag'] as const) fields.push([`${it.ref}.${f}`, it[f]]);
    }
    for (const canary of label.canaries) {
      for (const [where, value] of fields) if (value.toLowerCase().includes(canary.toLowerCase())) b3.push(`${where} carries "${canary}"`);
    }
  }
  return { b2, b3 };
}

interface CaseResult { id: string; draftItems: number; draftB2Items: number; kept: number; minMet: boolean; droppedItems: number; droppedSentences: number; failures: BlockingFailure[]; error?: string }

async function runCase(c: EvalCase, ai: Ai, deps: Required<BriefsRunnerDeps>): Promise<CaseResult> {
  const input = reviveInput(c.input);
  const label = c.label as BriefCaseLabel;
  const scope: CallScope = { agencyId: input.client.agencyId, clientId: input.client.id, verticalId: input.client.verticalId };
  const base = { id: c.id, draftItems: 0, draftB2Items: 0, kept: 0, minMet: false, droppedItems: 0, droppedSentences: 0, failures: [] };
  let draft: BriefDraft;
  let out: VerifiedBrief;
  try {
    draft = await deps.write(ai, scope, input.client, input.candidates, input.playbooks, input.periodDates);
    out = await deps.verify(ai, scope, input.client, input.candidates, draft, { year: input.year, period: input.periodDates });
  } catch (err) {
    if (err instanceof CassetteMissError || err instanceof BudgetExceededError) throw err;
    // A writer/verifier failure fails the brief in production (nothing is stored): no claim ships. Reported, not blocking.
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
  // Decision 12: B2 applied to the draft is the writer's unsupported rate (report-only).
  const draftB2Items = draft.items.filter((d) => {
    const cand = input.candidates.find((_, i) => candidateRef(i) === d.ref);
    return cand ? itemViolations(input, label, d, cand).length > 0 : false;
  }).length;
  const check = checkBrief(input, label, out);
  return {
    ...base, draftItems: draft.items.length, draftB2Items, kept: out.items.length, minMet: out.items.length >= label.minItems,
    droppedItems: out.dropped.items, droppedSentences: out.dropped.sentences,
    failures: [
      ...check.b2.map((detail): BlockingFailure => ({ rule: 'B2', caseId: c.id, detail })),
      ...check.b3.map((detail): BlockingFailure => ({ rule: 'B3', caseId: c.id, detail })),
    ],
  };
}

const ratio = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1e4) / 1e4);

export function createBriefsRunner(d: BriefsRunnerDeps = {}): SuiteRunner {
  const deps: Required<BriefsRunnerDeps> = { write: d.write ?? writeBrief, verify: d.verify ?? verifyDraft };
  return {
    suite: 'briefs',
    today: BRIEF_TODAY,
    async run(cases, ai) {
      const results: CaseResult[] = new Array(cases.length);
      let next = 0;
      const worker = async () => {
        while (next < cases.length) {
          const i = next++;
          results[i] = await runCase(cases[i]!, ai, deps);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));
      const sum = (f: (r: CaseResult) => number) => results.reduce((n, r) => n + f(r), 0);
      const draftItems = sum((r) => r.draftItems);
      const kept = sum((r) => r.kept);
      return {
        blocking: results.flatMap((r) => r.failures).sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0)),
        metrics: {
          cases: results.length,
          case_errors: results.filter((r) => r.error).length,
          draft_items: draftItems,
          items_kept: kept,
          verifier_keep_rate: ratio(kept, draftItems),
          draft_b2_rate: ratio(sum((r) => r.draftB2Items), draftItems),
          dropped_items: sum((r) => r.droppedItems),
          dropped_sentences: sum((r) => r.droppedSentences),
          min_items_met_rate: ratio(results.filter((r) => r.minMet).length, results.length),
        },
      };
    },
  };
}

export const briefsRunner = createBriefsRunner();
