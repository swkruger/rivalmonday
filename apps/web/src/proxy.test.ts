import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

const run = (p: string, init?: ConstructorParameters<typeof NextRequest>[1]) => proxy(new NextRequest(`https://app.example${p}`, init));

describe('proxy', () => {
  it('lets /api/ask/* through without cookies (the route answers 404 itself)', () => {
    const res = run('/api/ask/turn', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets both Stripe webhooks through without cookies (they authenticate by signature)', () => {
    for (const p of ['/api/stripe/webhook', '/api/stripe/connect-webhook']) {
      const res = run(p, { method: 'POST' });
      expect(res.status, p).toBe(200);
      expect(res.headers.get('location'), p).toBeNull();
    }
    expect(run('/api/stripe/connect-webhook/x').headers.get('location')).toContain('/sign-in');
  });

  it('lets the Phase 10 public pages through without cookies, but not /onboarding', () => {
    for (const p of ['/sign-up', '/sign-up/problem', '/join/rm_inv_abc', '/u/token', '/files/logo/abc']) {
      expect(run(p).headers.get('location'), p).toBeNull();
    }
    for (const p of ['/onboarding', '/onboarding/start', '/signup', '/joinx']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });

  it('lets the public onboarding images through without cookies (the next/image optimizer fetches them cookie-less)', () => {
    for (const p of ['/onboarding/client-done.webp', '/onboarding/signup.webp']) expect(run(p).headers.get('location'), p).toBeNull();
    for (const p of ['/onboarding/start', '/onboarding/x.webp/y', '/onboarding/sub/x.webp']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });

  it('lets the Phase 11c public intake pages through without cookies', () => {
    for (const p of ['/start', '/start/smith-co', '/start/verify/tok', '/start/verify', '/start/v/11111111-1111-4111-8111-111111111111']) {
      expect(run(p).headers.get('location'), p).toBeNull();
    }
    for (const p of ['/startx', '/starter']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });

  it('lets the Phase 17a waitlist and sample paths through without cookies, with no referrer on token URLs', () => {
    for (const p of ['/api/waitlist', '/api/site-status', '/waitlist/confirm/tok', '/waitlist/confirmed', '/sample/abc']) {
      expect(run(p).headers.get('location'), p).toBeNull();
    }
    for (const p of ['/waitlist/confirm/tok', '/sample/abc']) expect(run(p).headers.get('referrer-policy'), p).toBe('no-referrer');
    expect(run('/waitlist/confirmed').headers.get('referrer-policy')).toBeNull();
    for (const p of ['/api/waitlist/x', '/waitlist', '/samples/a']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });

  it('sends no referrer from the token-bearing intake URLs (preview and verify link)', () => {
    for (const p of ['/start/v/11111111-1111-4111-8111-111111111111', '/start/verify/tok']) expect(run(p).headers.get('referrer-policy'), p).toBe('no-referrer');
    for (const p of ['/start', '/start/smith-co', '/sign-in']) expect(run(p).headers.get('referrer-policy'), p).toBeNull();
  });

  it('still redirects other cookie-less paths to sign-in', () => {
    for (const p of ['/api/askx', '/c/x/ask', '/api/other']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });

  it('replaces a client-sent x-rm-path with the real path', () => {
    for (const p of ['/agency', '/sign-in']) {
      const res = run(p, { headers: { 'x-rm-path': '/platform/agencies/x', cookie: 'better-auth.session_token=t' } });
      expect(res.headers.get('x-middleware-request-x-rm-path'), p).toBe(p);
    }
  });

  it('lets /bot and /robots.txt through without cookies, but nothing that merely starts like them', () => {
    for (const p of ['/bot', '/robots.txt']) expect(run(p).headers.get('location'), p).toBeNull();
    for (const p of ['/bots', '/botx', '/bot-admin', '/bot/x', '/robots.txt/x']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });
});
