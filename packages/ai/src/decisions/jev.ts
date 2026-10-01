import { z } from 'zod';
import { AiProviderError, type HttpDeps, defaultHttpDeps, postJson } from '../http';
import { type DecisionAnswer, type DecisionProvider, type DecisionQuestion, noulConfidence, validateQuestions } from './types';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    legend: z.record(z.string(), z.string()).optional(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number().min(0).max(1),
  }),
]);

const responseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

function toJevQuestion(q: DecisionQuestion): Record<string, unknown> {
  switch (q.type) {
    case 'choice':
      return { type: 'choice', instructions: q.instructions, criteria: q.options };
    case 'score':
      return { type: 'score', instructions: q.instructions, criteria: q.levels };
    case 'noul':
      return q.criteria ? { type: 'noul', instructions: q.instructions, criteria: q.criteria } : { type: 'noul', instructions: q.instructions };
  }
}

/**
 * Jev returns `score` as a probability-weighted average (e.g. 1.2); the discrete level is the
 * 0-based key of `probabilities` with the highest probability. Returns null if any key is not a
 * valid level index for this question, or if there are no keys.
 */
export function mostLikelyLevel(probabilities: Record<string, number>, levelCount: number): number | null {
  let best: number | null = null;
  let bestP = -1;
  for (const [key, p] of Object.entries(probabilities)) {
    if (!/^\d+$/.test(key)) return null;
    const level = Number(key);
    if (level >= levelCount) return null;
    if (p > bestP || (p === bestP && best !== null && level < best)) {
      best = level;
      bestP = p;
    }
  }
  return best;
}

export interface JevOptions {
  apiKey: string;
  model?: string;
  inputUsdPerMTok?: number;
  http?: Partial<HttpDeps>;
}

export function createJevProvider(opts: JevOptions): DecisionProvider {
  const http: HttpDeps = { ...defaultHttpDeps, ...opts.http };
  const model = opts.model ?? 'jev-latest';
  const rate = opts.inputUsdPerMTok ?? 0.042;

  return {
    id: 'jev',
    async decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>) {
      validateQuestions(questions);
      const body = {
        model,
        state,
        questions: Object.fromEntries(Object.entries<DecisionQuestion>(questions).map(([k, q]) => [k, toJevQuestion(q)])),
      };
      const json = await postJson('jev', JEV_URL, body, { authorization: `Bearer ${opts.apiKey}` }, http);
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) throw new AiProviderError('jev', 200, 'Unexpected Jev response shape', false, { cause: parsed.error });

      const answers = {} as Record<K, DecisionAnswer>;
      for (const [key, q] of Object.entries<DecisionQuestion>(questions)) {
        const a = parsed.data.answers[key];
        if (!a || a.type !== q.type) throw new AiProviderError('jev', 200, `Missing or mistyped answer for ${key}`, false);
        if (a.type === 'noul') {
          answers[key as K] = { type: 'noul', value: a.noul >= 0.5, probability: a.noul, confidence: noulConfidence(a.noul) };
        } else if (a.type === 'choice' && q.type === 'choice') {
          if (!(a.choice in q.options)) throw new AiProviderError('jev', 200, `Answer for ${key} is not a valid option`, false);
          answers[key as K] = { type: 'choice', value: a.choice, probabilities: a.probabilities, confidence: a.confidence };
        } else if (a.type === 'score' && q.type === 'score') {
          const level = mostLikelyLevel(a.probabilities, q.levels.length);
          if (level === null) {
            throw new AiProviderError('jev', 200, `Answer for ${key} is out of range`, false);
          }
          answers[key as K] = { type: 'score', value: level, expected: a.score, probabilities: a.probabilities, confidence: a.confidence };
        }
      }
      const { input_tokens, output_tokens } = parsed.data.usage;
      return {
        answers,
        model: parsed.data.model,
        inputTokens: input_tokens,
        outputTokens: output_tokens,
        costUsd: (input_tokens * rate) / 1_000_000,
      };
    },
  };
}
