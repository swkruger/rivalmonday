import { describe, expect, it, vi } from 'vitest';
import { AiProviderError, type HttpDeps, postJson } from './http';

function deps(responses: Array<Response | Error>): HttpDeps & { calls: number; sleeps: number[] } {
  const state = { calls: 0, sleeps: [] as number[] };
  return Object.assign(state, {
    fetch: vi.fn(async () => {
      const next = responses[state.calls++];
      if (!next) throw new Error('no more responses');
      if (next instanceof Error) throw next;
      return next;
    }) as unknown as typeof fetch,
    sleep: async (ms: number) => { state.sleeps.push(ms); },
    maxRetries: 2,
    baseDelayMs: 100,
    timeoutMs: 1000,
  });
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number) => new Response('err', { status: code });

describe('postJson', () => {
  it('returns parsed JSON on success and sends headers/body', async () => {
    const d = deps([ok({ a: 1 })]);
    await expect(postJson('p', 'https://x.test', { q: 1 }, { authorization: 'Bearer k' }, d)).resolves.toEqual({ a: 1 });
    const [, init] = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"q":1}');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('retries 429 and 529 with exponential backoff then succeeds', async () => {
    const d = deps([status(429), status(529), ok({ done: true })]);
    await expect(postJson('p', 'u', {}, {}, d)).resolves.toEqual({ done: true });
    expect(d.sleeps).toEqual([100, 200]);
  });

  it('retries network errors', async () => {
    const d = deps([new TypeError('fetch failed'), ok({})]);
    await expect(postJson('p', 'u', {}, {}, d)).resolves.toEqual({});
  });

  it('gives up after maxRetries with a retryable error', async () => {
    const d = deps([status(503), status(503), status(503)]);
    const err = await postJson('p', 'u', {}, {}, d).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ provider: 'p', status: 503, retryable: true });
    expect(d.calls).toBe(3);
  });

  it('does not retry 401 or 422', async () => {
    for (const code of [401, 422]) {
      const d = deps([status(code), ok({})]);
      await expect(postJson('p', 'u', {}, {}, d)).rejects.toMatchObject({ status: code, retryable: false });
      expect(d.calls).toBe(1);
    }
  });
});
