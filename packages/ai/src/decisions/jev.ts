import { z } from 'zod';
import type { CallTiming } from '../config';
import { AiProviderError, type HttpDeps, defaultHttpDeps, postJson } from '../http';
import { type DecisionAnswer, type DecisionProvider, type DecisionQuestion, noulConfidence, validateQuestions } from './types';

export const JEV_OPENROUTER_URL = 'https://openrouter.ai/api/v1/systemone';
/** Pinned request id; OpenRouter echoes a dated id (e.g. typesafe/jev-1.14-20261014) back as `model`. */
export const JEV_DEFAULT_MODEL = 'typesafe/jev-1.14';

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
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number().optional(), cost: z.number().nullish() }).passthrough(),
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
  /** OPENROUTER_API_KEY. */
  apiKey: string;
  model?: string;
  /** ai.yaml `jev.input_usd_per_mtok`: fallback estimate only, used when OpenRouter omits `usage.cost`. */
  fallbackUsdPerMtok: number;
  /** OpenRouter attribution headers, as in openrouter.ts. */
  appName: string;
  appUrl: string;
  http?: Partial<HttpDeps>;
  /** Per-call timeout/attempts from the task; absent = `http` / defaults. */
  timing?: CallTiming;
}

export function createJevProvider(opts: JevOptions): DecisionProvider {
  const http: HttpDeps = { ...defaultHttpDeps, ...opts.http };
  const model = opts.model ?? JEV_DEFAULT_MODEL;
  const headers = { authorization: `Bearer ${opts.apiKey}`, 'http-referer': opts.appUrl, 'x-title': opts.appName };
  let warnedNoCost = false;

  return {
    id: 'jev',
    async decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>) {
      validateQuestions(questions);
      const body = {
        model,
        state,
        questions: Object.fromEntries(Object.entries<DecisionQuestion>(questions).map(([k, q]) => [k, toJevQuestion(q)])),
      };
      const json = await postJson('jev', JEV_OPENROUTER_URL, body, headers, http, opts.timing);
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
      const { input_tokens, output_tokens, cost } = parsed.data.usage;
      let costUsd: number;
      if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
        costUsd = cost;
      } else {
        if (!warnedNoCost) {
          warnedNoCost = true;
          console.warn('[ai] jev response had no usage.cost; using the fallback estimate', { model });
        }
        costUsd = (input_tokens * opts.fallbackUsdPerMtok) / 1_000_000;
      }
      return {
        answers,
        model: parsed.data.model,
        inputTokens: input_tokens,
        outputTokens: output_tokens ?? 0,
        costUsd,
      };
    },
  };
}
