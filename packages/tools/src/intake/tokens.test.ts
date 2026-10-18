import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashToken, newToken } from './tokens';

describe('tokens', () => {
  it('token hash is stable and raw never equals hash', () => {
    const { raw, hash } = newToken();
    expect(hashToken(raw)).toBe(hash);
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(raw).not.toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('raw is 32 random bytes as base64url, unique per call', () => {
    const a = newToken();
    const b = newToken();
    expect(a.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a.raw, 'base64url')).toHaveLength(32);
    expect(a.raw).not.toBe(b.raw);
  });
});
