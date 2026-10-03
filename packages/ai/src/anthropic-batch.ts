import Anthropic from '@anthropic-ai/sdk';
import type { BatchCreateParams, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import type { ChatMessage, JsonSchemaFormat } from './chat';

export interface BatchRequest {
  /** Matches ^[a-zA-Z0-9_-]{1,64}$; results come back in any order and are keyed by it. */
  customId: string;
  messages: ChatMessage[];
  jsonSchema?: JsonSchemaFormat;
}

export type BatchItemResult =
  | { customId: string; ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { customId: string; ok: false; error: string };

export interface BatchProvider {
  readonly id: string;
  submit(input: { model: string; maxTokens: number; requests: BatchRequest[] }): Promise<string>;
  status(batchId: string): Promise<'in_progress' | 'ended'>;
  results(batchId: string): Promise<BatchItemResult[]>;
}

/** The part of the SDK's `client.messages.batches` this provider uses (tests inject a fake). */
export interface AnthropicBatchesApi {
  create(params: BatchCreateParams): Promise<{ id: string }>;
  retrieve(batchId: string): Promise<{ processing_status: 'in_progress' | 'canceling' | 'ended' }>;
  results(batchId: string): Promise<AsyncIterable<MessageBatchIndividualResponse>>;
}

const CUSTOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;

/** Our chat messages → one Messages API request: system messages go to `system`, a JSON schema to output_config.format. */
export function toBatchRequest(model: string, maxTokens: number, r: BatchRequest): BatchCreateParams.Request {
  const system = r.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const messages = r.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return {
    custom_id: r.customId,
    params: {
      model, max_tokens: maxTokens, ...(system ? { system } : {}), messages,
      ...(r.jsonSchema ? { output_config: { format: { type: 'json_schema' as const, schema: r.jsonSchema.schema } } } : {}),
    },
  };
}

/** Anthropic Message Batches through the official SDK (spec §7.1 "Anthropic direct … Batch API discounts"). */
export function createAnthropicBatchProvider(opts: { apiKey?: string; api?: AnthropicBatchesApi }): BatchProvider {
  const api: AnthropicBatchesApi = opts.api ?? (new Anthropic({ apiKey: opts.apiKey }).messages.batches as unknown as AnthropicBatchesApi);
  return {
    id: 'anthropic',
    async submit({ model, maxTokens, requests }) {
      if (requests.length === 0) throw new Error('a batch needs at least one request');
      for (const r of requests) if (!CUSTOM_ID.test(r.customId)) throw new Error(`invalid batch custom_id "${r.customId}"`);
      return (await api.create({ requests: requests.map((r) => toBatchRequest(model, maxTokens, r)) })).id;
    },
    async status(batchId) {
      return (await api.retrieve(batchId)).processing_status === 'ended' ? 'ended' : 'in_progress';
    },
    async results(batchId) {
      const out: BatchItemResult[] = [];
      for await (const item of await api.results(batchId)) {
        const r = item.result;
        if (r.type !== 'succeeded') {
          out.push({ customId: item.custom_id, ok: false, error: r.type === 'errored' ? `errored: ${JSON.stringify(r.error).slice(0, 300)}` : r.type });
          continue;
        }
        const m = r.message;
        // Sonnet 5 thinks adaptively: skip thinking blocks, keep the text.
        const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        if ((m.stop_reason as string) === 'refusal' || text === '') {
          out.push({ customId: item.custom_id, ok: false, error: `${(m.stop_reason as string) === 'refusal' ? 'refused' : 'no text'} (stop_reason ${m.stop_reason})` });
          continue;
        }
        out.push({ customId: item.custom_id, ok: true, text, model: m.model, inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens });
      }
      return out;
    },
  };
}
