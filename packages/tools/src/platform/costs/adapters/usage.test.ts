import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CostAdapter, CostEnv } from '../types';
import { jsonRes, spyConsole } from '../../../../test/cost-utils';
import { anthropicAdapter } from './anthropic';
import { apifyAdapter } from './apify';
import { neonAdapter } from './neon';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as unknown;
const now = new Date('2026-10-13T12:34:56Z');
const timeoutErr = () => new DOMException('The operation timed out.', 'TimeoutError');
const callUrl = (f: ReturnType<typeof vi.fn>, i = 0) => String(f.mock.calls[i]![0]);
const callInit = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i]![1] as RequestInit;

afterEach(() => vi.restoreAllMocks());

const common: { name: string; adapter: CostAdapter; env: CostEnv; ok: unknown; bad: unknown }[] = [
  { name: 'apify', adapter: apifyAdapter, env: { APIFY_TOKEN: 'sk-fake-123' }, ok: fx('apify-limits.json'), bad: { data: { current: {} } } },
  { name: 'anthropic', adapter: anthropicAdapter, env: { ANTHROPIC_ADMIN_KEY: 'sk-fake-123' }, ok: fx('anthropic-cost-single.json'), bad: { data: 'x' } },
  { name: 'neon', adapter: neonAdapter, env: { NEON_API_KEY: 'sk-fake-123', NEON_ORG_ID: 'org-fake' }, ok: fx('neon-consumption-2.json'), bad: { projects: 'x' } },
];

describe.each(common)('$name adapter (common)', ({ adapter, env, ok, bad }) => {
  it('ok body gives status ok, kind usage', async () => {
    const r = await adapter(env, (async () => jsonRes(ok)) as typeof fetch, now);
    expect(r).toMatchObject({ status: 'ok', kind: 'usage' });
  });
  it('401 gives error "HTTP 401"', async () => {
    expect(await adapter(env, (async () => jsonRes({}, 401)) as typeof fetch, now)).toEqual({ status: 'error', kind: 'usage', error: 'HTTP 401' });
  });
  it('timeout gives "timeout"', async () => {
    const r = await adapter(env, (async () => { throw timeoutErr(); }) as typeof fetch, now);
    expect(r).toEqual({ status: 'error', kind: 'usage', error: 'timeout' });
  });
  it('malformed body gives "bad response"', async () => {
    expect(await adapter(env, (async () => jsonRes(bad)) as typeof fetch, now)).toEqual({ status: 'error', kind: 'usage', error: 'bad response' });
  });
  it('missing env gives not_configured and fetch is not called', async () => {
    const f = vi.fn();
    expect(await adapter({}, f as unknown as typeof fetch, now)).toEqual({ status: 'not_configured', kind: 'usage' });
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

describe('apify', () => {
  it('ok gives amount and cap', async () => {
    const f = vi.fn(async () => jsonRes(fx('apify-limits.json')));
    const r = await apifyAdapter({ APIFY_TOKEN: 't' }, f as unknown as typeof fetch, now);
    expect(r).toEqual({ status: 'ok', kind: 'usage', amountUsd: 0.049, capUsd: 5 });
    expect(callUrl(f)).toBe('https://api.apify.com/v2/users/me/limits');
    expect((callInit(f).headers as Record<string, string>).Authorization).toBe('Bearer t');
  });
});

describe('anthropic', () => {
  const env = { ANTHROPIC_ADMIN_KEY: 'k' };
  it("sums '123.45' + '0.55' to 1.24 exactly", async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(fx('anthropic-cost-paged-1.json'))).mockResolvedValueOnce(jsonRes(fx('anthropic-cost-paged-2.json')));
    const r = await anthropicAdapter(env, f as unknown as typeof fetch, now);
    expect(r).toEqual({ status: 'ok', kind: 'usage', amountUsd: 1.24 });
  });
  it('follows next_page', async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(fx('anthropic-cost-paged-1.json'))).mockResolvedValueOnce(jsonRes(fx('anthropic-cost-paged-2.json')));
    await anthropicAdapter(env, f as unknown as typeof fetch, now);
    expect(f).toHaveBeenCalledTimes(2);
    expect(callUrl(f, 1)).toContain('page=page_abc');
    const h = callInit(f).headers as Record<string, string>;
    expect(h['x-api-key']).toBe('k');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(callUrl(f)).toContain('bucket_width=1d');
    expect(callUrl(f)).toContain('limit=31');
  });
  it('caps at 3 pages', async () => {
    const f = vi.fn(async () => jsonRes(fx('anthropic-cost-paged-1.json')));
    await anthropicAdapter(env, f as unknown as typeof fetch, now);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("starting_at is the 1st of now's UTC month", async () => {
    for (const [d, want] of [
      ['2026-10-01T00:30:00Z', '2026-10-01T00:00:00Z'],
      ['2026-12-31T23:59:00Z', '2026-12-01T00:00:00Z'],
    ] as const) {
      const f = vi.fn(async () => jsonRes(fx('anthropic-cost-single.json')));
      await anthropicAdapter(env, f as unknown as typeof fetch, new Date(d));
      expect(new URL(callUrl(f)).searchParams.get('starting_at')).toBe(want);
    }
  });
  it('a non-numeric amount gives "bad response"', async () => {
    const body = { data: [{ results: [{ amount: 'abc' }] }], has_more: false };
    expect(await anthropicAdapter(env, (async () => jsonRes(body)) as typeof fetch, now)).toMatchObject({ status: 'error', error: 'bad response' });
  });
  it('an error on a later page is reported, not a partial sum', async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(fx('anthropic-cost-paged-1.json'))).mockResolvedValueOnce(jsonRes({}, 429));
    expect(await anthropicAdapter(env, f as unknown as typeof fetch, now)).toEqual({ status: 'error', kind: 'usage', error: 'HTTP 429' });
  });
});

