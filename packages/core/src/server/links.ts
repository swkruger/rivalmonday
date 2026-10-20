import { createHmac, timingSafeEqual } from 'node:crypto';
import { LINK_TARGETS, LINK_TTL_SECONDS, MIN_LINK_SECRET_LENGTH, type LinkClaims } from '../links';

const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest();

export function signLink(secret: string, claims: Pick<LinkClaims, 'sub' | 'agency' | 'client' | 't' | 'id'>, now = new Date(), ttlSeconds = LINK_TTL_SECONDS): string {
  if (secret.length < MIN_LINK_SECRET_LENGTH) throw new Error(`Link signing secret must be at least ${MIN_LINK_SECRET_LENGTH} characters`);
  const iat = Math.floor(now.getTime() / 1000);
  const full: LinkClaims = { v: 1, sub: claims.sub, agency: claims.agency, client: claims.client, t: claims.t, id: claims.id, iat, exp: iat + ttlSeconds };
  const payload = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${payload}.${mac(secret, payload).toString('base64url')}`;
}

/** Tries each secret (current first, then previous ones during rotation); null for anything invalid or expired. */
export function verifyLink(secrets: readonly string[], token: string, now = new Date()): LinkClaims | null {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  const ok = secrets.some((s) => {
    if (s.length < MIN_LINK_SECRET_LENGTH) return false;
    const want = mac(s, payload);
    return want.length === given.length && timingSafeEqual(want, given);
  });
  if (!ok) return null;
  let c: LinkClaims;
  try {
    c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LinkClaims;
  } catch {
    return null;
  }
  if (c.v !== 1 || !LINK_TARGETS.includes(c.t) || typeof c.iat !== 'number' || typeof c.exp !== 'number' || c.exp * 1000 <= now.getTime()) return null;
  return c;
}
