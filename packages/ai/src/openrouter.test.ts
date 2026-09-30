import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterProvider } from './openrouter';

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const okBody = {
  model: 'anthropic/claude-sonnet-5',
  choices: [{ message: { content: 'hello' } }],
  usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.00005 },
};

function provider(fetch: typeof globalThis.fetch) {
  return createOpenRouterProvider({
    apiKey: 'k', appName: 'CS', appUrl: 'https://app.test', dataCollection: 'deny', zdr: true,
    http: { fetch, sleep: async () => {}, maxRetries: 0 },
  });
}

function sentBody(fetch: ReturnType<typeof vi.fn>) {
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
}

describe('OpenRouter provider', () => {
  it('sends a single-model request with privacy routing and usage accounting', async () => {
    const fetch = fakeFetch(okBody);
    const result = await provider(fetch).complete({ model: 'anthropic/claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] });
    const { url, headers, body } = sentBody(fetch);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(headers).toMatchObject({ authorization: 'Bearer k', 'http-referer': 'https://app.test', 'x-title': 'CS' });
    expect(body).toMatchObject({ model: 'anthropic/claude-sonnet-5', provider: { data_collection: 'deny', zdr: true }, usage: { include: true } });
    expect(body.models).toBeUndefined();
    expect(result).toEqual({ text: 'hello', model: 'anthropic/claude-sonnet-5', inputTokens: 12, outputTokens: 3, costUsd: 0.00005 });
  });

  it('uses the models array for fallbacks', async () => {
    const fetch = fakeFetch(okBody);
    await provider(fetch).complete({ model: 'a/one', fallbacks: ['b/two'], messages: [{ role: 'user', content: 'x' }] });
    const { body } = sentBody(fetch);
    expect(body.models).toEqual(['a/one', 'b/two']);
    expect(body.model).toBeUndefined();
  });

  it('requests strict JSON schema output and requires provider support', async () => {
    const fetch = fakeFetch(okBody);
    await provider(fetch).complete({
      model: 'a/one', messages: [{ role: 'user', content: 'x' }],
      jsonSchema: { name: 'answers', schema: { type: 'object' } },
    });
    const { body } = sentBody(fetch);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'answers', strict: true, schema: { type: 'object' } } });
    expect(body.provider.require_parameters).toBe(true);
  });

  it('returns null cost when usage cost is absent', async () => {
    const fetch = fakeFetch({ ...okBody, usage: { prompt_tokens: 1, completion_tokens: 1 } });
    const r = await provider(fetch).complete({ model: 'a/one', messages: [{ role: 'user', content: 'x' }] });
    expect(r.costUsd).toBeNull();
  });

  it('throws a non-retryable error for unexpected shapes or empty content', async () => {
    await expect(provider(fakeFetch({ nope: true })).complete({ model: 'a', messages: [] })).rejects.toMatchObject({ provider: 'openrouter', retryable: false });
    await expect(
      provider(fakeFetch({ ...okBody, choices: [{ message: { content: null } }] })).complete({ model: 'a', messages: [] }),
    ).rejects.toMatchObject({ provider: 'openrouter' });
  });
});
