import type { ConfidenceThresholds } from '../config';
import type { DecisionAnswer, DecisionProvider, DecisionQuestion } from './types';

export type ResolvedAnswer = DecisionAnswer & { provider: string };

export interface ProviderAnswers {
  provider: string;
  answers: Record<string, DecisionAnswer>;
}

/** What each provider answered (spec §7.3 shadow evaluation). Fallback holds only the keys it was asked. */
export interface DecisionTrace {
  primary: ProviderAnswers | null;
  fallback: ProviderAnswers | null;
}

export interface DecisionResult<K extends string> {
  answers: Record<K, ResolvedAnswer>;
  /** Questions still below threshold after all providers: route to the AM review queue. */
  needsReview: K[];
  trace?: DecisionTrace;
  /** decision_sample row recorded for this call (shadow sample or still-needs-review), if any. */
  sampleId?: string | null;
}

export function thresholdFor(thresholds: ConfidenceThresholds, type: DecisionQuestion['type']): number {
  return thresholds[type] ?? thresholds.default;
}

function pick<K extends string>(questions: Record<K, DecisionQuestion>, keys: K[]): Record<K, DecisionQuestion> {
  return Object.fromEntries(keys.map((k) => [k, questions[k]])) as Record<K, DecisionQuestion>;
}

/** Jev → (low confidence or failure) LLM → (still low) human review (spec §7.3). */
export class CascadingDecisionProvider {
  constructor(
    private readonly primary: DecisionProvider,
    private readonly fallback: DecisionProvider | null,
    private readonly thresholds: ConfidenceThresholds,
  ) {}

  async decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>, opts: { shadow?: boolean } = {}): Promise<DecisionResult<K>> {
    if (opts.shadow && this.fallback) return this.decideShadow(state, questions, this.fallback);
    const keys = Object.keys(questions) as K[];
    const answers = {} as Record<K, ResolvedAnswer>;
    const isLow = (k: K) => answers[k].confidence < thresholdFor(this.thresholds, questions[k].type);
    const trace: DecisionTrace = { primary: null, fallback: null };

    let escalate: K[];
    try {
      const first = await this.primary.decide(state, questions);
      trace.primary = { provider: this.primary.id, answers: first.answers };
      for (const k of keys) answers[k] = { ...first.answers[k], provider: this.primary.id } as ResolvedAnswer;
      escalate = keys.filter(isLow);
    } catch (err) {
      if (!this.fallback) throw err;
      escalate = keys;
    }

    if (escalate.length > 0 && this.fallback) {
      const second = await this.fallback.decide(state, pick(questions, escalate));
      trace.fallback = { provider: this.fallback.id, answers: second.answers };
      for (const k of escalate) answers[k] = { ...second.answers[k], provider: this.fallback.id } as ResolvedAnswer;
    }

    return { answers, needsReview: keys.filter(isLow), trace };
  }

  /**
   * Shadow mode: both providers answer every question (in parallel); the result is resolved with the same rule as
   * the cascade (primary unless below threshold, then fallback). A failing fallback never changes the outcome.
   */
  private async decideShadow<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>, fallback: DecisionProvider): Promise<DecisionResult<K>> {
    const keys = Object.keys(questions) as K[];
    const [p, f] = await Promise.allSettled([this.primary.decide(state, questions), fallback.decide(state, questions)]);
    if (p.status === 'rejected' && f.status === 'rejected') throw p.reason;
    const trace: DecisionTrace = {
      primary: p.status === 'fulfilled' ? { provider: this.primary.id, answers: p.value.answers } : null,
      fallback: f.status === 'fulfilled' ? { provider: fallback.id, answers: f.value.answers } : null,
    };
    const answers = {} as Record<K, ResolvedAnswer>;
    const low = (a: DecisionAnswer | undefined, k: K) => !a || a.confidence < thresholdFor(this.thresholds, questions[k].type);
    for (const k of keys) {
      const pa = trace.primary?.answers[k];
      const fa = trace.fallback?.answers[k];
      answers[k] = (!low(pa, k) || !fa ? { ...pa!, provider: this.primary.id } : { ...fa, provider: fallback.id }) as ResolvedAnswer;
    }
    return { answers, needsReview: keys.filter((k) => answers[k].confidence < thresholdFor(this.thresholds, questions[k].type)), trace };
  }
}
