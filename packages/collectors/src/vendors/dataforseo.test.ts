import type { VendorCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createDataForSeo, VendorError } from './dataforseo';

const scope = { agencyId: null, clientId: null };
const ok = (tasks: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ status_code: 20000, status_message: 'Ok.', cost: 0.002, tasks, ...extra }), { status: 200 });
const task = (result: unknown[], code = 20000) => ({ id: 'abc', status_code: code, status_message: 'Ok.', cost: 0.002, result });

function setup(responses: Response[]) {
  const records: VendorCallRecord[] = [];
  const fetch = vi.fn(async () => responses.shift() ?? new Response('{}', { status: 500 }));
  let t = 0;
  const client = createDataForSeo({
    login: 'me', password: 'secret', ledger: { recordLlmCall: async () => {}, recordVendorCall: async (r) => { records.push(r); } },
    fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, maxRetries: 2, now: () => (t += 10),
  });
  return { client, fetch, records };
}

describe('DataForSEO client', () => {
  it('posts tasks with Basic auth and returns normalised tasks', async () => {
    const { client, fetch, records } = setup([ok([task([{ items: [] }])])]);
    const tasks = await client.post('/serp/google/maps/live/advanced', [{ keyword: 'ac repair' }], scope);
    expect(tasks).toEqual([{ id: 'abc', statusCode: 20000, statusMessage: 'Ok.', result: [{ items: [] }], tag: null }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.dataforseo.com/v3/serp/google/maps/live/advanced');
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('me:secret').toString('base64')}`);
    expect(JSON.parse(init.body as string)).toEqual([{ keyword: 'ac repair' }]);
    expect(records).toEqual([{ ...scope, vendor: 'dataforseo', operation: '/serp/google/maps/live/advanced', units: 1, costUsd: 0.002, latencyMs: 10, ok: true }]);
  });

  it('strips task ids from the ledger operation on GET', async () => {
    const { client, records } = setup([ok([task([])])]);
    await client.get('/business_data/google/reviews/task_get/0f1e2d3c-4b5a-4968-8776-655443322110', scope);
    expect(records[0]?.operation).toBe('/business_data/google/reviews/task_get');
  });

  it('retries API rate limits (40202) then succeeds, logging exactly one ledger row', async () => {
    const limited = new Response(JSON.stringify({ status_code: 40202, status_message: 'rate limit', tasks: [] }), { status: 200 });
    const { client, fetch, records } = setup([limited, ok([task([])])]);
    await expect(client.post('/x', [{}], scope)).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ ok: true, costUsd: 0.002 });
  });

  it('retries any 50xxx API status code then succeeds, logging exactly one ledger row', async () => {
    const serverError = new Response(JSON.stringify({ status_code: 50100, status_message: 'internal error', tasks: [] }), { status: 200 });
    const { client, fetch, records } = setup([serverError, ok([task([])])]);
    await expect(client.post('/x', [{}], scope)).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ ok: true, costUsd: 0.002 });
  });

  it('throws a typed non-retryable error for auth failures and logs the failed call', async () => {
    const denied = new Response(JSON.stringify({ status_code: 40100, status_message: 'not authorized', tasks: [] }), { status: 200 });
    const { client, records } = setup([denied]);
    const err = await client.post('/x', [{}], scope).catch((e) => e);
    expect(err).toBeInstanceOf(VendorError);
    expect(err).toMatchObject({ vendor: 'dataforseo', code: 40100, retryable: false });
    expect(records[0]).toMatchObject({ ok: false, costUsd: null });
  });

  it('throws on HTTP 500 after retries and on malformed bodies', async () => {
    const { client } = setup([new Response('x', { status: 500 }), new Response('x', { status: 500 }), new Response('x', { status: 500 })]);
    await expect(client.post('/x', [{}], scope)).rejects.toMatchObject({ code: 500, retryable: true });
    const bad = setup([new Response('not json', { status: 200 })]);
    await expect(bad.client.post('/x', [{}], scope)).rejects.toMatchObject({ retryable: false });
  });

  it('includes the API status from a non-2xx envelope in the error message (e.g. 403 + 40104 unverified account)', async () => {
    const body = { status_code: 40104, status_message: 'Please verify your account before using the API.', tasks: null };
    const { client, records } = setup([new Response(JSON.stringify(body), { status: 403 })]);
    const err = await client.post('/serp/google/maps/live/advanced', [{}], scope).catch((e) => e);
    expect(err).toMatchObject({ code: 403, retryable: false });
    expect(err.message).toBe('HTTP 403 from /serp/google/maps/live/advanced: 40104 Please verify your account before using the API.');
    expect(records[0]).toMatchObject({ ok: false });
  });

  it('never lets a ledger failure change the outcome', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = createDataForSeo({
      login: 'a', password: 'b', fetch: (async () => ok([task([])])) as unknown as typeof fetch,
      ledger: { recordLlmCall: async () => {}, recordVendorCall: async () => { throw new Error('db down'); } },
    });
    await expect(client.post('/x', [{}], scope)).resolves.toHaveLength(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('normalises the echoed tag from task.data.tag, or a top-level tag', async () => {
    const { client } = setup([ok([{ ...task([]), data: { tag: 'from-data', keyword: 'x' } }, { ...task([]), tag: 'top-level' }, task([])])]);
    const tasks = await client.post('/serp/google/jobs/task_post', [{ keyword: 'x' }], scope);
    expect(tasks.map((t) => t.tag)).toEqual(['from-data', 'top-level', null]);
  });
});
