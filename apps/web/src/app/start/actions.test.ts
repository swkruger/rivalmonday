import { ToolError } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  lookup: vi.fn(), submit: vi.fn(), send: vi.fn(), turnstile: vi.fn(), after: [] as (() => unknown)[],
  headerIp: '203.0.113.9, 10.0.0.1', turnstileCfg: {} as { siteKey?: string; secretKey?: string },
}));
vi.mock('@cs/tools', async (orig) => ({
  ...(await orig<typeof import('@cs/tools')>()),
  intakeLookup: (...a: unknown[]) => m.lookup(...a),
  submitIntake: (...a: unknown[]) => m.submit(...a),
  sendLeadEmail: (...a: unknown[]) => m.send(...a),
}));
vi.mock('@cs/db', async (orig) => ({ ...(await orig<typeof import('@cs/db')>()), createLedgerSink: () => ({}) }));
vi.mock('@/server/tools', () => ({ toolDeps: () => ({ service: 'svc', platformAdmins: ['op@x.co'] }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'dev', processGuardOn: () => false }));
vi.mock('@/server/email-transport', () => ({ webEmailTransport: () => 'transport' }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: 's'.repeat(40), appUrl: 'https://app.test', emailFrom: 'briefs@app.test', turnstile: m.turnstileCfg }) }));
vi.mock('@/server/turnstile', () => ({ verifyTurnstile: (...a: unknown[]) => m.turnstile(...a) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': m.headerIp }) }));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { m.after.push(fn); } }));
const { lookupBusinessAction, submitIntakeAction } = await import('./actions');

const place = { placeId: 'p1', cid: null, title: 'Smith Dental', address: '1 Main St', city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 1, lng: 2 };
const form = (o: Record<string, string | null> = {}) => {
  const f = new FormData();
  const all: Record<string, string | null> = { slug: 'smith-co', lookup: JSON.stringify(place), contactName: 'Sam', email: 'sam@smith.co', phone: '', message: '', ref: '', consent: 'on', ...o };
  for (const [k, v] of Object.entries(all)) if (v !== null) f.set(k, v);
  return f;
};
const idle = { error: null, done: false };
const DONE = { error: null, done: true };
const flushAfter = async () => { for (const fn of m.after.splice(0)) await fn(); };

beforeEach(() => {
  for (const f of [m.lookup, m.submit, m.send, m.turnstile]) f.mockReset();
  m.after.length = 0;
  m.turnstile.mockResolvedValue(true);
  m.submit.mockResolvedValue({ send: { leadId: 'L1', verifyRaw: 'RAWTOKEN' } });
  m.send.mockResolvedValue(undefined);
  m.lookup.mockResolvedValue({ places: [place] });
  m.turnstileCfg = {};
});

describe('lookupBusinessAction', () => {
  it('hashes the first forwarded hop and returns the places', async () => {
    expect(await lookupBusinessAction({ slug: 'smith-co', name: 'Smith', location: 'Austin, TX' })).toEqual({ ok: true, places: [place] });
    const [, input] = m.lookup.mock.calls[0]! as [unknown, { slug: string; ipHash: string; name: string }];
    expect(input).toMatchObject({ slug: 'smith-co', name: 'Smith', location: 'Austin, TX' });
    expect(input.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(input.ipHash).not.toContain('203.0.113.9');
  });

  it('null slug = the platform page; a malformed slug is refused without a lookup', async () => {
    await lookupBusinessAction({ slug: null, name: 'Smith', location: 'Austin' });
    expect((m.lookup.mock.calls[0]![1] as { slug: unknown }).slug).toBeNull();
    m.lookup.mockClear();
    expect(await lookupBusinessAction({ slug: '../Evil', name: 'Smith', location: 'Austin' })).toEqual({ ok: false, error: 'This page is no longer available.' });
    expect(m.lookup).not.toHaveBeenCalled();
  });

  it('maps refusals and tool errors to calm messages', async () => {
    m.lookup.mockResolvedValueOnce({ refused: 'rate' });
    expect(await lookupBusinessAction({ slug: null, name: 'a', location: 'b' })).toEqual({ ok: false, error: 'Too many searches. Please try again in an hour.' });
    m.lookup.mockRejectedValueOnce(new ToolError('invalid_input', 'Enter a business name and a city or ZIP code.', { userFacing: true }));
    expect(await lookupBusinessAction({ slug: null, name: '', location: '' })).toEqual({ ok: false, error: 'Enter a business name and a city or ZIP code.' });
    m.lookup.mockRejectedValueOnce(new ToolError('not_found', 'Not found'));
    expect(await lookupBusinessAction({ slug: 'gone', name: 'a', location: 'bb' })).toEqual({ ok: false, error: 'This page is no longer available.' });
    m.lookup.mockRejectedValueOnce(new ToolError('internal', 'vendor down', { userFacing: true }));
    expect(await lookupBusinessAction({ slug: null, name: 'a', location: 'bb' })).toEqual({ ok: false, error: "Business search isn't available right now. Try again later." });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.lookup.mockRejectedValueOnce(new Error('db down'));
    expect(await lookupBusinessAction({ slug: null, name: 'a', location: 'bb' })).toEqual({ ok: false, error: "Business search isn't available right now. Try again later." });
    err.mockRestore();
  });
});

describe('submitIntakeAction', () => {
  it('accepted: submits with the hashed IP, sends lead_verify after the response, same done state, ≥ 400 ms', async () => {
    const t0 = Date.now();
    expect(await submitIntakeAction(idle, form({ phone: '512 555 0100', message: 'More calls', ref: 'spring-ad' }))).toEqual(DONE);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(395);
    expect(m.turnstile.mock.calls[0]![1]).toBe('203.0.113.9');
    const [deps, input] = m.submit.mock.calls[0]! as [{ service: string }, Record<string, unknown>];
    expect(deps.service).toBe('svc');
    expect(input).toMatchObject({ slug: 'smith-co', lookup: place, contactName: 'Sam', email: 'sam@smith.co', phone: '512 555 0100', message: 'More calls', ref: 'spring-ad' });
    expect(input.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.send).not.toHaveBeenCalled(); // runs in after()
    await flushAfter();
    expect(m.send).toHaveBeenCalledTimes(1);
    const [emailDeps, leadId, kind, extra] = m.send.mock.calls[0]!;
    expect(emailDeps).toMatchObject({ service: 'svc', transport: 'transport', appUrl: 'https://app.test', fromAddress: 'briefs@app.test' });
    expect([leadId, kind, extra]).toEqual(['L1', 'verify', { verifyRaw: 'RAWTOKEN' }]);
  });

  it('refused (send: null): identical result and floor, no email', async () => {
    m.submit.mockResolvedValue({ send: null });
    const t0 = Date.now();
    expect(await submitIntakeAction(idle, form())).toEqual(DONE);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(395);
    await flushAfter();
    expect(m.send).not.toHaveBeenCalled();
  });

  it('a failing submit or send still ends in the same done state, and logs neither the email nor the token', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.submit.mockRejectedValueOnce(new Error('db down sam@smith.co'));
    expect(await submitIntakeAction(idle, form())).toEqual(DONE);
    m.send.mockRejectedValueOnce(new Error('postmark down'));
    expect(await submitIntakeAction(idle, form())).toEqual(DONE);
    await flushAfter();
    const logged = [...err.mock.calls, ...warn.mock.calls].flat().map(String).join(' ');
    expect(logged).not.toMatch(/sam@smith\.co|RAWTOKEN|203\.0\.113\.9/);
    err.mockRestore();
    warn.mockRestore();
  });

  it('a Turnstile failure re-renders with the message and submits nothing', async () => {
    m.turnstile.mockResolvedValue(false);
    expect(await submitIntakeAction(idle, form())).toEqual({ error: 'Please complete the check and try again.', done: false });
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("uses the 'no-widget' token without a real Turnstile setup, and the widget's token when posted", async () => {
    await submitIntakeAction(idle, form());
    expect(m.turnstile.mock.calls[0]![0]).toBe('no-widget');
    m.turnstileCfg = { siteKey: 'site', secretKey: 'secret' };
    await submitIntakeAction(idle, form());
    expect(m.turnstile.mock.calls[1]![0]).toBe(''); // real check: a missing widget token fails
    await submitIntakeAction(idle, form({ 'cf-turnstile-response': 'tok' }));
    expect(m.turnstile.mock.calls[2]![0]).toBe('tok');
    expect(m.turnstile.mock.calls[2]![2]).toEqual({ envName: 'dev', turnstileSecretKey: 'secret' });
  });

  it('field problems re-render before the check (no business, no name, bad email, no consent)', async () => {
    expect((await submitIntakeAction(idle, form({ lookup: null }))).error).toBe('Choose your business first.');
    expect((await submitIntakeAction(idle, form({ lookup: '{not json' }))).error).toBe('Choose your business first.');
    expect((await submitIntakeAction(idle, form({ contactName: ' ' }))).error).toBe('Enter your name.');
    expect((await submitIntakeAction(idle, form({ email: 'nope' }))).error).toBe('Enter a valid email address.');
    expect((await submitIntakeAction(idle, form({ consent: null }))).error).toBe('Please agree to be contacted about your request.');
    expect(m.turnstile).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
  });

  it('an empty slug is the platform page; a malformed ref is dropped, not refused', async () => {
    await submitIntakeAction(idle, form({ slug: '', ref: 'bad ref!<script>' }));
    const input = m.submit.mock.calls[0]![1] as { slug: unknown; ref?: unknown; phone?: unknown; message?: unknown };
    expect(input.slug).toBeNull();
    expect(input.ref).toBeUndefined();
    expect(input.phone).toBeUndefined();
    expect(input.message).toBeUndefined();
  });
});
