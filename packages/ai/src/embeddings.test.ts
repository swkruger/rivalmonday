import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterEmbeddings } from './embeddings';

function provider(json: unknown, status = 200) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } }));
  const p = createOpenRouterEmbeddings({ apiKey: 'k', appName: 'cs', appUrl: 'http://x', dataCollection: 'deny', zdr: true, http: { fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, maxRetries: 0 } });
  return { p, fetch };
}

describe('OpenRouter embeddings', () => {
  it('posts model, input, dimensions and privacy routing; returns vectors in input order', async () => {
    const { p, fetch } = provider({ model: 'openai/text-embedding-3-small', data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 7, cost: 0.00000014 } });
    const r = await p.embed({ model: 'openai/text-embedding-3-small', input: ['a', 'b'], dimensions: 2 });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body))).toEqual({
      model: 'openai/text-embedding-3-small', input: ['a', 'b'], dimensions: 2, provider: { data_collection: 'deny', zdr: true },
    });
    expect(r).toEqual({ vectors: [[1, 0], [0, 1]], model: 'openai/text-embedding-3-small', inputTokens: 7, costUsd: 0.00000014 });
  });

  it('rejects a response missing a vector or with the wrong width', async () => {
    await expect(provider({ model: 'm', data: [{ index: 0, embedding: [1, 0] }] }).p.embed({ model: 'm', input: ['a', 'b'] })).rejects.toThrow(/expected 2 embeddings/i);
    await expect(provider({ model: 'm', data: [{ index: 0, embedding: [1, 0, 0] }] }).p.embed({ model: 'm', input: ['a'], dimensions: 2 })).rejects.toThrow(/dimensions/i);
    await expect(provider({ nope: true }).p.embed({ model: 'm', input: ['a'] })).rejects.toThrow(/unexpected/i);
  });
});
