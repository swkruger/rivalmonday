import { signLink } from '@cs/core';
import type { EnvName } from '@cs/db';
import { describe, expect, it, vi } from 'vitest';
import { captureMagicLink, devSignIn, type SignInDeps } from './sign-in';

const SECRET = 's'.repeat(40);
const CONTACT = '11111111-1111-4111-8111-111111111111';
const token = signLink(SECRET, { sub: CONTACT, agency: CONTACT, client: CONTACT, t: 'notifications', id: CONTACT });
const briefToken = signLink(SECRET, { sub: CONTACT, agency: CONTACT, client: CONTACT, t: 'brief', id: CONTACT });
const expiredToken = signLink(SECRET, { sub: CONTACT, agency: CONTACT, client: CONTACT, t: 'notifications', id: CONTACT }, new Date(Date.now() - 400 * 24 * 3600 * 1000));

function deps(o: { env?: EnvName; contact?: { email: string; userId: string | null; active: boolean } | null; url?: string | null } = {}): SignInDeps {
  return {
    env: () => o.env ?? 'demo',
    secrets: () => [SECRET],
    findContact: vi.fn(async () => (o.contact === undefined ? { email: 'admin@demo.rivalmonday.test', userId: 'u1', active: true } : o.contact)),
    startMagicLink: vi.fn(async () => (o.url === undefined ? 'http://localhost:3000/api/auth/magic-link/verify?token=t&callbackURL=%2F' : o.url)),
  };
}
const get = () => new Request('http://localhost:3000/dev-panel/sign-in/x', { headers: { host: 'localhost:3000' } });
const where = (r: Response) => [r.status, r.headers.get('location')];

describe('devSignIn (Review Focus 3)', () => {
  it('starts a session for an active demo user through the magic-link API', async () => {
    const d = deps();
    expect(where(await devSignIn(d, get(), token))).toEqual([303, 'http://localhost:3000/api/auth/magic-link/verify?token=t&callbackURL=%2F']);
    expect(d.startMagicLink).toHaveBeenCalledWith('admin@demo.rivalmonday.test', expect.any(Request));
  });

  it('keeps the verify redirect on the origin the panel was opened on', async () => {
    const r = new Request('http://127.0.0.1:3200/dev-panel/sign-in/x', { headers: { host: '127.0.0.1:3200' } });
    expect(where(await devSignIn(deps(), r, token))).toEqual([303, 'http://127.0.0.1:3200/api/auth/magic-link/verify?token=t&callbackURL=%2F']);
  });

  it.each([
    ['DEV is live', deps({ env: 'dev' }), token],
    ['a tampered token', deps(), `${token}x`],
    ['an expired token', deps(), expiredToken],
    ['a valid token of another link type', deps(), briefToken],
    ['a non-demo contact', deps({ contact: { email: 'owner@nofingers.ai', userId: 'u', active: true } }), token],
    ['a look-alike demo domain', deps({ contact: { email: 'x@demo.rivalmonday.test.evil.example', userId: 'u', active: true } }), token],
    ['an inactive contact', deps({ contact: { email: 'admin@demo.rivalmonday.test', userId: 'u', active: false } }), token],
    ['a contact without a user', deps({ contact: { email: 'admin@demo.rivalmonday.test', userId: null, active: true } }), token],
    ['an unknown contact', deps({ contact: null }), token],
    ['no link captured', deps({ url: null }), token],
  ])('sends %s to /link-expired and never asks for a sign-in link', async (label, d, t) => {
    expect(where(await devSignIn(d, get(), t))).toEqual([303, 'http://localhost:3000/link-expired']);
    if (label !== 'no link captured') expect(d.startMagicLink).not.toHaveBeenCalled();
  });
});

describe('captureMagicLink (controller ruling 3)', () => {
  it('installs the hook only for the call, returns the link for that email, and removes it afterwards', async () => {
    const hooks: { onMagicLink?: (email: string, url: string) => void } = {};
    expect(hooks.onMagicLink).toBeUndefined();
    const url = await captureMagicLink(hooks, 'admin@demo.rivalmonday.test', async () => {
      expect(hooks.onMagicLink).toBeTypeOf('function');
      hooks.onMagicLink!('other@demo.rivalmonday.test', 'http://x/other');
      hooks.onMagicLink!('Admin@Demo.RivalMonday.test', 'http://x/mine');
    });
    expect(url).toBe('http://x/mine');
    expect(hooks.onMagicLink).toBeUndefined();
    // A link delivered after the capture ended is not kept for a later call.
    expect(await captureMagicLink(hooks, 'admin@demo.rivalmonday.test', async () => {})).toBeNull();
  });

  it('removes the hook and drops the link when the trigger throws', async () => {
    const hooks: { onMagicLink?: (email: string, url: string) => void } = {};
    await expect(
      captureMagicLink(hooks, 'admin@demo.rivalmonday.test', async () => {
        hooks.onMagicLink!('admin@demo.rivalmonday.test', 'http://x/mine');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(hooks.onMagicLink).toBeUndefined();
    expect(await captureMagicLink(hooks, 'admin@demo.rivalmonday.test', async () => {})).toBeNull();
  });

  it('keeps the hook while another capture is still running', async () => {
    const hooks: { onMagicLink?: (email: string, url: string) => void } = {};
    let finishA!: () => void;
    const a = captureMagicLink(hooks, 'a@demo.rivalmonday.test', () => new Promise<void>((r) => { finishA = () => { hooks.onMagicLink!('a@demo.rivalmonday.test', 'http://x/a'); r(); }; }));
    const b = await captureMagicLink(hooks, 'b@demo.rivalmonday.test', async () => hooks.onMagicLink!('b@demo.rivalmonday.test', 'http://x/b'));
    expect(b).toBe('http://x/b');
    expect(hooks.onMagicLink).toBeTypeOf('function');
    finishA();
    expect(await a).toBe('http://x/a');
    expect(hooks.onMagicLink).toBeUndefined();
  });
});
