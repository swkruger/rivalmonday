// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { submitWaitlist } from './waitlist-submit';

const APP = 'https://app.test';
const body = { kind: 'business', email: 'sam@roe.test', turnstileToken: 'tok' };

function fakeFetch(status: number, json?: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(json === undefined ? 'not json' : JSON.stringify(json), { status }));
}

describe('submitWaitlist', () => {
  it('posts json to <app>/api/waitlist with credentials omit and only content-type', async () => {
    const f = fakeFetch(200, { ok: true });
    await submitWaitlist(APP, body, f);
    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://app.test/api/waitlist');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('omit');
    expect(init?.mode).toBe('cors');
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual(body);
  });

  it('200 ok → ok', async () => {
    expect(await submitWaitlist(APP, body, fakeFetch(200, { ok: true }))).toEqual({ ok: true });
  });

  it('200 without ok:true → unavailable', async () => {
    expect(await submitWaitlist(APP, body, fakeFetch(200, { ok: 'yes' }))).toEqual({ ok: false, reason: 'unavailable' });
    expect(await submitWaitlist(APP, body, fakeFetch(200))).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('400 check → check', async () => {
    expect(await submitWaitlist(APP, body, fakeFetch(400, { ok: false, error: 'check' }))).toEqual({ ok: false, reason: 'check' });
  });

  it('400 invalid → invalid', async () => {
    expect(await submitWaitlist(APP, body, fakeFetch(400, { ok: false, error: 'invalid' }))).toEqual({ ok: false, reason: 'invalid' });
    expect(await submitWaitlist(APP, body, fakeFetch(400))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('403 → unavailable', async () => {
    expect(await submitWaitlist(APP, body, fakeFetch(403, { ok: false }))).toEqual({ ok: false, reason: 'unavailable' });
    expect(await submitWaitlist(APP, body, fakeFetch(503))).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('network error → unavailable', async () => {
    const f = vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch'); });
    expect(await submitWaitlist(APP, body, f)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('oversize body refused before fetch', async () => {
    const f = fakeFetch(200, { ok: true });
    expect(await submitWaitlist(APP, { ...body, orgName: 'x'.repeat(8_001) }, f)).toEqual({ ok: false, reason: 'invalid' });
    expect(f).not.toHaveBeenCalled();
  });
});
