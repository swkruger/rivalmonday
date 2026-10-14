import { describe, expect, it } from 'vitest';
import { generateInviteToken, hashInviteToken } from './tokens';

describe('invite tokens', () => {
  it('has the rm_inv_ + base64url(32 bytes) format and a 12-char prefix', () => {
    const t = generateInviteToken();
    expect(t.token).toMatch(/^rm_inv_[A-Za-z0-9_-]{43}$/);
    expect(t.prefix).toBe(t.token.slice(0, 12));
    expect(t.prefix).toHaveLength(12);
  });
  it('hashes stably to SHA-256 hex and matches hashInviteToken', () => {
    const t = generateInviteToken(() => new Uint8Array(32).fill(7));
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(t.token)).toBe(t.hash);
    expect(generateInviteToken(() => new Uint8Array(32).fill(7)).hash).toBe(t.hash);
  });
  it('generates distinct tokens', () => {
    expect(generateInviteToken().token).not.toBe(generateInviteToken().token);
  });
});