describe('neon', () => {
  const env = { NEON_API_KEY: 'k', NEON_ORG_ID: 'org-1' };
  it('403 gives unavailable', async () => {
    expect(await neonAdapter(env, (async () => jsonRes({}, 403)) as typeof fetch, now)).toEqual({ status: 'unavailable', kind: 'usage' });
  });
  it('sums seconds across projects and pages into CU-hours', async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(fx('neon-consumption-1.json'))).mockResolvedValueOnce(jsonRes(fx('neon-consumption-2.json')));
    const r = await neonAdapter(env, f as unknown as typeof fetch, now);
    expect(r).toEqual({ status: 'ok', kind: 'usage', units: 3.75 });
    expect(callUrl(f, 1)).toContain('cursor=cur-2');
  });
  it('builds the request (org, window floored to the hour, daily, metric, limit)', async () => {
    const f = vi.fn(async () => jsonRes(fx('neon-consumption-2.json')));
    await neonAdapter(env, f as unknown as typeof fetch, now);
    const u = new URL(callUrl(f));
    expect(u.origin + u.pathname).toBe('https://console.neon.tech/api/v2/consumption_history/v2/projects');
    expect(u.searchParams.get('org_id')).toBe('org-1');
    expect(u.searchParams.get('from')).toBe('2026-10-01T00:00:00Z');
    expect(u.searchParams.get('to')).toBe('2026-10-13T12:00:00Z');
    expect(u.searchParams.get('granularity')).toBe('daily');
    expect(u.searchParams.get('metrics')).toBe('compute_unit_seconds');
    expect(u.searchParams.get('limit')).toBe('100');
    expect((callInit(f).headers as Record<string, string>).Authorization).toBe('Bearer k');
  });
  it('rounds CU-hours to 4 dp', async () => {
    const body = { projects: [{ periods: [{ consumption: [{ compute_unit_seconds: 1 }] }] }], pagination: {} };
    const r = await neonAdapter(env, (async () => jsonRes(body)) as typeof fetch, now);
    expect(r.units).toBe(0.0003);
  });
  it('missing org id gives not_configured', async () => {
    const f = vi.fn();
    expect(await neonAdapter({ NEON_API_KEY: 'k' }, f as unknown as typeof fetch, now)).toEqual({ status: 'not_configured', kind: 'usage' });
    expect(f).not.toHaveBeenCalled();
  });
  it('caps at 5 pages', async () => {
    const f = vi.fn(async () => jsonRes(fx('neon-consumption-1.json')));
    await neonAdapter(env, f as unknown as typeof fetch, now);
    expect(f).toHaveBeenCalledTimes(5);
  });
});
