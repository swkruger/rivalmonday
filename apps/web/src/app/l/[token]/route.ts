import { clientOriginFor } from '@cs/db';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { requestAuth } from '@/server/auth';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { GUEST_COOKIE, GUEST_TTL_SECONDS, signGuest } from '@/server/guest';
import { openLink } from '@/server/links';
import { requestHost } from '@/server/request-host';
import { safeNext } from '@/server/safe-next';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/**
 * Spec §9.2 signed email deep link. Verifies the token (Review Focus 3: a tampered, expired, revoked or
 * deactivated-contact token gets the same generic "expired" page as an unknown one — no existence leak) and never
 * grants a signed-in user who is not the link's own contact anything (Review Focus 1: "this link belongs to
 * another account"). The token lives in the URL, so the response is never cached and never leaks it as a referrer.
 *
 * 13a1 N3/P5: redirects stay on the request's own origin. On the platform host a client contact's link is re-opened on the
 * agency's client origin (307, no cookie set here); on an agency host another agency's link is expired (`openLink`).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = webEnv();
  const host = await requestHost();
  const { service } = dbs();
  const session = await (await requestAuth()).api.getSession({ headers: await headers() });
  const outcome = await openLink({ service, token, secrets: env.linkSecrets, sessionUserId: session?.user.id ?? null, host: host.info });
  const at = (path: string) => new URL(path, host.origin);
  const secure = process.env.NODE_ENV === 'production';

  let res: NextResponse;
  if (outcome.kind === 'client-host') {
    // Service db: client roles cannot read agency_domain (F9). The agency host re-verifies the token from scratch.
    res = NextResponse.redirect(`${await clientOriginFor(service, outcome.agencyId, env.hostEnv)}/l/${encodeURIComponent(token)}`, 307);
  } else if (outcome.kind === 'expired') {
    res = NextResponse.redirect(at('/link-expired'));
  } else if (outcome.kind === 'other-account') {
    res = NextResponse.redirect(at('/link-other-account'));
  } else if (outcome.kind === 'sign-in') {
    res = NextResponse.redirect(at(`/sign-in?next=${encodeURIComponent(safeNext(outcome.next))}`));
  } else {
    res = NextResponse.redirect(at(safeNext(outcome.to)));
    if (outcome.guest) {
      res.cookies.set(GUEST_COOKIE, signGuest(env.linkSecrets[0]!, outcome.guest), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: GUEST_TTL_SECONDS });
    }
    if (outcome.membershipId) {
      res.cookies.set(MEMBERSHIP_COOKIE, outcome.membershipId, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
  }
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
