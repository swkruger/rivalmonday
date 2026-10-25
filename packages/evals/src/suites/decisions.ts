import { type Ai, CassetteMissError, type DecisionResult } from '@cs/ai';
import { answerProbability, computeDecisionReport, type LabeledAnswer, questionFamily, type ReportRole } from '@cs/engine';
import { BudgetExceededError } from '../budget';
import { type LabelSuite, questionsFor } from '../build/common';
import type { EvalCase } from '../case';
import type { SuiteRunner } from '../report';

/** Cases run this many at a time (live recording wall-clock). */
const CONCURRENCY = 4;
const SCOPE = { agencyId: null, clientId: null } as const;

export const SUITE_TASKS: Record<LabelSuite, 'tag_decisions' | 'review_decisions'> = { changes: 'tag_decisions', reviews: 'review_decisions' };

type Answer = { value?: unknown };
const same = (answer: unknown, label: string) => String((answer as Answer).value) === label;

/**
 * One case's decision -> the engine report's `LabeledAnswer`s per role. `primary`/`fallback` come from the cascade trace
 * (the fallback only holds the keys it was asked), `final` from the resolved answers. `provider` is the role name so
 * providers pool per role (Jev is the primary, the LLM the fallback); the real provider ids are listed in the report note.
 */
export function labeledAnswers(task: string, caseId: string, label: Record<string, string>, result: DecisionResult<string>): LabeledAnswer[] {
  const out: LabeledAnswer[] = [];
  for (const [key, expected] of Object.entries(label)) {
    const push = (role: ReportRole, answer: unknown) => {
      if (!answer) return;
      out.push({ sampleId: caseId, key, task, family: questionFamily(key), role, provider: role, probability: answerProbability(answer), correct: same(answer, expected) });
    };
    push('primary', result.trace?.primary?.answers[key]);
    push('fallback', result.trace?.fallback?.answers[key]);
    push('final', (result.answers as Record<string, unknown>)[key]);
  }
  return out;
}

/** `<prefix><task>.<family>.<role>.accuracy|ece|n` for every (family, role) with answers. */
export function decisionMetrics(prefix: string, items: LabeledAnswer[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of computeDecisionReport(items)) {
    const base = `${prefix}${r.task}.${r.family}.${r.role}`;
    out[`${base}.accuracy`] = r.accuracy;
    out[`${base}.ece`] = r.ece;
    out[`${base}.n`] = r.n;
  }
  return out;
}

export interface Prf { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
/** Precision/recall/F1 over (predicted, actual) booleans; 0 where undefined. */
export function prf(pairs: { predicted: boolean; actual: boolean }[]): Prf {
  const tp = pairs.filter((p) => p.predicted && p.actual).length;
  const fp = pairs.filter((p) => p.predicted && !p.actual).length;
  const fn = pairs.filter((p) => !p.predicted && p.actual).length;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision: r4(precision), recall: r4(recall), f1: r4(f1), tp, fp, fn };
}

export interface Scored { id: string; label: Record<string, string>; result: DecisionResult<string> }

/** Reviews: topic (`theme_*` question) P/R/F1 on the final answers and sentiment mean absolute error. */
export function reviewMetrics(prefix: string, scored: Scored[]): Record<string, number> {
  const pairs: { predicted: boolean; actual: boolean }[] = [];
  const errs: number[] = [];
  for (const s of scored) {
    for (const [key, expected] of Object.entries(s.label)) {
      const answer = (s.result.answers as Record<string, Answer | undefined>)[key];
      if (!answer) continue;
      // kept: model-ops key (15b-3 C7) — question keys stay theme_*
      if (key.startsWith('theme_')) pairs.push({ predicted: String(answer.value) === 'true', actual: expected === 'true' });
      if (key === 'sentiment' && Number.isFinite(Number(answer.value)) && Number.isFinite(Number(expected))) errs.push(Math.abs(Number(answer.value) - Number(expected)));
    }
  }
  const t = prf(pairs);
  return {
    [`${prefix}topic.precision`]: t.precision,
    [`${prefix}topic.recall`]: t.recall,
    [`${prefix}topic.f1`]: t.f1,
    [`${prefix}topic.n`]: pairs.length,
    [`${prefix}sentiment.mae`]: errs.length === 0 ? 0 : r4(errs.reduce((a, b) => a + b, 0) / errs.length),
    [`${prefix}sentiment.n`]: errs.length,
  };
}

