import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  submit: vi.fn(),
  turnstile: vi.fn(),
  send: vi.fn(),
  afterCbs: [] as Array<() => Promise<void>>,
  deps: { service: 'svc', leadEmail: { appUrl: 'https://app.test' } as unknown },
  envName: 'test' as string,
  secret: 'k' as string | undefined,
}));
vi.mock('@cs/tools', async () => {
  const { z } = await import('zod');
  return {
    waitlistSubmitSchema: z.object({ email: z.string().email(), turnstileToken: z.string().min(1) }),
    submitWaitlistEntry: (...a: unknown[]) => m.submit(...a),
    sendWaitlistEmail: (...a: unknown[]) => m.send(...a),
    hashIp: (ip: string) => `h:${ip}`,
  };
});
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => { m.afterCbs.push(fn); } }));
vi.mock('@/server/turnstile', () => ({ verifyTurnstile: (...a: unknown[]) => m.turnstile(...a) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => m.envName }));
vi.mock('@/server/tools', () => ({ toolDeps: () => m.deps }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ siteOrigins: ['https://rivalmonday.com'], authSecret: 's', turnstile: m.secret ? { secretKey: m.secret } : undefined }) }));
const { OPTIONS, POST } = await import('./route');

const SITE = 'https://rivalmonday.com';
const post = (body: unknown, origin: string | null = SITE) =>
  POST(new Request('http://internal/api/waitlist', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: origin ? { origin, 'x-forwarded-for': '1.2.3.4' } : {},
  }));
const good = { email: 'a@b.co', turnstileToken: 't' };

beforeEach(() => {
  vi.useFakeTimers();
  m.submit.mockReset().mockResolvedValue({ send: { entryId: 'e1', confirmRaw: 'raw' } });
  m.turnstile.mockReset().mockResolvedValue(true);
  m.send.mockReset().mockResolvedValue(undefined);
  m.afterCbs.length = 0;
  m.envName = 'test';
  m.secret = 'k';
  m.deps = { service: 'svc', leadEmail: { appUrl: 'https://app.test' } };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const run = async (p: Promise<Response>) => {
  await vi.advanceTimersByTimeAsync(500);
  return p;
};

describe('POST /api/waitlist', () => {
  it('cors: OPTIONS from SITE_ORIGIN → 204 with exact ACAO', async () => {
    const res = await OPTIONS(new Request('http://internal/api/waitlist', { method: 'OPTIONS', headers: { origin: SITE } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
    expect((await OPTIONS(new Request('http://internal/api/waitlist', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }))).status).toBe(403);
  });

  it('cors: POST without Origin or from another origin → 403 and nothing submitted', async () => {
    expect((await post(good, null)).status).toBe(403);
    expect((await post(good, 'https://evil.example')).status).toBe(403);
    expect((await post(good, `${SITE}/`)).status).toBe(403);
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.turnstile).not.toHaveBeenCalled();
  });

  it('invalid json / schema → 400 invalid, nothing submitted', async () => {
    for (const b of ['', '{nope', { email: 'x' }, 'x'.repeat(9000)]) {
      const res = await post(b);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'invalid' });
    }
    expect(m.submit).not.toHaveBeenCalled();
  });

  it('turnstile fail → 400 check, nothing submitted', async () => {
    m.turnstile.mockResolvedValue(false);
    const res = await run(post(good));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'check' });
    expect(m.submit).not.toHaveBeenCalled();
  });

  it('live env (dev) without a Turnstile secret fails closed: 400 check, the verifier is not consulted, nothing submitted', async () => {
    m.envName = 'dev';
    m.secret = undefined;
    const res = await run(post(good));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'check' });
    expect(m.turnstile).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
  });

  it('dev with a secret verifies normally; test/demo without a secret use the fake verifier', async () => {
    m.envName = 'dev';
    expect((await run(post(good))).status).toBe(200);
    m.envName = 'demo';
    m.secret = undefined;
    expect((await run(post(good))).status).toBe(200);
  });

  it('uniform response: accepted, refused (send null) and submit throwing all → 200 {ok:true} with identical headers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const outcomes: Response[] = [];
    outcomes.push(await run(post(good)));
    m.submit.mockResolvedValue({ send: null });
    outcomes.push(await run(post(good)));
    m.submit.mockRejectedValue(new Error('db down for a@b.co'));
    outcomes.push(await run(post(good)));
    const heads = outcomes.map((r) => JSON.stringify([...r.headers.entries()].sort()));
    for (const r of outcomes) {
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
    }
    expect(new Set(heads).size).toBe(1);
  });

  it('takes at least 400 ms', async () => {
    let done = false;
    const p = post(good).then((r) => { done = true; return r; });
    await vi.advanceTimersByTimeAsync(300);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    await p;
    expect(done).toBe(true);
  });

  it('confirmation email queued only when send is returned', async () => {
    await run(post(good));
    expect(m.afterCbs).toHaveLength(1);
    await m.afterCbs[0]!();
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ service: 'svc' }), 'e1', 'confirmation', { confirmRaw: 'raw' });
    m.afterCbs.length = 0;
    m.submit.mockResolvedValue({ send: null });
    await run(post(good));
    expect(m.afterCbs).toHaveLength(0);
  });

  it('no pii in logs', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.submit.mockRejectedValue(new Error('boom a@b.co'));
    await run(post(good));
    m.send.mockRejectedValue(new Error('smtp a@b.co raw'));
    m.submit.mockResolvedValue({ send: { entryId: 'e1', confirmRaw: 'raw' } });
    await run(post(good));
    await m.afterCbs[0]!();
    expect(err).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/a@b\.co|raw|1\.2\.3\.4/);
  });
});
