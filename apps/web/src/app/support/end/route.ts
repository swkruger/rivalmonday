import { resolveSession } from '@cs/tools';
import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { platformAdmins } from '@/server/runtime-env';
import { safeNext } from '@/server/safe-next';
import { SUPPORT_COOKIE, verifySupportCookie } from '@/server/support-cookie';

export const dynamic = 'force-dynamic';

/**
 * Phase 8b R4: Server Components can't clear cookies, so `getViewer()` sends an unusable `rm_support` here with
 * `sid=<the session id that failed>`. Outside `(app)` so no app layout (and no viewer resolution) runs first.
 * This route never ends a valid session (Exit is a separate POST, Task 8):
 * - the cookie doesn't verify (or is absent) → clear it, go to `next`;
 * - it verifies but its id isn't `sid` (a stale redirect after a start/replace set a new cookie) → keep it, go to `next`;
 * - its id is `sid` → `resolveSession` (which ends stale rows): expired → clear, `/platform/agencies/<id>?ended=1`;
 *   revoked → clear, `/platform`; invalid (or no signed-in user) → clear, `next`; ok (stale) → keep it, `next`.
 * `next` passes `safeNext` (same-origin relative path, default `/`).
 */
export async function GET(req: NextRequest) {
  let to = safeNext(req.nextUrl.searchParams.get('next'));
  const id = verifySupportCookie(req.cookies.get(SUPPORT_COOKIE)?.value);
  let clear = true;
  if (id && id !== req.nextUrl.searchParams.get('sid')) clear = false;
  else if (id) {
    const s = await auth().api.getSession({ headers: req.headers });
    if (s) {
      const r = await resolveSession({ service: dbs().service, platformAdmins: platformAdmins() }, { sessionId: id, userId: s.user.id });
      if (r.kind === 'expired') to = `/platform/agencies/${r.agencyId}?ended=1`;
      else if (r.kind === 'revoked') to = '/platform';
      else if (r.kind === 'ok') clear = false;
    }
  }
  const res = NextResponse.redirect(new URL(to, webEnv().appUrl));
  if (clear) res.cookies.delete({ name: SUPPORT_COOKIE, path: '/' });
  return res;
}
