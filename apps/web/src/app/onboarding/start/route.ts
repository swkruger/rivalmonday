import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { platformAuth } from '@/server/auth';
import { dbs } from '@/server/db';
import { onboardingStartTarget } from '@/server/onboarding-start';
import { requestHost } from '@/server/request-host';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/**
 * Phase 10 (R4): the callback of every sign-up magic link and Google round trip. It lives outside the `(app)` group so a
 * user with no membership yet is not bounced to `/no-access`; it selects the right membership before `/onboarding`.
 */
export async function GET() {
  const { origin } = await requestHost(); // platform only: the proxy 404s /onboarding/start on agency hosts (sign-up is denied there too, V11)
  const at = (path: string) => new URL(path, origin);
  const session = await platformAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(at('/sign-in'));
  const target = await onboardingStartTarget(dbs().service, { id: session.user.id, email: session.user.email }, new Date());
  const res = NextResponse.redirect(at(target.path));
  if (target.path === '/onboarding') {
    res.cookies.set(MEMBERSHIP_COOKIE, target.membershipId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
