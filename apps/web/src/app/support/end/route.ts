import { endSession, resolveSession } from '@cs/tools';
import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { platformAdmins } from '@/server/runtime-env';
import { safeNext } from '@/server/safe-next';
import { SUPPORT_COOKIE, verifySupportCookie } from '@/server/support-cookie';

export const dynamic = 'force-dynamic';

/**
 * Phase 8b R4: Server Components can't clear cookies, so `getViewer()` sends an unusable `rm_support` here. Outside
 * `(app)` so no app layout (and no viewer resolution) runs first. Re-verifies the cookie; for a session owned by the
 * signed-in user, `resolveSession` ends an expired/revoked row and a still-open one is ended as 'exit'. The cookie is
 * always cleared. Destinations: expired/open → `/platform/agencies/<id>?ended=1`, revoked → `/platform`, anything else
 * → a same-origin `next` (default `/`). A cross-site GET can only end the caller's own session — accepted.
 */
export async function GET(req: NextRequest) {
  let to = safeNext(req.nextUrl.searchParams.get('next'));
  const id = verifySupportCookie(req.cookies.get(SUPPORT_COOKIE)?.value);
  if (id) {
    const s = await auth().api.getSession({ headers: req.headers });
    if (s) {
      const service = dbs().service;
      const r = await resolveSession({ service, platformAdmins: platformAdmins() }, { sessionId: id, userId: s.user.id });
      if (r.kind === 'expired') to = `/platform/agencies/${r.agencyId}?ended=1`;
      else if (r.kind === 'revoked') to = '/platform';
      else if (r.kind === 'ok') {
        await endSession(service, r.session.id, 'exit');
        to = `/platform/agencies/${r.session.agencyId}?ended=1`;
      }
    }
  }
  const res = NextResponse.redirect(new URL(to, webEnv().appUrl));
  res.cookies.delete({ name: SUPPORT_COOKIE, path: '/' });
  return res;
}
