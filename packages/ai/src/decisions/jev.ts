import { z } from 'zod';
import type { CallTiming } from '../config';
import { AiProviderError, type HttpDeps, defaultHttpDeps, postJson } from '../http';
import { type DecideOptions, type DecisionAnswer, type DecisionImage, type DecisionProvider, type DecisionQuestion, imageDataUrl, noulConfidence, validateQuestions } from './types';

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

/** Where Jev reads an image in the request (18a-3 Task 0b probe: `top_level` 400s, `state_object` reads the data URL as text). */
export type JevImageShape = 'top_level' | 'state_content' | 'state_object';
export const JEV_IMAGE_SHAPE: JevImageShape | null = 'state_content';

/** Builds the /systemone body. No images = the body Jev always got; Jev 400s on WebP, so refuse it before any request. */
export function jevBody(
  model: string,
  state: unknown,
  questions: Record<string, unknown>,
  images: readonly DecisionImage[],
  shape: JevImageShape | null = JEV_IMAGE_SHAPE,
): Record<string, unknown> {
  if (images.length === 0) return { model, state, questions };
  if (shape === null) throw new AiProviderError('jev', null, 'Jev does not take images', false);
  if (images.some((i) => i.mediaType === 'image/webp')) throw new AiProviderError('jev', null, 'Jev takes PNG or JPEG images only', false);
  const urls = images.map(imageDataUrl);
  switch (shape) {
    case 'top_level':
      return { model, state, questions, images: urls };
    case 'state_content':
      return { model, questions, state: [{ type: 'text', text: JSON.stringify(state) }, ...urls.map((url) => ({ type: 'image_url', image_url: { url } }))] };
    case 'state_object':
      return { model, questions, state: { text: JSON.stringify(state), image: urls[0] } };
  }
}

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
  /** Warn-once state shared across providers (createAiFromEnv builds one provider per call); default: per instance. */
  warnState?: { noCost: boolean };
}

export function createJevProvider(opts: JevOptions): DecisionProvider {
  const http: HttpDeps = { ...defaultHttpDeps, ...opts.http };
  const model = opts.model ?? JEV_DEFAULT_MODEL;
  const headers = { authorization: `Bearer ${opts.apiKey}`, 'http-referer': opts.appUrl, 'x-title': opts.appName };
  const warnState = opts.warnState ?? { noCost: false };

  return {
    id: 'jev',
    async decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>, callOpts?: DecideOptions) {
      validateQuestions(questions);
      const body = jevBody(
        model,
        state,
        Object.fromEntries(Object.entries<DecisionQuestion>(questions).map(([k, q]) => [k, toJevQuestion(q)])),
        callOpts?.images ?? [],
      );
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
      // A billed call (input tokens > 0) never costs 0: treat cost 0 as missing.
      if (typeof cost === 'number' && Number.isFinite(cost) && (cost > 0 || (cost === 0 && input_tokens === 0))) {
        costUsd = cost;
      } else {
        if (!warnState.noCost) {
          warnState.noCost = true;
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
