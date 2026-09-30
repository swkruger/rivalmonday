import { z } from 'zod';
import type { ChatProvider } from './chat';
import { AiProviderError, type HttpDeps, defaultHttpDeps, postJson } from './http';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const responseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      cost: z.number().optional(),
    })
    .optional(),
});

export interface OpenRouterOptions {
  apiKey: string;
  appName: string;
  appUrl: string;
  dataCollection: 'allow' | 'deny';
  zdr: boolean;
  http?: Partial<HttpDeps>;
}

export function createOpenRouterProvider(opts: OpenRouterOptions): ChatProvider {
  const http: HttpDeps = { ...defaultHttpDeps, ...opts.http };
  const headers = {
    authorization: `Bearer ${opts.apiKey}`,
    'http-referer': opts.appUrl,
    'x-title': opts.appName,
  };

  return {
    id: 'openrouter',
    async complete(req) {
      const body = {
        ...(req.fallbacks?.length ? { models: [req.model, ...req.fallbacks] } : { model: req.model }),
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        response_format: req.jsonSchema
          ? { type: 'json_schema', json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema } }
          : undefined,
        provider: {
          data_collection: opts.dataCollection,
          zdr: opts.zdr,
          ...(req.jsonSchema ? { require_parameters: true } : {}),
        },
        usage: { include: true },
      };

      const json = await postJson('openrouter', OPENROUTER_URL, body, headers, http);
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AiProviderError('openrouter', 200, 'Unexpected OpenRouter response shape', false, { cause: parsed.error });
      }
      const content = parsed.data.choices[0]?.message.content;
      if (content == null || content === '') {
        throw new AiProviderError('openrouter', 200, 'OpenRouter returned empty content', false);
      }
      return {
        text: content,
        model: parsed.data.model,
        inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
        outputTokens: parsed.data.usage?.completion_tokens ?? 0,
        costUsd: parsed.data.usage?.cost ?? null,
      };
    },
  };
}
