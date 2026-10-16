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

  it('still redirects other cookie-less paths to sign-in', () => {
    for (const p of ['/api/askx', '/c/x/ask', '/api/other']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });

  it('replaces a client-sent x-rm-path with the real path', () => {
    for (const p of ['/agency', '/sign-in']) {
      const res = run(p, { headers: { 'x-rm-path': '/platform/agencies/x', cookie: 'better-auth.session_token=t' } });
      expect(res.headers.get('x-middleware-request-x-rm-path'), p).toBe(p);
    }
  });
});