interface CaseRun { case: EvalCase; label: Record<string, string> | null; result?: DecisionResult<string>; error?: string }
type Ok = CaseRun & { result: DecisionResult<string>; label: Record<string, string> };

/**
 * Report-only decision-accuracy suite. Only `confirmedAt` cases count toward the headline metrics; the rest are counted in
 * `unconfirmed`, and their pre-labels give separate `prelabel_agreement.*` metrics (agreement with an unreviewed model or
 * template label, not accuracy). Never blocking.
 */
export function createDecisionRunner(suite: LabelSuite): SuiteRunner {
  const task = SUITE_TASKS[suite];
  const extra = (prefix: string, scored: Scored[]): Record<string, number> => (suite === 'reviews' ? reviewMetrics(prefix, scored) : {});
  return {
    suite,
    async run(cases, ai: Ai) {
      const runs: CaseRun[] = new Array(cases.length);
      let next = 0;
      const one = async (c: EvalCase): Promise<CaseRun> => {
        const label = (c.label as Record<string, string> | null) ?? null;
        try {
          const input = c.input as { state: unknown; verticalIds: string[]; questionKeys: string[] };
          const questions = questionsFor(suite, input.verticalIds);
          if (Object.keys(questions).join('|') !== input.questionKeys.join('|')) throw new Error("questionKeys differ from the verticals' questions (rebuild the suite)");
          return { case: c, label, result: await ai.decide(task, input.state, questions, SCOPE) };
        } catch (err) {
          if (err instanceof CassetteMissError || err instanceof BudgetExceededError) throw err;
          return { case: c, label, error: err instanceof Error ? err.message : String(err) };
        }
      };
      const worker = async () => {
        while (next < cases.length) {
          const i = next++;
          runs[i] = await one(cases[i]!);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));

      const ok = runs.filter((r): r is Ok => r.result !== undefined && r.label !== null);
      const confirmed = ok.filter((r) => r.case.confirmedAt !== null);
      const pending = ok.filter((r) => r.case.confirmedAt === null);
      const items = (rs: Ok[]) => rs.flatMap((r) => labeledAnswers(task, r.case.id, r.label, r.result));
      const scored = (rs: Ok[]): Scored[] => rs.map((r) => ({ id: r.case.id, label: r.label, result: r.result }));

      // Which providers answered each role (informational; metrics pool providers per role).
      const providers = new Map<string, number>();
      for (const r of ok) {
        for (const role of ['primary', 'fallback'] as const) {
          const p = r.result.trace?.[role]?.provider;
          if (p) providers.set(`${role}:${p}`, (providers.get(`${role}:${p}`) ?? 0) + 1);
        }
      }
      return {
        blocking: [],
        metrics: {
          cases: runs.length,
          case_errors: runs.filter((r) => r.error).length,
          confirmed: confirmed.length,
          unconfirmed: runs.length - confirmed.length,
          ...decisionMetrics('', items(confirmed)),
          ...extra('', scored(confirmed)),
          ...decisionMetrics('prelabel_agreement.', items(pending)),
          ...extra('prelabel_agreement.', scored(pending)),
        },
        note:
          `Report-only. Headline metrics count confirmed labels only (${confirmed.length} of ${runs.length}); prelabel_agreement.* is agreement with unreviewed pre-labels, not accuracy. ` +
          `Providers (cases): ${[...providers].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}.`,
      };
    },
  };
}
