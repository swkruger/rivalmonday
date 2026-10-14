import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CostAdapter, CostEnv } from '../types';
import { jsonRes, spyConsole } from '../../../../test/cost-utils';
import { dataforseoAdapter } from './dataforseo';
import { openrouterAdapter } from './openrouter';
import { scrapecreatorsAdapter } from './scrapecreators';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as unknown;
const now = new Date('2026-10-13T12:00:00Z');
const timeoutErr = () => new DOMException('The operation timed out.', 'TimeoutError');

const cases: { name: string; adapter: CostAdapter; env: CostEnv; fixture: string; url: string; expected: object; bad: unknown }[] = [
  {
    name: 'openrouter',
    adapter: openrouterAdapter,
    env: { OPENROUTER_API_KEY: 'sk-fake-123' },
    fixture: 'openrouter-credits.json',
    url: 'https://openrouter.ai/api/v1/credits',
    expected: { status: 'ok', kind: 'balance', amountUsd: 20 - 3.91 },
    bad: { data: { total_credits: 'lots' } },
  },
  {
    name: 'dataforseo',
    adapter: dataforseoAdapter,
    env: { DATAFORSEO_LOGIN: 'me@example.test', DATAFORSEO_PASSWORD: 'sk-fake-123' },
    fixture: 'dataforseo-user-data.json',
    url: 'https://api.dataforseo.com/v3/appendix/user_data',
    expected: { status: 'ok', kind: 'balance', amountUsd: 49.67 },
    bad: { status_code: 20000, tasks: [{ status_code: 20000, result: [] }] },
  },
  {
    name: 'scrapecreators',
    adapter: scrapecreatorsAdapter,
    env: { SCRAPECREATORS_API_KEY: 'sk-fake-123' },
    fixture: 'scrapecreators-credits.json',
    url: 'https://api.scrapecreators.com/v1/credit-balance',
    expected: { status: 'ok', kind: 'balance', units: 7099 },
    bad: { success: true, creditCount: 'many' },
  },
];

afterEach(() => vi.restoreAllMocks());

describe.each(cases)('$name adapter', ({ adapter, env, fixture, url, expected, bad }) => {
  it('ok fixture gives the exact amount/units', async () => {
    const f = vi.fn(async () => jsonRes(fx(fixture)));
    const r = await adapter(env, f as unknown as typeof fetch, now);
    expect(r).toEqual(expected);
    expect((f.mock.calls as unknown[][])[0]![0]).toBe(url);
  });
  it('401 gives error "HTTP 401"', async () => {
    const r = await adapter(env, (async () => jsonRes({ error: 'nope' }, 401)) as typeof fetch, now);
    expect(r).toEqual({ status: 'error', kind: 'balance', error: 'HTTP 401' });
  });
  it('timeout gives "timeout"', async () => {
    const r = await adapter(env, (async () => { throw timeoutErr(); }) as typeof fetch, now);
    expect(r).toMatchObject({ status: 'error', error: 'timeout' });
  });
  it('malformed body gives "bad response"', async () => {
    const r = await adapter(env, (async () => jsonRes(bad)) as typeof fetch, now);
    expect(r).toEqual({ status: 'error', kind: 'balance', error: 'bad response' });
  });
  it('missing env gives not_configured and fetch is not called', async () => {
    const f = vi.fn();
    const r = await adapter({}, f as unknown as typeof fetch, now);
    expect(r).toEqual({ status: 'not_configured', kind: 'balance' });
    expect(f).not.toHaveBeenCalled();
  });
  it('an error body containing a secret never appears in the result or console', async () => {
    const c = spyConsole();
    const r = await adapter(env, (async () => jsonRes({ error: 'bad key sk-fake-123' }, 500)) as typeof fetch, now);
    const out = c.output();
    c.restore();
    expect(JSON.stringify(r)).not.toContain('sk-fake-123');
    expect(out).not.toContain('sk-fake-123');
  });
});

describe('dataforseo specifics', () => {
  const env = { DATAFORSEO_LOGIN: 'me@example.test', DATAFORSEO_PASSWORD: 'pw' };
  it('task 40201 gives "task 40201"', async () => {
    const body = { status_code: 20000, tasks: [{ status_code: 40201, status_message: 'paused' }] };
    expect(await dataforseoAdapter(env, (async () => jsonRes(body)) as typeof fetch, now)).toEqual({
      status: 'error', kind: 'balance', error: 'task 40201',
    });
  });
  it('top-level non-20000 gives "task <code>"', async () => {
    const body = { status_code: 40100, tasks: [] };
    expect(await dataforseoAdapter(env, (async () => jsonRes(body)) as typeof fetch, now)).toMatchObject({ error: 'task 40100' });
  });
  it('uses the production host even if DATAFORSEO_BASE_URL is the sandbox', async () => {
    const f = vi.fn(async () => jsonRes(fx('dataforseo-user-data.json')));
    const sandboxEnv = { ...env, DATAFORSEO_BASE_URL: 'https://sandbox.dataforseo.com' } as CostEnv;
    await dataforseoAdapter(sandboxEnv, f as unknown as typeof fetch, now);
    expect((f.mock.calls as unknown[][])[0]![0]).toBe('https://api.dataforseo.com/v3/appendix/user_data');
    const headers = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('me@example.test:pw').toString('base64')}`);
  });
});

describe('header auth', () => {
  it('openrouter sends a Bearer key; scrapecreators sends x-api-key', async () => {
    const f = vi.fn(async () => jsonRes(fx('openrouter-credits.json')));
    await openrouterAdapter({ OPENROUTER_API_KEY: 'k1' }, f as unknown as typeof fetch, now);
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer k1');
    const g = vi.fn(async () => jsonRes(fx('scrapecreators-credits.json')));
    await scrapecreatorsAdapter({ SCRAPECREATORS_API_KEY: 'k2' }, g as unknown as typeof fetch, now);
    expect(((g.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['x-api-key']).toBe('k2');
  });
});
