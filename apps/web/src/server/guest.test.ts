import { describe, expect, it } from 'vitest';
import { signGuest, verifyGuest } from './guest';

const S = 'k'.repeat(40);
const claims = { contactId: '11111111-1111-4111-8111-111111111111', agencyId: '22222222-2222-4222-8222-222222222222', clientId: '33333333-3333-4333-8333-333333333333' };
const t0 = new Date('2026-10-05T12:00:00Z');

describe('guest cookie', () => {
  it('round-trips within 24 hours', () => {
    const v = signGuest(S, claims, t0);
    expect(verifyGuest([S], v, new Date('2026-10-06T11:59:00Z'))).toEqual({ ...claims, iat: t0.getTime() / 1000 });
  });

  it('expires after 24 hours and rejects tampering or other secrets', () => {
    const v = signGuest(S, claims, t0);
    expect(verifyGuest([S], v, new Date('2026-10-06T12:00:01Z'))).toBeNull();
    expect(verifyGuest(['x'.repeat(40)], v, t0)).toBeNull();
    const [p, sig] = v.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), clientId: claims.agencyId })).toString('base64url');
    expect(verifyGuest([S], `${forged}.${sig}`, t0)).toBeNull();
  });

  it('is not interchangeable with a link token signed by the same secret', async () => {
    const { signLink } = await import('@cs/core');
    const token = signLink(S, { sub: claims.contactId, agency: claims.agencyId, client: claims.clientId, t: 'brief', id: claims.clientId }, t0);
    expect(verifyGuest([S], token, t0)).toBeNull();
  });
});
