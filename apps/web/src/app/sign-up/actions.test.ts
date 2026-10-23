import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  start: vi.fn(), magic: vi.fn(), social: vi.fn(), turnstile: vi.fn(), cookieSet: vi.fn(), pending: vi.fn(), headerIp: '203.0.113.9, 10.0.0.1', turnstileCfg: {} as { siteKey?: string; secretKey?: string },
}));
vi.mock('@cs/tools', async (orig) => ({ ...(await orig<typeof import('@cs/tools')>()), startAgencySignup: (...a: unknown[]) => m.start(...a) }));
vi.mock('@/server/auth', () => ({ auth: () => ({ api: { signInMagicLink: (a: unknown) => m.magic(a), signInSocial: (a: unknown) => m.social(a) } }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'dev' }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: 's'.repeat(40), google: { clientId: 'g', clientSecret: 'g' }, turnstile: m.turnstileCfg }) }));
vi.mock('@/server/turnstile', () => ({ verifyTurnstile: (...a: unknown[]) => m.turnstile(...a) }));
vi.mock('@/server/pending-signup', () => ({ openPendingSignup: (...a: unknown[]) => m.pending(...a) }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': m.headerIp }),
  cookies: async () => ({ set: m.cookieSet }),
}));
class Redirect extends Error {
  constructor(public to: string) {
    super(to);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
const { startSignup } = await import('./actions');
const { PENDING_EMAIL_COOKIE, verifyPendingEmail } = await import('@/server/pending-email');

const form = (o: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ email: 'Pat@Acme.com', agencyName: 'Acme HVAC', contactName: 'Pat', ...o })) f.set(k, v);
  return f;
};
const empty = { error: null, googleUrl: null };
const redirectOf = async (p: Promise<unknown>) => p.then(() => null, (e: Redirect) => e.to);

beforeEach(() => {
  for (const f of [m.start, m.magic, m.social, m.turnstile, m.cookieSet, m.pending]) f.mockReset();
  m.start.mockResolvedValue({ ok: true, sendLink: true });
  m.turnstile.mockResolvedValue(true);
  m.magic.mockResolvedValue({ status: true });
  m.social.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/auth?x=1', redirect: true });
  m.turnstileCfg = {};
  m.pending.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', agencyName: 'Acme HVAC', inviteLinkId: null });
});

