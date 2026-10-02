import type { BatchCreateParams, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import { describe, expect, it, vi } from 'vitest';
import { type AnthropicBatchesApi, createAnthropicBatchProvider, toBatchRequest } from './anthropic-batch';

function fakeApi(results: MessageBatchIndividualResponse[], status: 'in_progress' | 'ended' = 'ended') {
  const created: BatchCreateParams[] = [];
  const api: AnthropicBatchesApi = {
    create: vi.fn(async (p: BatchCreateParams) => {
      created.push(p);
      return { id: 'msgbatch_01' };
    }),
    retrieve: vi.fn(async () => ({ processing_status: status })),
    results: vi.fn(async () => (async function* () {
      yield* results;
    })()),
  };
  return { api, created };
}

const message = (text: string, stop = 'end_turn') =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: stop, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text }], usage: { input_tokens: 1200, output_tokens: 80 } }) as never;

describe('Anthropic Message Batches provider', () => {
  it('maps system messages to the system field and JSON schemas to output_config.format', () => {
    const r = toBatchRequest('claude-sonnet-5', 8000, {
      customId: 'hvac_plumbing', jsonSchema: { name: 'theme_proposal', schema: { type: 'object' } },
      messages: [{ role: 'system', content: 'You read reviews.' }, { role: 'user', content: 'REVIEWS…' }],
    });
    expect(r).toEqual({
      custom_id: 'hvac_plumbing',
      params: { model: 'claude-sonnet-5', max_tokens: 8000, system: 'You read reviews.', messages: [{ role: 'user', content: 'REVIEWS…' }], output_config: { format: { type: 'json_schema', schema: { type: 'object' } } } },
    });
  });

  it('submits one request per custom_id and rejects ids the API would refuse', async () => {
    const { api, created } = fakeApi([]);
    const p = createAnthropicBatchProvider({ api });
    expect(await p.submit({ model: 'claude-sonnet-5', maxTokens: 100, requests: [{ customId: 'dental', messages: [{ role: 'user', content: 'x' }] }] })).toBe('msgbatch_01');
    expect(created[0]!.requests).toHaveLength(1);
    await expect(p.submit({ model: 'm', maxTokens: 1, requests: [{ customId: 'has space', messages: [] }] })).rejects.toThrow(/custom_id/);
    await expect(p.submit({ model: 'm', maxTokens: 1, requests: [] })).rejects.toThrow(/at least one/);
  });

  it('reads text blocks of succeeded results and turns refusals, errors and expiries into failed items', async () => {
    const { api } = fakeApi([
      { custom_id: 'a', result: { type: 'succeeded', message: message('{"found":false}') } },
      { custom_id: 'b', result: { type: 'succeeded', message: message('', 'refusal') } },
      { custom_id: 'c', result: { type: 'errored', error: { type: 'error', error: { type: 'overloaded_error', message: 'busy' } } } as never },
      { custom_id: 'd', result: { type: 'expired' } },
    ]);
    const r = await createAnthropicBatchProvider({ api }).results('msgbatch_01');
    expect(r).toEqual([
      { customId: 'a', ok: true, text: '{"found":false}', model: 'claude-sonnet-5', inputTokens: 1200, outputTokens: 80 },
      { customId: 'b', ok: false, error: 'refused (stop_reason refusal)' },
      { customId: 'c', ok: false, error: expect.stringContaining('overloaded_error') },
      { customId: 'd', ok: false, error: 'expired' },
    ]);
  });

  it('reports in_progress until the batch has ended', async () => {
    expect(await createAnthropicBatchProvider({ api: fakeApi([], 'in_progress').api }).status('x')).toBe('in_progress');
    expect(await createAnthropicBatchProvider({ api: fakeApi([], 'ended').api }).status('x')).toBe('ended');
  });
});
