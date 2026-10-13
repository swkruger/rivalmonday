import 'server-only';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { webEnv } from './env';

/** Spec "Session resolution": `<sessionId>.<hmac>`, httpOnly, sameSite=lax, path=/. */
export const SUPPORT_COOKIE = 'rm_support';

// The optional `secret` parameter exists for tests; production callers pass one argument and get the Better Auth secret.
// An empty secret would make every MAC forgeable, so it throws instead of signing or verifying.
function secretOf(secret: string | undefined): string {
  const s = secret ?? webEnv().authSecret;
  if (!s) throw new Error('Support cookie secret is missing');
  return s;
}
const key = (secret: string) => Buffer.from(hkdfSync('sha256', secret, '', 'rm-support-session', 32));
const mac = (id: string, secret: string) => createHmac('sha256', key(secret)).update(id).digest('base64url');

export function signSupportCookie(sessionId: string, secret?: string): string {
  return `${sessionId}.${mac(sessionId, secretOf(secret))}`;
}

export function verifySupportCookie(value: string | undefined, secret?: string): string | null {
  const s = secretOf(secret);
  if (!value) return null;
  const i = value.lastIndexOf('.');
  if (i <= 0) return null;
  const id = value.slice(0, i), given = Buffer.from(value.slice(i + 1)), want = Buffer.from(mac(id, s));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}
