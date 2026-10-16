import { isUuid } from '@cs/core';
import { createHmac, timingSafeEqual } from 'node:crypto';

const ID_BYTES = 16;
const MAC_BYTES = 16;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const mac = (agencyId: string, secret: string): Buffer => createHmac('sha256', secret).update(`unsub:${agencyId}`).digest().subarray(0, MAC_BYTES);

const uuidBytes = (id: string): Buffer => Buffer.from(id.replace(/-/g, ''), 'hex');
const uuidString = (b: Buffer): string => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/**
 * Phase 10 (R21): the setup-tip unsubscribe token = base64url(agencyId bytes ‖ first 16 bytes of
 * HMAC-SHA256(secret, 'unsub:' + agencyId)). No expiry (one-click links must keep working). The worker builds it for
 * `List-Unsubscribe`, the web verifies it at `/u/<token>`; the secret is `BETTER_AUTH_SECRET` in both. Never log a token.
 */
export function unsubscribeToken(agencyId: string, secret: string): string {
  if (!secret) throw new Error('unsubscribe secret is required');
  if (!isUuid(agencyId)) throw new Error('agencyId must be a uuid');
  const id = agencyId.toLowerCase();
  return Buffer.concat([uuidBytes(id), mac(id, secret)]).toString('base64url');
}

/** The agency id the token was issued for, or null (malformed, tampered, other secret). Constant-time MAC compare. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  if (!secret || typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const raw = Buffer.from(token, 'base64url');
  // Canonical encoding only: the last character carries 2 spare bits, so several strings decode to the same bytes.
  if (raw.length !== ID_BYTES + MAC_BYTES || raw.toString('base64url') !== token) return null;
  const agencyId = uuidString(raw.subarray(0, ID_BYTES));
  const expected = mac(agencyId, secret);
  return timingSafeEqual(raw.subarray(ID_BYTES), expected) ? agencyId : null;
}
