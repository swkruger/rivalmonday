import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_EMAIL_COOKIE, signPendingEmail, verifyPendingEmail } from '@/server/pending-email';

const SECRET = 's'.repeat(40);
const m = vi.hoisted(() => ({ magic: vi.fn(), slot: vi.fn(), cookieSet: vi.fn(), cookie: undefined as string | undefined }));
vi.mock('@/server/auth', () => ({ auth: () => ({ api: { signInMagicLink: (a: unknown) => m.magic(a) } }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: 's'.repeat(40) }) }));
vi.mock('@/server/pending-email', async (orig) => ({ ...(await orig<typeof import('@/server/pending-email')>()), takeResendSlot: (...a: unknown[]) => m.slot(...a) }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
  cookies: async () => ({ get: (n: string) => (n === 'rm_pending_email' && m.cookie !== undefined ? { name: n, value: m.cookie } : undefined), set: m.cookieSet }),
}));
const { rememberPendingEmail, resendEmailAction } = await import('./actions');

const idle = { status: 'idle' as const, message: null };
const SENT = { status: 'sent', message: 'If that address can sign in, a new email is on its way.' };
const fd = (o: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const cookieFor = (email: string, flow: 'signin' | 'signup', next = '/') => signPendingEmail(SECRET, { email, flow, next });

beforeEach(() => {
  for (const f of [m.magic, m.slot, m.cookieSet]) f.mockReset();
  m.magic.mockResolvedValue({ status: true });
  m.slot.mockResolvedValue(true);
  m.cookie = undefined;
});

describe('resendEmailAction', () => {
  it('re-sends to the cookie address with the sign-in callbacks, after a 400 ms floor', async () => {
    m.cookie = cookieFor('Pat@Acme.com', 'signin', '/c/1/briefs');
    const t0 = Date.now();
    expect(await resendEmailAction(idle, fd())).toEqual(SENT);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(395);
    expect(m.slot).toHaveBeenCalledWith('svc', 'pat@acme.com');
    expect(m.magic).toHaveBeenCalledTimes(1);
    expect(m.magic.mock.calls[0]![0]).toMatchObject({
      body: { email: 'pat@acme.com', callbackURL: '/c/1/briefs', errorCallbackURL: `/sign-in?reason=link&next=${encodeURIComponent('/c/1/briefs')}` },
    });
  });

  it('signup flow uses /onboarding/start', async () => {
    m.cookie = cookieFor('pat@acme.com', 'signup');
    expect(await resendEmailAction(idle, fd())).toEqual(SENT);
    expect(m.magic.mock.calls[0]![0]).toMatchObject({ body: { email: 'pat@acme.com', callbackURL: '/onboarding/start', errorCallbackURL: '/sign-up?reason=link' } });
  });

  it('unknown address gets the same result', async () => {
    // Better Auth answers the same for any address (sendMagicLink's hasSignInRight check runs in the background).
    m.cookie = cookieFor('stranger@nowhere.example', 'signin');
    const unknown = await resendEmailAction(idle, fd());
    m.slot.mockResolvedValue(false); // refused by the per-address limit
    const refused = await resendEmailAction(idle, fd());
    m.magic.mockRejectedValue(new Error('boom')); // Better Auth's IP limit or any send error
    m.slot.mockResolvedValue(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await resendEmailAction(idle, fd());
    expect(err.mock.calls.flat().join(' ')).not.toMatch(/stranger|nowhere/);
    err.mockRestore();
    expect([unknown, refused, failed]).toEqual([SENT, SENT, SENT]);
    expect(m.magic).toHaveBeenCalledTimes(2); // not for the refused slot
  });

  it('missing cookie returns expired and never calls signInMagicLink', async () => {
    expect(await resendEmailAction(idle, fd({ email: 'pat@acme.com' }))).toEqual({ status: 'expired', message: null });
    m.cookie = `${cookieFor('pat@acme.com', 'signin').slice(0, -3)}abc`; // tampered
    expect(await resendEmailAction(idle, fd({ email: 'pat@acme.com' }))).toEqual({ status: 'expired', message: null });
    expect(m.slot).not.toHaveBeenCalled();
    expect(m.magic).not.toHaveBeenCalled();
  });

  it('never trusts a `next` that would leave the site', async () => {
    m.cookie = cookieFor('pat@acme.com', 'signin', '//evil.example');
    await resendEmailAction(idle, fd());
    expect(m.magic.mock.calls[0]![0]).toMatchObject({ body: { callbackURL: '/' } });
  });
});

describe('rememberPendingEmail', () => {
  it('sets the signed sign-in cookie with the decided options and a safe next', async () => {
    await rememberPendingEmail(' Pat@Acme.com ', '//evil.example');
    const [name, value, opts] = m.cookieSet.mock.calls[0]!;
    expect(name).toBe(PENDING_EMAIL_COOKIE);
    expect(opts).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 900 });
    expect(verifyPendingEmail(SECRET, value as string)).toEqual({ email: 'pat@acme.com', flow: 'signin', next: '/' });
  });

  it('ignores something that is not an email address', async () => {
    await rememberPendingEmail('not-an-email', '/');
    expect(m.cookieSet).not.toHaveBeenCalled();
  });
});
