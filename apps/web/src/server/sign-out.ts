import 'server-only';
import { GUEST_COOKIE } from './guest';
import { MEMBERSHIP_COOKIE } from './viewer';

export type CookieWriter = { set: (name: string, value: string, options: Record<string, unknown>) => unknown };

/**
 * Important I1 (final review): sign-out must end a lingering guest (email-link) session, not just the Better Auth
 * one — otherwise a client who later signs in and then signs out on a shared computer falls back to the read-only
 * guest session for up to 24h. Deletes both cookies with the same name/path/flags they were set with (`rm_guest` in
 * `app/l/[token]/route.ts`, `rm_membership` there and in `app/(app)/actions.ts#switchMembership`), so the browser
 * actually drops them rather than keeping a stale value under a non-matching path.
 */
export function clearSessionCookies(jar: CookieWriter): void {
  const opts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 };
  jar.set(GUEST_COOKIE, '', opts);
  jar.set(MEMBERSHIP_COOKIE, '', opts);
}
