import type { Ai, ChatResult, DecisionQuestion, DecisionResult, EmbeddingResult, ResolvedAnswer } from '@cs/ai';
import { EMBEDDING_DIMENSIONS } from '@cs/db';

/** Deterministic bag-of-words embedding; digits are ignored, so "$89" and "$69" embed identically. */
export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % EMBEDDING_DIMENSIONS]! += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export const noul = (value: boolean, confidence = 0.98): ResolvedAnswer => ({
  type: 'noul', value, probability: value ? 0.5 + confidence / 2 : 0.5 - confidence / 2, confidence, provider: 'fake',
});
export const choice = (value: string, confidence = 0.95): ResolvedAnswer => ({
  type: 'choice', value, probabilities: { [value]: confidence }, confidence, provider: 'fake',
});
export const score = (value: number, confidence = 0.95): ResolvedAnswer => ({
  type: 'score', value, probabilities: { [String(value)]: confidence }, confidence, provider: 'fake',
});

export type DecideFn = (state: unknown, questions: Record<string, DecisionQuestion>) => DecisionResult<string> | Promise<DecisionResult<string>>;

/** Answers review questions: `sentiment` (level), `theme_<v>__<id>` true for the listed theme ids, `other_<v>`. */
export function reviewResult(input: { themes?: string[]; other?: boolean; sentiment?: number; confidence?: number; needsReview?: string[] }): DecideFn {
  return (_state, questions) => {
    const answers: Record<string, ResolvedAnswer> = {};
    for (const key of Object.keys(questions)) {
      if (key === 'sentiment') answers[key] = score(input.sentiment ?? 3, input.confidence);
      else if (key.startsWith('other_')) answers[key] = noul(input.other ?? false, input.confidence);
      else answers[key] = noul((input.themes ?? []).includes(key.split('__')[1] ?? ''), input.confidence);
    }
    return { answers, needsReview: input.needsReview ?? [] };
  };
}

/** Answers the tag questions (meaningful, change_type, service_<vertical>) with fixed values. */
export function tagResult(input: { meaningful: boolean; type: string; services?: Record<string, string>; confidence?: number; needsReview?: string[] }): DecideFn {
  return (_state, questions) => {
    const answers: Record<string, ResolvedAnswer> = {};
    for (const key of Object.keys(questions)) {
      if (key === 'meaningful') answers[key] = noul(input.meaningful, input.confidence);
      else if (key === 'change_type') answers[key] = choice(input.type, input.confidence);
      else answers[key] = choice(input.services?.[key.replace(/^service_/, '')] ?? 'none', input.confidence);
    }
    return { answers, needsReview: input.needsReview ?? [] };
  };
}

/** Answers the structured tag questions: service_<vertical> choices and the ad `offer` Noul. */
export function structuredResult(input: { services?: Record<string, string>; offer?: boolean; confidence?: number; needsReview?: string[] }): DecideFn {
  return (_state, questions) => {
    const answers: Record<string, ResolvedAnswer> = {};
    for (const key of Object.keys(questions)) {
      answers[key] = key === 'offer' ? noul(input.offer ?? false, input.confidence) : choice(input.services?.[key.replace(/^service_/, '')] ?? 'none', input.confidence);
    }
    return { answers, needsReview: input.needsReview ?? [] };
  };
}

export interface FakeAi extends Ai {
  calls: { chat: { task: string; content: string }[]; decide: { task: string; state: unknown; questions: Record<string, DecisionQuestion> }[]; embed: string[][] };
}

export function createFakeAi(opts: { decide?: DecideFn; chat?: (task: string, content: string) => string } = {}): FakeAi {
  const calls: FakeAi['calls'] = { chat: [], decide: [], embed: [] };
  return {
    calls,
    async chat(task, input) {
      const content = input.messages.at(-1)?.content ?? '';
      calls.chat.push({ task, content });
      const text = opts.chat ? opts.chat(task, content) : JSON.stringify({ facts: [] });
      return { text, model: 'fake', inputTokens: 0, outputTokens: 0, costUsd: 0 } satisfies ChatResult;
    },
    async decide<K extends string>(task: string, state: unknown, questions: Record<K, DecisionQuestion>): Promise<DecisionResult<K>> {
      calls.decide.push({ task, state, questions });
      if (!opts.decide) throw new Error('fake ai: no decide handler');
      return (await opts.decide(state, questions)) as DecisionResult<K>;
    },
    async embed(_task, texts) {
      calls.embed.push(texts);
      return { vectors: texts.map(fakeEmbedding), model: 'fake-embed', inputTokens: 0, costUsd: 0 } satisfies EmbeddingResult;
    },
  };
}
