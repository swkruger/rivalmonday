'use server';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { keepNext } from '@/lib/keep-next';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { PENDING_EMAIL_COOKIE, pendingEmailCookieOptions, signPendingEmail, takeResendSlot, verifyPendingEmail } from '@/server/pending-email';
import { safeNext } from '@/server/safe-next';

export type ResendState = { status: 'idle' | 'sent' | 'expired'; message: string | null };

/** Same floor as `startSignup`: a send, a refused slot and an unknown address all take at least this long. */
const MIN_MS = 400;
const SENT: ResendState = { status: 'sent', message: 'If that address can sign in, a new email is on its way.' };
const SIGNUP_CALLBACK = '/onboarding/start';
const emailCheck = z.string().trim().email().max(254);

interface MagicLinkApi {
  signInMagicLink(a: { body: { email: string; callbackURL: string; errorCallbackURL: string }; headers: Headers }): Promise<unknown>;
}

/**
 * B5: called by the sign-in form after Better Auth accepted the link request (it answers the same for any address).
 * The cookie only names the address this browser typed; it grants nothing beyond asking for another link to it.
 */
export async function rememberPendingEmail(email: string, next: string): Promise<void> {
  const parsed = emailCheck.safeParse(email);
  if (!parsed.success) return;
  (await cookies()).set(
    PENDING_EMAIL_COOKIE,
    signPendingEmail(webEnv().authSecret, { email: parsed.data, flow: 'signin', next: safeNext(typeof next === 'string' ? next : '/') }),
    pendingEmailCookieOptions(),
  );
}

/**
 * Spec §6 / B4 / B5: "Resend email" on check-email. The address comes from the signed cookie only, never the form or
 * URL. Every outcome with a valid cookie (sent, refused by the 5/hour slot, unknown address, send error) returns the
 * same result after the same floor, so the response never reveals who may sign in.
 */
export async function resendEmailAction(_prev: ResendState, _fd: FormData): Promise<ResendState> {
  const started = Date.now();
  const env = webEnv();
  const pending = verifyPendingEmail(env.authSecret, (await cookies()).get(PENDING_EMAIL_COOKIE)?.value);
  let result: ResendState = { status: 'expired', message: null };
  if (pending) {
    result = SENT;
    try {
      if (await takeResendSlot(dbs().service, pending.email)) {
        const signup = pending.flow === 'signup';
        const next = safeNext(pending.next);
        // The magic-link plugin's endpoints are not on `auth().api`'s type (see CLAUDE.md); the runtime has them.
        await (auth().api as unknown as MagicLinkApi).signInMagicLink({
          body: {
            email: pending.email,
            callbackURL: signup ? SIGNUP_CALLBACK : next,
            errorCallbackURL: signup ? '/sign-up?reason=link' : keepNext('/sign-in?reason=link', next),
          },
          headers: await headers(),
        });
      }
    } catch (e) {
      // Never log the email, link or token.
      console.error(`[resend] sign-in link step failed: ${e instanceof Error ? e.name : typeof e}`);
    }
  }
  await new Promise((r) => setTimeout(r, Math.max(0, MIN_MS - (Date.now() - started))));
  return result;
}
