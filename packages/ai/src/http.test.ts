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

  it('throws AiProviderError for 200 with invalid JSON', async () => {
    const d = deps([new Response('not json', { status: 200 })]);
    const err = await postJson('p', 'u', {}, {}, d).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ provider: 'p', status: 200, retryable: false });
    expect(d.calls).toBe(1);
  });

  it('postJson aborts at the per-call timeout', async () => {
    const d = deps([]);
    d.maxRetries = 0;
    d.timeoutMs = 60_000;
    d.fetch = ((_u: unknown, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () => rej(init.signal!.reason));
      })) as unknown as typeof fetch;
    const started = Date.now();
    await expect(postJson('p', 'u', {}, {}, d, { timeoutMs: 30, maxAttempts: 1 })).rejects.toBeInstanceOf(AiProviderError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('per-call maxAttempts caps retries (maxRetries = attempts - 1)', async () => {
    const d = deps([status(503), status(503), ok({})]);
    await expect(postJson('p', 'u', {}, {}, d, { timeoutMs: 1000, maxAttempts: 2 })).rejects.toBeInstanceOf(AiProviderError);
    expect(d.calls).toBe(2);
  });

  it('http: aborted signal stops without retry', async () => {
    const ac = new AbortController();
    const d = deps([ok({})]);
    d.fetch = vi.fn(async () => {
      ac.abort();
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;
    const err = await postJson('p', 'u', {}, {}, d, undefined, ac.signal).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ provider: 'p', status: null, retryable: false, message: 'p call aborted' });
    expect(d.fetch).toHaveBeenCalledTimes(1);
    expect(d.sleeps).toEqual([]);
  });

  it('http: aborted before a retry sleep throws without sleeping', async () => {
    const ac = new AbortController();
    const d = deps([status(503), ok({})]);
    const fetchOnce = d.fetch;
    d.fetch = vi.fn(async (...a: Parameters<typeof fetch>) => {
      const r = await fetchOnce(...a);
      ac.abort();
      return r;
    }) as unknown as typeof fetch;
    await expect(postJson('p', 'u', {}, {}, d, undefined, ac.signal)).rejects.toMatchObject({ message: 'p call aborted', retryable: false });
    expect(d.sleeps).toEqual([]);
  });

  it('http: timeout still retries', async () => {
    const ac = new AbortController();
    const d = deps([new DOMException('timed out', 'TimeoutError'), ok({ done: 1 })]);
    await expect(postJson('p', 'u', {}, {}, d, undefined, ac.signal)).resolves.toEqual({ done: 1 });
    expect(d.sleeps).toEqual([100]);
    const [, init] = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    ac.abort();
    expect(init.signal?.aborted).toBe(true); // the combined signal follows the caller's
  });
});
