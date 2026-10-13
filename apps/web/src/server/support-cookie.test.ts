import { describe, expect, it } from 'vitest';
import { signSupportCookie, verifySupportCookie } from './support-cookie';

const S = 'a'.repeat(40);
const ID = '11111111-2222-4333-8444-555555555555';

describe('support cookie', () => {
  it('round-trips', () => expect(verifySupportCookie(signSupportCookie(ID, S), S)).toBe(ID));
  it('rejects a tampered mac', () => {
    const v = signSupportCookie(ID, S);
    expect(verifySupportCookie(v.slice(0, -1) + (v.endsWith('A') ? 'B' : 'A'), S)).toBeNull();
  });
  it('rejects a tampered id', () => {
    const v = signSupportCookie(ID, S);
    expect(verifySupportCookie(`11111111-2222-4333-8444-555555555556${v.slice(36)}`, S)).toBeNull();
  });
  it('rejects a missing dot', () => expect(verifySupportCookie(ID, S)).toBeNull());
  it('rejects a non-uuid id even with a valid mac', () => expect(verifySupportCookie(signSupportCookie('not-a-uuid', S), S)).toBeNull());
  it('rejects undefined and empty', () => {
    expect(verifySupportCookie(undefined, S)).toBeNull();
    expect(verifySupportCookie('', S)).toBeNull();
  });
  it('rejects a different secret', () => expect(verifySupportCookie(signSupportCookie(ID, S), 'b'.repeat(40))).toBeNull());
});
