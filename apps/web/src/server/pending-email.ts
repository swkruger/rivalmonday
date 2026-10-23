import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { emailResend, type Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/**
 * 15c-2a B5: HMAC-signed "which address is waiting for an email" cookie behind check-email's "Resend email" button.
 * The resend action reads the address from here only, never from the form or URL. No `server-only` import (tests);
 * nothing here logs the address.
 */
export const PENDING_EMAIL_COOKIE = 'rm_pending_email';
export const PENDING_EMAIL_TTL_SECONDS = 15 * 60;
export type PendingEmail = { email: string; flow: 'signin' | 'signup'; next: string };
const DOMAIN = 'rm-pending-email.v1';
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(`${DOMAIN}.${payload}`).digest();

export function signPendingEmail(secret: string, p: PendingEmail, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ e: p.email.trim().toLowerCase(), f: p.flow, n: p.next, iat: Math.floor(now.getTime() / 1000) })).toString('base64url');
  return `${payload}.${mac(secret, payload).toString('base64url')}`;
}

export function verifyPendingEmail(secret: string, value: string | undefined, now = new Date()): PendingEmail | null {
  if (!value) return null;
  const [payload, sig, extra] = value.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  const want = mac(secret, payload);
  if (want.length !== given.length || !timingSafeEqual(want, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; f?: unknown; n?: unknown; iat?: unknown };
    if (typeof c.e !== 'string' || c.e.length > 320 || (c.f !== 'signin' && c.f !== 'signup') || typeof c.n !== 'string' || typeof c.iat !== 'number') return null;
    if ((c.iat + PENDING_EMAIL_TTL_SECONDS) * 1000 <= now.getTime()) return null;
    return { email: c.e, flow: c.f, next: c.n };
  } catch {
    return null;
  }
}

/** B4: `email_resend` stores this hash, never the address. */
export const emailHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
export const RESEND_PER_HOUR = 5;

/** Counts and records in one statement pair inside a transaction; true = allowed (and recorded). */
export async function takeResendSlot(service: Db, email: string, now = new Date()): Promise<boolean> {
  return service.transaction(async (tx) => {
    const h = emailHash(email);
    // Serialises concurrent resends for one address so two requests cannot both see 4 and both insert. The prefix keeps this
    // lock key apart from other advisory locks taken on a bare `hashtext`.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('email-resend:' || ${h}))`);
    const [{ n }] = [...(await tx.execute<{ n: number }>(sql`select count(*)::int as n from email_resend where email_hash = ${h} and sent_at > ${now.toISOString()}::timestamptz - interval '1 hour'`))];
    if (n >= RESEND_PER_HOUR) return false;
    await tx.insert(emailResend).values({ emailHash: h, sentAt: now });
    return true;
  });
}

/** B5 cookie options: the same on every path that sets it (sign-in, accepted and refused sign-ups). */
export const pendingEmailCookieOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: PENDING_EMAIL_TTL_SECONDS,
});
