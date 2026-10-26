import { AiPausedError, type LedgerSink } from '@cs/core';
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
  it('warns once per process-level ai instance when Jev omits usage.cost', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ model: 'jev-9.0', answers: { m: { type: 'noul', noul: 0.97 } }, usage: { input_tokens: 5, output_tokens: 1 } });
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k' }, config, ledger);
    await ai.decide('decisions', { x: 1 }, { m: { type: 'noul', instructions: 'ok?' } }, scope);
    await ai.decide('decisions', { x: 1 }, { m: { type: 'noul', instructions: 'ok?' } }, scope);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('requires OPENROUTER_API_KEY', () => {
    expect(() => createAiFromEnv({}, config, ledger)).toThrow(/OPENROUTER_API_KEY/);
  });

  it('rejects an out-of-range AI_SHADOW_RATE', () => {
    expect(() => createAiFromEnv({ OPENROUTER_API_KEY: 'k', AI_SHADOW_RATE: '2' }, config, ledger)).toThrow(/AI_SHADOW_RATE/);
  });

  it('Jev is available iff OPENROUTER_API_KEY is set', async () => {
    const calls = stubFetch({ model: 'jev-9.0', answers: { m: { type: 'noul', noul: 0.97 } }, usage: { input_tokens: 5, output_tokens: 1, cost: 0.001 } });
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k' }, config, ledger);
    const r = await ai.decide('decisions', { x: 1 }, { m: { type: 'noul', instructions: 'ok?' } }, scope);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/systemone');
    expect(calls[0]?.body.model).toBe('jev-9');
    expect(r.answers.m.provider).toBe('jev');
  });

  it('routes Jev and OpenRouter calls through the injected http fetch', async () => {
    const hit: string[] = [];
    const via = (name: string, json: unknown) => vi.fn(async (_u: unknown, init?: RequestInit & { timeoutMs?: number }) => {
      hit.push(`${name}:${init?.timeoutMs}`);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const jev = via('jev', { model: 'jev-9.0', answers: { m: { type: 'noul', noul: 0.97 } }, usage: { input_tokens: 5, output_tokens: 1, cost: 0.001 } });
    const openrouter = via('or', { model: 'a/small', choices: [{ message: { content: JSON.stringify({ m: { probability: 0.99 } }) } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
    const global = vi.fn();
    vi.stubGlobal('fetch', global);
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k' }, config, ledger, undefined, undefined, { jev, openrouter });
    await ai.decide('decisions', {}, { m: { type: 'noul', instructions: 'ok?' } }, scope);
    expect(jev).toHaveBeenCalledTimes(1);
    expect(hit[0]).toMatch(/^jev:\d+$/);
    expect(global).not.toHaveBeenCalled();
    expect(openrouter).not.toHaveBeenCalled();
  });

  it('TYPESAFE_API_KEY alone no longer enables Jev', () => {
    expect(() => createAiFromEnv({ TYPESAFE_API_KEY: 't' }, config, ledger)).toThrow(/OPENROUTER_API_KEY/);
  });

  it('routes embeddings to OpenRouter with dimensions and privacy routing', async () => {
    const calls = stubFetch({ model: 'openai/text-embedding-3-small', data: [{ index: 0, embedding: [1, 0, 0, 0] }], usage: { prompt_tokens: 2, cost: 0.0000001 } });
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k' }, config, ledger);
    const r = await ai.embed('embeddings', ['hello'], scope);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(calls[0]?.body).toMatchObject({ model: 'openai/text-embedding-3-small', input: ['hello'], dimensions: 4, provider: { data_collection: 'deny', zdr: true } });
    expect(r.vectors).toEqual([[1, 0, 0, 0]]);
  });

  it('passes the guard through: a refused call never reaches the provider', async () => {
    const calls = stubFetch({});
    const guard = { assertAllowed: async () => { throw new AiPausedError('client'); } };
    const ai = createAiFromEnv({ OPENROUTER_API_KEY: 'k' }, config, ledger, undefined, guard);
    await expect(ai.embed('embeddings', ['hello'], scope)).rejects.toBeInstanceOf(AiPausedError);
    expect(calls).toEqual([]);
  });
});
