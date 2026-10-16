import { createHmac } from 'node:crypto';
import { hashInviteToken } from '@cs/billing';
import { agencyInviteLink, type AgencyInviteLinkRow, type Db, pendingSignup, platformSetting } from '@cs/db';
import { and, count, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { FREE_MAIL_DOMAINS } from './free-mail';
import { normalizeEmail } from './invitations';

export const SIGNUP_RATE_LIMIT = 5;
export const SIGNUPS_PAUSED_KEY = 'signups_paused';
export type SignupProblem = 'email_lock_mismatch' | 'link_used_up' | 'link_revoked' | 'link_expired';

const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1);

/** HMAC-SHA256 hex; raw IPs are never stored. */
export const hashIp = (ip: string, secret: string): string => createHmac('sha256', secret).update(ip, 'utf8').digest('hex');

/** True when this ip hash already has {@link SIGNUP_RATE_LIMIT} sign-ups in the last hour. */
export async function signupRateLimited(db: Db, ipHash: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 3_600_000);
  const [r] = await db.select({ n: count() }).from(pendingSignup).where(and(eq(pendingSignup.ipHash, ipHash), gt(pendingSignup.createdAt, since)));
  return (r?.n ?? 0) >= SIGNUP_RATE_LIMIT;
}

/** One trial per email, and per company domain (free-mail domains exempt), counting completed open sign-ups only. */
export async function trialAllowed(db: Db, email: string, _now: Date): Promise<boolean> {
  const e = normalizeEmail(email);
  const domain = domainOf(e);
  const completed = and(eq(pendingSignup.source, 'open'), isNotNull(pendingSignup.completedAt));
  const same = FREE_MAIL_DOMAINS.has(domain)
    ? sql`lower(${pendingSignup.email}) = ${e}`
    : sql`(lower(${pendingSignup.email}) = ${e} OR lower(split_part(${pendingSignup.email}, '@', 2)) = ${domain})`;
  const [r] = await db.select({ n: count() }).from(pendingSignup).where(and(completed, same));
  return (r?.n ?? 0) === 0;
}

/** Missing row = open. */
export async function signupsPaused(db: Db): Promise<boolean> {
  const [s] = await db.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, SIGNUPS_PAUSED_KEY));
  return (s?.value as { paused?: boolean } | undefined)?.paused === true;
}

/** `email` null = page-load check (skips the email lock). */
export async function checkInviteLink(
  db: Db, token: string, email: string | null, now: Date,
): Promise<{ ok: true; link: AgencyInviteLinkRow } | { ok: false; problem: SignupProblem | 'link_unknown' }> {
  const [link] = await db.select().from(agencyInviteLink).where(eq(agencyInviteLink.tokenHash, hashInviteToken(token)));
  if (!link) return { ok: false, problem: 'link_unknown' };
  if (link.revokedAt) return { ok: false, problem: 'link_revoked' };
  if (link.expiresAt <= now) return { ok: false, problem: 'link_expired' };
  if (link.uses >= link.maxUses) return { ok: false, problem: 'link_used_up' };
  if (email !== null && link.emailLock && normalizeEmail(link.emailLock) !== normalizeEmail(email)) return { ok: false, problem: 'email_lock_mismatch' };
  return { ok: true, link };
}