describe('startSignup', () => {
  it('happy path: hashes the first forwarded hop, sends exactly one magic link to /onboarding/start, redirects to check-email', async () => {
    const t0 = Date.now();
    expect(await redirectOf(startSignup(empty, form()))).toBe('/sign-in/check-email?for=signup');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(395);
    expect(m.start).toHaveBeenCalledTimes(1);
    const input = m.start.mock.calls[0]![1] as { email: string; ipHash: string; inviteToken?: string };
    expect(input).toMatchObject({ email: 'Pat@Acme.com', agencyName: 'Acme HVAC', contactName: 'Pat' });
    expect(input.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.turnstile.mock.calls[0]![1]).toBe('203.0.113.9');
    expect(m.magic).toHaveBeenCalledTimes(1);
    expect(m.magic.mock.calls[0]![0]).toMatchObject({ body: { email: 'Pat@Acme.com', callbackURL: '/onboarding/start' } });
  });

  it('refused path: no magic link, same redirect, same minimum delay', async () => {
    m.start.mockResolvedValue({ ok: true, sendLink: false });
    const t0 = Date.now();
    expect(await redirectOf(startSignup(empty, form()))).toBe('/sign-in/check-email?for=signup');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(395);
    expect(m.magic).not.toHaveBeenCalled();
  });

  it('startSignup sets rm_pending_email for refused sign-ups too', async () => {
    await redirectOf(startSignup(empty, form()));
    const accepted = m.cookieSet.mock.calls.find((c) => c[0] === PENDING_EMAIL_COOKIE)!;
    m.cookieSet.mockReset();
    m.start.mockResolvedValue({ ok: true, sendLink: false });
    await redirectOf(startSignup(empty, form()));
    const refused = m.cookieSet.mock.calls.find((c) => c[0] === PENDING_EMAIL_COOKIE)!;
    expect(m.cookieSet).toHaveBeenCalledTimes(1);
    expect(refused[2]).toEqual(accepted[2]);
    expect(refused[2]).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 900 });
    for (const c of [accepted, refused]) expect(verifyPendingEmail('s'.repeat(40), c[1] as string)).toEqual({ email: 'pat@acme.com', flow: 'signup', next: '/onboarding/start' });
    // A malformed invite token is a refusal too.
    m.cookieSet.mockReset();
    await redirectOf(startSignup(empty, form({ inviteToken: 'garbage' })));
    expect(m.cookieSet.mock.calls.map((c) => c[0])).toEqual([PENDING_EMAIL_COOKIE]);
  });

  it('a Turnstile failure sets no rm_pending_email; the Google path neither', async () => {
    m.turnstile.mockResolvedValue(false);
    await startSignup(empty, form());
    expect(m.cookieSet).not.toHaveBeenCalled();
    m.turnstile.mockResolvedValue(true);
    await startSignup(empty, form({ intent: 'google' }));
    expect(m.cookieSet.mock.calls.map((c) => c[0])).toEqual(['rm_signup']);
  });

  it('a Turnstile failure re-renders with the message and sends nothing', async () => {
    m.turnstile.mockResolvedValue(false);
    expect(await startSignup(empty, form())).toEqual({ error: 'Please complete the check and try again.', googleUrl: null });
    expect(m.start).not.toHaveBeenCalled();
    expect(m.magic).not.toHaveBeenCalled();
  });

  it('form-field errors re-render (empty agency name, bad email) without calling anything', async () => {
    expect((await startSignup(empty, form({ agencyName: '  ' }))).error).toMatch(/agency name/i);
    expect((await startSignup(empty, form({ email: 'nope' }))).error).toMatch(/valid work email/i);
    expect(m.turnstile).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it('a malformed invite token gets the same redirect without calling the service or sending', async () => {
    expect(await redirectOf(startSignup(empty, form({ inviteToken: 'garbage' })))).toBe('/sign-in/check-email?for=signup');
    expect(m.start).not.toHaveBeenCalled();
    expect(m.magic).not.toHaveBeenCalled();
  });

  it('passes a valid invite token to the service', async () => {
    await redirectOf(startSignup(empty, form({ inviteToken: 'rm_inv_abc' })));
    expect(m.start.mock.calls[0]![1]).toMatchObject({ inviteToken: 'rm_inv_abc' });
  });

  it('a failing magic-link send still ends in the same redirect', async () => {
    m.magic.mockRejectedValue(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await redirectOf(startSignup(empty, form()))).toBe('/sign-in/check-email?for=signup');
    err.mockRestore();
  });

  it('google intent: sets the signed rm_signup cookie and returns the Google URL, sending no email', async () => {
    const r = await startSignup(empty, form({ intent: 'google' }));
    expect(r).toEqual({ error: null, googleUrl: 'https://accounts.google.com/o/oauth2/auth?x=1' });
    expect(m.magic).not.toHaveBeenCalled();
    expect(m.social.mock.calls[0]![0]).toMatchObject({ body: { provider: 'google', callbackURL: '/onboarding/start' } });
    const [name, value, opts] = m.cookieSet.mock.calls[0]!;
    expect(name).toBe('rm_signup');
    expect(value).toMatch(/\./);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', maxAge: 1800, path: '/' });
  });

  it('google intent when refused: still sets an rm_signup cookie with identical name and options, for a random id, within the 400 ms floor (R18)', async () => {
    const ok = await startSignup(empty, form({ intent: 'google' }));
    const accepted = m.cookieSet.mock.calls[0]!;
    m.cookieSet.mockReset();
    m.start.mockResolvedValue({ ok: true, sendLink: false });
    const t0 = Date.now();
    const r = await startSignup(empty, form({ intent: 'google' }));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(395);
    expect(r).toEqual(ok);
    expect(m.cookieSet).toHaveBeenCalledTimes(1);
    const refused = m.cookieSet.mock.calls[0]!;
    expect(refused[0]).toBe(accepted[0]);
    expect(refused[2]).toEqual(accepted[2]);
    expect(refused[1]).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(refused[1]).not.toBe(accepted[1]);
    expect(m.pending).toHaveBeenCalledTimes(1); // only the accepted run looked a row up
  });

  it('refused google cookie is Secure in production, like the accepted one', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    m.start.mockResolvedValue({ ok: true, sendLink: false });
    await startSignup(empty, form({ intent: 'google' }));
    expect(m.cookieSet.mock.calls[0]![2]).toMatchObject({ secure: true, httpOnly: true, sameSite: 'lax', maxAge: 1800 });
    vi.unstubAllEnvs();
  });

  it('a secret key without a site key (no widget) uses the fake verifier and a dummy token', async () => {
    m.turnstileCfg = { secretKey: 'secret' };
    await redirectOf(startSignup(empty, form()));
    expect(m.turnstile.mock.calls[0]![0]).toBe('no-widget');
    expect(m.turnstile.mock.calls[0]![2]).toMatchObject({ turnstileSecretKey: undefined });
  });

  it('both keys set: the real check with the widget token and the secret', async () => {
    m.turnstileCfg = { siteKey: 'site', secretKey: 'secret' };
    await redirectOf(startSignup(empty, form({ 'cf-turnstile-response': 'tok' })));
    expect(m.turnstile.mock.calls[0]![0]).toBe('tok');
    expect(m.turnstile.mock.calls[0]![2]).toMatchObject({ turnstileSecretKey: 'secret' });
  });
});
