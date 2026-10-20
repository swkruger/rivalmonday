import { z } from 'zod';
import type { ChatMessage, ChatProvider } from './chat';
import { AiProviderError, type HttpDeps, defaultHttpDeps, postJson } from './http';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const responseSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullable(),
          tool_calls: z
            .array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) }))
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      cost: z.number().optional(),
      prompt_tokens_details: z.object({ cached_tokens: z.number().nullish() }).nullish(),
    })
    .optional(),
});

function toWireMessage(m: ChatMessage): Record<string, unknown> {
  switch (m.role) {
    case 'system':
      return m.cacheControl
        ? { role: 'system', content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
        : { role: 'system', content: m.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    default:
      return { role: 'user', content: m.content };
  }
}

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
      const hasTools = Boolean(req.tools?.length);
      const body = {
        ...(req.fallbacks?.length ? { models: [req.model, ...req.fallbacks] } : { model: req.model }),
        messages: req.messages.map(toWireMessage),
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        response_format: req.jsonSchema
          ? { type: 'json_schema', json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema } }
          : undefined,
        tools: hasTools
          ? req.tools?.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
          : undefined,
        tool_choice: hasTools ? req.toolChoice : undefined,
        provider: {
          data_collection: opts.dataCollection,
          zdr: opts.zdr,
          ...(req.jsonSchema || hasTools ? { require_parameters: true } : {}),
        },
        usage: { include: true },
      };

      const json = await postJson('openrouter', OPENROUTER_URL, body, headers, http, req.timing);
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AiProviderError('openrouter', 200, 'Unexpected OpenRouter response shape', false, { cause: parsed.error });
      }
      const choice = parsed.data.choices[0];
      const content = choice?.message.content;
      const toolCalls = (choice?.message.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments }));
      // Empty text is legitimate only when the model answered with tool calls.
      if ((content == null || content === '') && toolCalls.length === 0) {
        throw new AiProviderError('openrouter', 200, 'OpenRouter returned empty content', false);
      }
      return {
        text: content ?? '',
        model: parsed.data.model,
        inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
        outputTokens: parsed.data.usage?.completion_tokens ?? 0,
        costUsd: parsed.data.usage?.cost ?? null,
        cachedTokens: parsed.data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        toolCalls,
        finishReason: choice?.finish_reason ?? null,
      };
    },
  };
}
