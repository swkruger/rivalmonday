import 'server-only';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { webEnv } from './env';

// The optional `secret` parameter exists for tests; production callers use the Better Auth secret.
const key = (secret: string) => Buffer.from(hkdfSync('sha256', secret, '', 'rm-support-session', 32));
const mac = (id: string, secret: string) => createHmac('sha256', key(secret)).update(id).digest('base64url');

export function signSupportCookie(sessionId: string, secret: string = webEnv().authSecret): string {
  return `${sessionId}.${mac(sessionId, secret)}`;
}

export function verifySupportCookie(value: string | undefined, secret?: string): string | null {
  if (!value) return null;
  const i = value.lastIndexOf('.');
  if (i <= 0) return null;
  const s = secret ?? webEnv().authSecret;
  const id = value.slice(0, i), given = Buffer.from(value.slice(i + 1)), want = Buffer.from(mac(id, s));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}
