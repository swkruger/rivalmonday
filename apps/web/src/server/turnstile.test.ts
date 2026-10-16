import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from './turnstile';

afterEach(() => vi.unstubAllGlobals());
const real = { envName: 'dev' as const, turnstileSecretKey: 'sek' };

describe('verifyTurnstile fake', () => {
  it('passes unless the token is "fail" when DEMO/TEST or secret unset', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await verifyTurnstile('ok', null, { envName: 'test', turnstileSecretKey: 'sek' })).toBe(true);
    expect(await verifyTurnstile('fail', null, { envName: 'demo', turnstileSecretKey: 'sek' })).toBe(false);
    expect(await verifyTurnstile('ok', '1.1.1.1', { envName: 'dev', turnstileSecretKey: undefined })).toBe(true);
    expect(await verifyTurnstile('fail', null, { envName: 'dev', turnstileSecretKey: undefined })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('verifyTurnstile real', () => {
  it('posts secret, response, remoteip and reads success', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', f);
    expect(await verifyTurnstile('tok', '9.9.9.9', real)).toBe(true);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('secret')).toBe('sek');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('9.9.9.9');
  });
  it('omits remoteip when null; success false -> false', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    vi.stubGlobal('fetch', f);
    expect(await verifyTurnstile('tok', null, real)).toBe(false);
    expect(new URLSearchParams(String(f.mock.calls[0]![1].body)).has('remoteip')).toBe(false);
  });
  it('network error or non-ok -> false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await verifyTurnstile('tok', null, real)).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: true }) }));
    expect(await verifyTurnstile('tok', null, real)).toBe(false);
  });
});
