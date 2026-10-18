import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { appLinkFor, appPath, LINK_TTL_SECONDS, signLink, verifyLink } from './links';

const SECRET = 'a'.repeat(32);
const OLD = 'b'.repeat(32);
const NOW = new Date('2026-10-05T12:00:00Z');
const claims = {
  sub: '00000000-0000-4000-8000-0000000000c1', agency: '00000000-0000-4000-8000-00000000000a', client: '00000000-0000-4000-8000-0000000000a1',
  t: 'brief' as const, id: '00000000-0000-4000-8000-0000000000b9',
};

describe('deep links', () => {
  it('round-trips claims with issue and expiry times', () => {
    const token = signLink(SECRET, claims, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyLink([SECRET], token, NOW)).toEqual({ v: 1, ...claims, iat: NOW.getTime() / 1000, exp: NOW.getTime() / 1000 + LINK_TTL_SECONDS });
  });

  it('signLink/verifyLink round-trip for t=setup', () => {
    const c = { ...claims, t: 'setup' as const };
    expect(verifyLink([SECRET], signLink(SECRET, c, NOW), NOW)).toMatchObject({ t: 'setup', client: claims.client });
  });

  it('refuses a tampered payload or signature, and garbage', () => {
    const token = signLink(SECRET, claims, NOW);
    const [p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), client: '00000000-0000-4000-8000-0000000000b1' })).toString('base64url');
    expect(verifyLink([SECRET], `${forged}.${s}`, NOW)).toBeNull();
    expect(verifyLink([SECRET], `${p}.${s!.slice(0, -2)}xx`, NOW)).toBeNull();
    expect(verifyLink([SECRET], 'garbage', NOW)).toBeNull();
  });

  it('refuses an expired token and accepts the previous secret during rotation', () => {
    const token = signLink(OLD, claims, NOW, 60);
    expect(verifyLink([SECRET, OLD], token, new Date(NOW.getTime() + 59_000))).not.toBeNull();
    expect(verifyLink([SECRET, OLD], token, new Date(NOW.getTime() + 61_000))).toBeNull();
    expect(verifyLink([SECRET], token, NOW)).toBeNull();
  });

  it('refuses a short secret and an unknown target', () => {
    expect(() => signLink('short', claims, NOW)).toThrow(/at least 32/);
    const bad = signLink(SECRET, { ...claims, t: 'admin' as never }, NOW);
    expect(verifyLink([SECRET], bad, NOW)).toBeNull();
  });

  it('refuses a validly signed payload with no `iat` (T15 #4: NaN must not skip the revocation check)', () => {
    // Same HMAC-SHA256-over-the-base64url-payload scheme `signLink`/`verifyLink` use, built by hand so the
    // payload can omit `iat` — something `signLink` itself can never produce.
    const withoutIat = { v: 1, ...claims, exp: Math.floor(NOW.getTime() / 1000) + LINK_TTL_SECONDS };
    const payload = Buffer.from(JSON.stringify(withoutIat)).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
    expect(verifyLink([SECRET], `${payload}.${sig}`, NOW)).toBeNull();
  });
});

describe('app paths', () => {
  const c = 'c1';
  it('appPath per target', () => {
    expect(appPath({ t: 'brief', id: 'b1' })).toBe('/go/brief/b1');
    expect(appPath({ t: 'brief_item', id: 'i1' })).toBe('/go/brief_item/i1');
    expect(appPath({ t: 'alert', id: 'a1' })).toBe('/go/alert/a1');
    expect(appPath({ t: 'event', clientId: c, id: 'e1' })).toBe('/c/c1/changes?event=e1');
    expect(appPath({ t: 'evidence', clientId: c, id: 'v1' })).toBe('/c/c1/evidence/v1');
    expect(appPath({ t: 'recommendation', clientId: c, id: 'r1' })).toBe('/c/c1/recommendations');
    expect(appPath({ t: 'review', clientId: c, id: 'rv' })).toBe('/c/c1/reviews');
    expect(appPath({ t: 'move', clientId: c, id: 'm1' })).toBe('/c/c1/moves?move=m1');
    expect(appPath({ t: 'competitor', clientId: c, id: 'x1' })).toBe('/c/c1/competitors/x1');
    expect(appPath({ t: 'page', clientId: c, competitorId: 'x2' })).toBe('/c/c1/competitors/x2');
    expect(appPath({ t: 'client', clientId: c })).toBe('/c/c1');
    expect(appPath({ t: 'kb', id: 'k1' })).toBe('/kb/k1');
  });
  it('appLinkFor prefixes the base when given', () => {
    expect(appLinkFor('https://rm.test', { t: 'brief', id: 'b1' })).toBe('https://rm.test/go/brief/b1');
    expect(appLinkFor(undefined, { t: 'client', clientId: 'c1' })).toBe('/c/c1');
  });
});
