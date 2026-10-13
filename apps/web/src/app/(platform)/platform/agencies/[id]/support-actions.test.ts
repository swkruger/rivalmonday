import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), email: vi.fn(), set: vi.fn(), host: 'app.example', ctx: { userId: 'op' } }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/support-email', () => ({ sendSupportSessionStartedEmail: (...a: unknown[]) => m.email(...a) }));
vi.mock('@/server/support-cookie', () => ({ SUPPORT_COOKIE: 'rm_support', signSupportCookie: (id: string) => `${id}.mac` }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: m.set }), headers: async () => new Headers({ host: m.host }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
const { startSupportSessionAction } = await import('./actions');

const SID = '33333333-3333-4333-8333-333333333333';
const fd = (reason = 'Checking the brief setup') => {
  const f = new FormData();
  f.set('agencyId', 'ag-1');
  f.set('reason', reason);
  return f;
};

beforeEach(() => {
  m.runTool.mockReset();
  m.email.mockReset();
  m.set.mockReset();
  m.host = 'app.example';
});

describe('startSupportSessionAction', () => {
  it('starts on the operator ctx, sets rm_support for the session lifetime, emails once, then opens /agency', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    m.runTool.mockResolvedValue({ ok: true, data: { sessionId: SID, expiresAt } });
    await expect(startSupportSessionAction({ ok: true }, fd())).rejects.toThrow('NEXT_REDIRECT /agency');
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'start_support_session', { agencyId: 'ag-1', reason: 'Checking the brief setup' });
    expect(m.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = m.set.mock.calls[0]!;
    expect(name).toBe('rm_support');
    expect(value).toBe(`${SID}.mac`);
    expect(opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(opts).not.toHaveProperty('domain');
    expect(opts.maxAge).toBeGreaterThan(3590);
    expect(opts.maxAge).toBeLessThanOrEqual(3600);
    expect(m.email).toHaveBeenCalledTimes(1);
    expect(m.email).toHaveBeenCalledWith(SID);
  });

  it('is not Secure on a localhost host', async () => {
    m.host = 'localhost:3000';
    m.runTool.mockResolvedValue({ ok: true, data: { sessionId: SID, expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    await expect(startSupportSessionAction({ ok: true }, fd())).rejects.toThrow('NEXT_REDIRECT');
    expect(m.set.mock.calls[0]![2]).toMatchObject({ secure: false });
  });

  it('returns a refusal as a form message, with no cookie and no email', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'Reason must be 5 to 300 characters' });
    expect(await startSupportSessionAction({ ok: true }, fd('abc'))).toEqual({ ok: false, error: 'Reason must be 5 to 300 characters' });
    expect(m.set).not.toHaveBeenCalled();
    expect(m.email).not.toHaveBeenCalled();
  });
});
