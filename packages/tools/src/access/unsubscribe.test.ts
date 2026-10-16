import { describe, expect, it } from 'vitest';
import { unsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

const AGENCY = '0b0e3c8e-4a1f-4c3e-9d7a-2f6b8c1d5e90';
const SECRET = 'a-test-secret-that-is-long-enough-for-hmac-0001';

describe('unsubscribe tokens (Phase 10 R21)', () => {
  it('round-trips the agency id; base64url, 32 bytes, deterministic', () => {
    const t = unsubscribeToken(AGENCY, SECRET);
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(unsubscribeToken(AGENCY, SECRET)).toBe(t);
    expect(verifyUnsubscribeToken(t, SECRET)).toBe(AGENCY);
  });

  it('accepts an upper-case agency id as the same agency', () => {
    expect(verifyUnsubscribeToken(unsubscribeToken(AGENCY.toUpperCase(), SECRET), SECRET)).toBe(AGENCY);
  });

  it('a tampered token, another secret or another agency\'s MAC is refused', () => {
    const t = unsubscribeToken(AGENCY, SECRET);
    const raw = Buffer.from(t, 'base64url');
    for (const i of [0, 15, 16, 31]) {
      const bad = Buffer.from(raw);
      bad[i] = bad[i]! ^ 0x01;
      expect(verifyUnsubscribeToken(bad.toString('base64url'), SECRET)).toBeNull();
    }
    expect(verifyUnsubscribeToken(t, `${SECRET}x`)).toBeNull();
    const other = Buffer.from(unsubscribeToken('11111111-2222-4333-8444-555555555555', SECRET), 'base64url');
    const spliced = Buffer.concat([raw.subarray(0, 16), other.subarray(16)]).toString('base64url');
    expect(verifyUnsubscribeToken(spliced, SECRET)).toBeNull();
  });

  it.each(['', 'abc', 'not base64!!', `${'A'.repeat(43)}A`, 'A'.repeat(42), `${'A'.repeat(42)}=`])('malformed %j → null', (bad) => {
    expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull();
  });

  it('refuses a non-canonical encoding of a valid token (spare bits in the last character)', () => {
    const t = unsubscribeToken(AGENCY, SECRET);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = alphabet.indexOf(t.at(-1)!);
    const variant = `${t.slice(0, -1)}${alphabet[last ^ 0x01]}`;
    expect(Buffer.from(variant, 'base64url').equals(Buffer.from(t, 'base64url'))).toBe(true);
    expect(verifyUnsubscribeToken(variant, SECRET)).toBeNull();
  });

  it('an empty secret never signs or verifies', () => {
    expect(() => unsubscribeToken(AGENCY, '')).toThrow();
    expect(verifyUnsubscribeToken(unsubscribeToken(AGENCY, SECRET), '')).toBeNull();
  });

  it('refuses a non-uuid agency id', () => {
    expect(() => unsubscribeToken('not-a-uuid', SECRET)).toThrow();
  });
});
