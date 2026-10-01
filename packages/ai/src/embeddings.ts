import { z } from 'zod';
import { AiProviderError, type HttpDeps, defaultHttpDeps, postJson } from './http';
import type { OpenRouterOptions } from './openrouter';

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

const responseSchema = z.object({
  model: z.string(),
  data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number(), cost: z.number().optional() }).optional(),
});

export interface EmbeddingRequest {
  model: string;
  input: string[];
  dimensions?: number;
}

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  inputTokens: number;
  costUsd: number | null;
}

export interface EmbeddingProvider {
  readonly id: string;
  embed(req: EmbeddingRequest): Promise<EmbeddingResult>;
}

/** OpenRouter embeddings (live-verified 2026-10-01: `dimensions` honoured, `usage.cost` returned, ZDR routing applies). */
export function createOpenRouterEmbeddings(opts: OpenRouterOptions): EmbeddingProvider {
  const http: HttpDeps = { ...defaultHttpDeps, ...opts.http };
  const headers = { authorization: `Bearer ${opts.apiKey}`, 'http-referer': opts.appUrl, 'x-title': opts.appName };
  return {
    id: 'openrouter',
    async embed(req) {
      const body = {
        model: req.model,
        input: req.input,
        ...(req.dimensions ? { dimensions: req.dimensions } : {}),
        provider: { data_collection: opts.dataCollection, zdr: opts.zdr },
      };
      const json = await postJson('openrouter', EMBEDDINGS_URL, body, headers, http);
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AiProviderError('openrouter', 200, 'Unexpected OpenRouter embeddings response shape', false, { cause: parsed.error });
      }
      const vectors: (number[] | null)[] = req.input.map(() => null);
      for (const d of parsed.data.data) if (d.index < vectors.length) vectors[d.index] = d.embedding;
      if (parsed.data.data.length !== req.input.length || vectors.some((v) => v === null)) {
        throw new AiProviderError('openrouter', 200, `Expected ${req.input.length} embeddings, got ${parsed.data.data.length}`, false);
      }
      if (req.dimensions && vectors.some((v) => v!.length !== req.dimensions)) {
        throw new AiProviderError('openrouter', 200, `Embeddings do not have the requested ${req.dimensions} dimensions`, false);
      }
      return {
        vectors: vectors as number[][],
        model: parsed.data.model,
        inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
        costUsd: parsed.data.usage?.cost ?? null,
      };
    },
  };
}
