import { describe, expect, it } from 'vitest';
import { fetchJson } from './http';
import { hangingFetch, jsonRes } from './test-utils';

describe('fetchJson', () => {
  it('returns the parsed body on 2xx', async () => {
    const r = await fetchJson((async () => jsonRes({ a: 1 })) as typeof fetch, 'https://x.test', {});
    expect(r).toEqual({ ok: true, body: { a: 1 } });
  });
  it('non-2xx gives HTTP <status> without the body', async () => {
    const r = await fetchJson((async () => jsonRes({ leak: 'sk-fake-123' }, 401)) as typeof fetch, 'https://x.test', {});
    expect(r).toEqual({ ok: false, error: 'HTTP 401', status: 401 });
  });
  it('aborts after timeoutMs with "timeout"', async () => {
    const r = await fetchJson(hangingFetch(), 'https://x.test', {}, 20);
    expect(r).toEqual({ ok: false, error: 'timeout' });
  });
  it('invalid JSON gives "bad response"', async () => {
    const r = await fetchJson((async () => new Response('<html>', { status: 200 })) as typeof fetch, 'https://x.test', {});
    expect(r).toEqual({ ok: false, error: 'bad response' });
  });
  it('other throws give "network error"', async () => {
    const r = await fetchJson(
      (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
      'https://x.test',
      {},
    );
    expect(r).toEqual({ ok: false, error: 'network error' });
  });
});
