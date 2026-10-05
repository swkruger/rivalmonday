import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUuid } from '@cs/core';
import type { GuestSessionClaims } from '@cs/tools';

export const GUEST_COOKIE = 'rm_guest';
export const GUEST_TTL_SECONDS = 86_400;
const DOMAIN = 'rm-guest-session.v1';
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(`${DOMAIN}.${payload}`).digest();

/** Decision 6: an HMAC-signed, domain-separated cookie value; never interchangeable with a /l/ link token. */
export function signGuest(secret: string, claims: Omit<GuestSessionClaims, 'iat'>, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, iat: Math.floor(now.getTime() / 1000) })).toString('base64url');
  return `${payload}.${mac(secret, payload).toString('base64url')}`;
}

export function verifyGuest(secrets: readonly string[], value: string, now = new Date()): GuestSessionClaims | null {
  const [payload, sig, extra] = value.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  if (
    !secrets.some((s) => {
      const want = mac(s, payload);
      return want.length === given.length && timingSafeEqual(want, given);
    })
  )
    return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GuestSessionClaims;
    if (![c.contactId, c.agencyId, c.clientId].every((x) => typeof x === 'string' && isUuid(x)) || typeof c.iat !== 'number') return null;
    if ((c.iat + GUEST_TTL_SECONDS) * 1000 <= now.getTime()) return null;
    return { contactId: c.contactId, agencyId: c.agencyId, clientId: c.clientId, iat: c.iat };
  } catch {
    return null;
  }
}
