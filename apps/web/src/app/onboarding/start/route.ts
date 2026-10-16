import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { onboardingStartTarget } from '@/server/onboarding-start';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/**
 * Phase 10 (R4): the callback of every sign-up magic link and Google round trip. It lives outside the `(app)` group so a
 * user with no membership yet is not bounced to `/no-access`; it selects the right membership before `/onboarding`.
 */
export async function GET() {
  const env = webEnv();
  const at = (path: string) => new URL(path, env.appUrl);
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(at('/sign-in'));
  const target = await onboardingStartTarget(dbs().service, { id: session.user.id, email: session.user.email }, new Date());
  const res = NextResponse.redirect(at(target.path));
  if (target.path === '/onboarding') {
    res.cookies.set(MEMBERSHIP_COOKIE, target.membershipId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
