'use server';
import { randomUUID } from 'node:crypto';
import { hashIp, startAgencySignup, startAgencySignupInput } from '@cs/tools';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import { openPendingSignup } from '@/server/pending-signup';
import { SIGNUP_COOKIE, SIGNUP_TTL_SECONDS, signSignupCookie } from '@/server/signup-cookie';
import { verifyTurnstile } from '@/server/turnstile';

export interface SignupState {
  error: string | null;
  /** Set for the Google button: the browser navigates here. */
  googleUrl: string | null;
}

/** P3: every accepted or refused sign-up takes at least this long, so timing does not reveal the outcome. */
const MIN_MS = 400;
const CALLBACK = '/onboarding/start';
const CHECK_EMAIL = '/sign-in/check-email?for=signup';
const fieldCheck = z.object({ email: z.string().trim().email().max(254), agencyName: z.string().trim().min(1).max(120) });

interface MagicLinkApi {
  signInMagicLink(a: { body: { email: string; callbackURL: string; errorCallbackURL: string }; headers: Headers }): Promise<unknown>;
}

const text = (f: FormData, k: string) => (typeof f.get(k) === 'string' ? (f.get(k) as string) : '');

/**
 * Public agency sign-up (`/sign-up`, `/join/<token>`). After the Turnstile check every outcome looks the same to the
 * caller: a redirect to check-email (or the Google URL). Whether a link was sent is decided by `startAgencySignup`.
 */
export async function startSignup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const started = Date.now();
  const env = webEnv();
  const wantsGoogle = text(formData, 'intent') === 'google';
  const email = text(formData, 'email').trim();
  const fields = fieldCheck.safeParse({ email, agencyName: text(formData, 'agencyName') });
  if (!fields.success) {
    const emailBad = fields.error.issues.some((i) => i.path[0] === 'email');
    return { error: emailBad ? 'Enter a valid work email.' : 'Enter your agency name.', googleUrl: null };
  }
  if (wantsGoogle && !env.google) return { error: 'Google sign-up is not available.', googleUrl: null };

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  // No widget is rendered in DEMO/TEST (or without a site key); the fake verifier accepts this dummy token.
  // The real check needs BOTH keys (no widget renders without a site key); otherwise the fake verifier applies.
  const realCheck = activeEnvName() === 'dev' && !!env.turnstile?.siteKey && !!env.turnstile?.secretKey;
  const token = text(formData, 'cf-turnstile-response') || (realCheck ? '' : 'no-widget');
  if (!(await verifyTurnstile(token, ip, { envName: activeEnvName(), turnstileSecretKey: env.turnstile?.siteKey ? env.turnstile.secretKey : undefined }))) {
    return { error: 'Please complete the check and try again.', googleUrl: null };
  }

  const service = dbs().service;
  const now = new Date();
  const inviteToken = text(formData, 'inviteToken') || undefined;
  const parsed = startAgencySignupInput.safeParse({
    email, agencyName: text(formData, 'agencyName'), contactName: text(formData, 'contactName') || undefined,
    inviteToken, ipHash: hashIp(ip ?? 'unknown', env.authSecret),
  });
  // Malformed input (e.g. a token that is not an invite token) is treated as a refusal, not an error.
  const sendLink = parsed.success ? (await startAgencySignup(service, parsed.data, now)).sendLink : false;

  let googleUrl: string | null = null;
  try {
    if (wantsGoogle) {
      // R18: the cookie is ALWAYS set, same name/options/shape; a refused sign-up signs a random id that matches no row.
      const pending = sendLink ? await openPendingSignup(service, email, now) : null;
      (await cookies()).set(SIGNUP_COOKIE, signSignupCookie(env.authSecret, pending?.id ?? randomUUID(), now), {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SIGNUP_TTL_SECONDS,
      });
      // Refused sign-ups get the same URL; the sign-in right check refuses them later (/no-access, as today).
      const r = await auth().api.signInSocial({ body: { provider: 'google', callbackURL: CALLBACK, errorCallbackURL: '/sign-up?reason=google', disableRedirect: true }, headers: hdrs });
      googleUrl = r.url ?? null;
    } else if (sendLink) {
      // The magic-link plugin's endpoints are not on `auth().api`'s type (see CLAUDE.md); the runtime has them.
      await (auth().api as unknown as MagicLinkApi).signInMagicLink({ body: { email, callbackURL: CALLBACK, errorCallbackURL: '/sign-up?reason=link' }, headers: hdrs });
    }
  } catch (e) {
    // Never log the email, link or token.
    console.error(`[signup] sign-in step failed: ${e instanceof Error ? e.name : typeof e}`);
  }

  await new Promise((r) => setTimeout(r, Math.max(0, MIN_MS - (Date.now() - started))));
  if (wantsGoogle) return googleUrl ? { error: null, googleUrl } : { error: 'Google sign-up did not work. Try again or use email.', googleUrl: null };
  redirect(CHECK_EMAIL);
}
