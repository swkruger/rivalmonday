import { describe, expect, it } from 'vitest';
import { LINK_TTL_SECONDS, signLink, verifyLink } from './links';

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
});
