import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUuid } from '@cs/core';

export const SIGNUP_COOKIE = 'rm_signup';
export const SIGNUP_TTL_SECONDS = 30 * 60;
const DOMAIN = 'rm-signup.v1';
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(`${DOMAIN}.${payload}`).digest();

/**
 * Phase 10: HMAC-signed pending sign-up id set before the Google redirect. Informational only (`/onboarding` shows the
 * agency name while loading); the right to create the agency always comes from the verified email.
 */
export function signSignupCookie(secret: string, pendingId: string, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ id: pendingId, iat: Math.floor(now.getTime() / 1000) })).toString('base64url');
  return `${payload}.${mac(secret, payload).toString('base64url')}`;
}

export function verifySignupCookie(secret: string, value: string, now = new Date()): string | null {
  const [payload, sig, extra] = value.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  const want = mac(secret, payload);
  if (want.length !== given.length || !timingSafeEqual(want, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { id?: unknown; iat?: unknown };
    if (typeof c.id !== 'string' || !isUuid(c.id) || typeof c.iat !== 'number') return null;
    return (c.iat + SIGNUP_TTL_SECONDS) * 1000 > now.getTime() ? c.id : null;
  } catch {
    return null;
  }
}
