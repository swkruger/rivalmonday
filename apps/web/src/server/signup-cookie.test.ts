import { describe, expect, it } from 'vitest';
import { SIGNUP_TTL_SECONDS, signSignupCookie, verifySignupCookie } from './signup-cookie';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-15T12:00:00Z');

describe('rm_signup cookie', () => {
  it('round-trips the pending id', () => {
    expect(verifySignupCookie('s'.repeat(40), signSignupCookie('s'.repeat(40), ID, NOW), NOW)).toBe(ID);
  });
  it('rejects a wrong secret, a tampered payload and garbage', () => {
    const v = signSignupCookie('s'.repeat(40), ID, NOW);
    expect(verifySignupCookie('t'.repeat(40), v, NOW)).toBeNull();
    const [p, sig] = v.split('.');
    const forged = `${Buffer.from(JSON.stringify({ id: '22222222-2222-4222-8222-222222222222', iat: Math.floor(NOW.getTime() / 1000) })).toString('base64url')}.${sig}`;
    expect(p).not.toBe(forged.split('.')[0]);
    expect(verifySignupCookie('s'.repeat(40), forged, NOW)).toBeNull();
    expect(verifySignupCookie('s'.repeat(40), 'nope', NOW)).toBeNull();
  });
  it('expires after 30 minutes', () => {
    const v = signSignupCookie('s'.repeat(40), ID, NOW);
    expect(SIGNUP_TTL_SECONDS).toBe(1800);
    expect(verifySignupCookie('s'.repeat(40), v, new Date(NOW.getTime() + 1_799_000))).toBe(ID);
    expect(verifySignupCookie('s'.repeat(40), v, new Date(NOW.getTime() + 1_800_000))).toBeNull();
  });
  it('is not interchangeable with a guest cookie signature (domain separated)', () => {
    expect(verifySignupCookie('s'.repeat(40), 'e30.AAAA', NOW)).toBeNull();
  });
});
