import type { ConfidenceThresholds } from '../config';
import type { DecisionAnswer, DecisionProvider, DecisionQuestion } from './types';

export type ResolvedAnswer = DecisionAnswer & { provider: string };

export interface DecisionResult<K extends string> {
  answers: Record<K, ResolvedAnswer>;
  /** Questions still below threshold after all providers: route to the AM review queue. */
  needsReview: K[];
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

  async decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>): Promise<DecisionResult<K>> {
    const keys = Object.keys(questions) as K[];
    const answers = {} as Record<K, ResolvedAnswer>;
    const isLow = (k: K) => answers[k].confidence < thresholdFor(this.thresholds, questions[k].type);

    let escalate: K[];
    try {
      const first = await this.primary.decide(state, questions);
      for (const k of keys) answers[k] = { ...first.answers[k], provider: this.primary.id } as ResolvedAnswer;
      escalate = keys.filter(isLow);
    } catch (err) {
      if (!this.fallback) throw err;
      escalate = keys;
    }

    if (escalate.length > 0 && this.fallback) {
      const second = await this.fallback.decide(state, pick(questions, escalate));
      for (const k of escalate) answers[k] = { ...second.answers[k], provider: this.fallback.id } as ResolvedAnswer;
    }

    return { answers, needsReview: keys.filter(isLow) };
  }
}
