import { describe, expect, it } from 'vitest';
import { SAMPLE_LINK_TTL_MS, signSampleToken, verifySampleToken } from './sample-token';

const ID = '3f2c1a9e-8b7d-4c6e-9a1f-0123456789ab';
const SECRET = 'test-auth-secret-0123456789abcdef';
const now = new Date(Date.UTC(2026, 9, 28, 12));
const exp = now.getTime() + SAMPLE_LINK_TTL_MS;

describe('sample token', () => {
  it('round trip', () => {
    const t = signSampleToken(ID, exp, SECRET);
    expect(t.startsWith(`${ID}.${exp.toString(36)}.`)).toBe(true);
    expect(verifySampleToken(t, SECRET, now)).toEqual({ entryId: ID, expMs: exp });
    expect(SAMPLE_LINK_TTL_MS).toBe(30 * 86_400_000);
  });

  it('token: tampered mac / entry id / expiry → null', () => {
    const t = signSampleToken(ID, exp, SECRET);
    const [id, e, mac] = t.split('.') as [string, string, string];
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    expect(verifySampleToken(`${id}.${e}.${flip(mac, 5)}`, SECRET, now)).toBeNull();
    expect(verifySampleToken(`${id.replace(/^3/, '4')}.${e}.${mac}`, SECRET, now)).toBeNull();
    expect(verifySampleToken(`${id}.${(exp + 1000).toString(36)}.${mac}`, SECRET, now)).toBeNull();
  });

  it('token: expired → null', () => {
    const t = signSampleToken(ID, exp, SECRET);
    expect(verifySampleToken(t, SECRET, new Date(exp))).toBeNull();
    expect(verifySampleToken(t, SECRET, new Date(exp + 1))).toBeNull();
    expect(verifySampleToken(t, SECRET, new Date(exp - 1))).not.toBeNull();
  });

  it('token: other secret → null', () => {
    const t = signSampleToken(ID, exp, SECRET);
    expect(verifySampleToken(t, 'another-secret-0123456789abcdef', now)).toBeNull();
    expect(verifySampleToken(t, '', now)).toBeNull();
  });

  it('token: overlong or malformed → null', () => {
    const t = signSampleToken(ID, exp, SECRET);
    expect(verifySampleToken(`${t}${'a'.repeat(120)}`, SECRET, now)).toBeNull();
    expect(verifySampleToken('', SECRET, now)).toBeNull();
    expect(verifySampleToken('not-a-token', SECRET, now)).toBeNull();
    expect(verifySampleToken(t.toUpperCase(), SECRET, now)).toBeNull();
    expect(verifySampleToken(`${t}.x`, SECRET, now)).toBeNull();
    expect(verifySampleToken(t.slice(0, -1), SECRET, now)).toBeNull();
    expect(verifySampleToken(`${ID}.${'z'.repeat(13)}.${t.split('.')[2]}`, SECRET, now)).toBeNull();
  });
});
