import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Phase 17a: the stateless 30-day sample-brief link `<entryId>.<exp base36>.<mac>`. The MAC key is derived from the auth
 * secret with a fixed label, so the token never doubles as any other signature. Never log a token or a URL holding one.
 */
export const SAMPLE_LINK_TTL_MS = 30 * 86_400_000;
const keyOf = (secret: string) => createHmac('sha256', secret).update('rm-sample-brief-v1', 'utf8').digest();
const macOf = (body: string, secret: string) => createHmac('sha256', keyOf(secret)).update(body, 'utf8').digest();
const TOKEN_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{43})$/;
export function signSampleToken(entryId: string, expMs: number, secret: string): string {
  const body = `${entryId}.${expMs.toString(36)}`;
  return `${body}.${macOf(body, secret).toString('base64url')}`;
}
export function verifySampleToken(token: string, secret: string, now: Date): { entryId: string; expMs: number } | null {
  if (!secret || token.length > 120) return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const expMs = parseInt(m[2]!, 36);
  if (!Number.isSafeInteger(expMs) || expMs <= now.getTime()) return null;
  const want = macOf(`${m[1]}.${m[2]}`, secret);
  const got = Buffer.from(m[3]!, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want) ? { entryId: m[1]!, expMs } : null;
}
