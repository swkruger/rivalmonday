import type { LedgerSink } from '@cs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAiConfig } from './config';
import { createAiFromEnv } from './env';

const config = parseAiConfig(`
tasks:
  llm_decisions: { provider: openrouter, model: a/small, mode: decisions }
  decisions: { provider: jev, model: jev-9, escalate_to: llm_decisions }
  embeddings: { provider: openrouter, model: openai/text-embedding-3-small, mode: embeddings, dimensions: 4 }
`);
const ledger: LedgerSink = { recordLlmCall: async () => {}, recordVendorCall: async () => {} };
const scope = { agencyId: null, clientId: null };
afterEach(() => vi.unstubAllGlobals());

function stubFetch(json: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

describe('createAiFromEnv', () => {
  it('requires OPENROUTER_API_KEY', () => {
    expect(() => createAiFromEnv({}, config, ledger)).toThrow(/OPENROUTER_API_KEY/);
  });

  it('calls Jev with the configured model when TYPESAFE_API_KEY is set', async () => {
    const calls = stubFetch({ model: 'jev-9.0', answers: { m: { type: 'noul', noul: 0.97 } }, usage: { input_tokens: 5, output_tokens: 1 } });
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k', TYPESAFE_API_KEY: 't' }, config, ledger);
    const r = await ai.decide('decisions', { x: 1 }, { m: { type: 'noul', instructions: 'ok?' } }, scope);
    expect(calls[0]?.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(calls[0]?.body.model).toBe('jev-9');
    expect(r.answers.m.provider).toBe('jev');
  });

  it('decides with the LLM when TYPESAFE_API_KEY is absent', async () => {
    const calls = stubFetch({ model: 'a/small', choices: [{ message: { content: JSON.stringify({ m: { probability: 0.99 } }) } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k' }, config, ledger);
    const r = await ai.decide('decisions', {}, { m: { type: 'noul', instructions: 'ok?' } }, scope);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(r.answers.m.provider).toBe('llm');
  });

  it('routes embeddings to OpenRouter with dimensions and privacy routing', async () => {
    const calls = stubFetch({ model: 'openai/text-embedding-3-small', data: [{ index: 0, embedding: [1, 0, 0, 0] }], usage: { prompt_tokens: 2, cost: 0.0000001 } });
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k' }, config, ledger);
    const r = await ai.embed('embeddings', ['hello'], scope);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(calls[0]?.body).toMatchObject({ model: 'openai/text-embedding-3-small', input: ['hello'], dimensions: 4, provider: { data_collection: 'deny', zdr: true } });
    expect(r.vectors).toEqual([[1, 0, 0, 0]]);
  });
});
