import { endOpenSessionFor } from '@cs/tools';
import { type NextRequest, NextResponse } from 'next/server';
import { getOperatorViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { runTool } from '@/server/run-tool';
import { SUPPORT_COOKIE } from '@/server/support-cookie';

export const dynamic = 'force-dynamic';

/** CSRF: the banner's Exit is a same-origin form POST, so the browser always sends `Origin`; anything else is refused. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin === new URL(webEnv().appUrl).origin;
}

async function endDirectly(userId: string): Promise<string | null> {
  try {
    return await endOpenSessionFor(dbs().service, userId);
  } catch (e) {
    // The cookie must still be cleared (the server-side expiry ends the row); log only the error class.
    console.error('support exit fallback failed', e instanceof Error ? e.constructor.name : 'unknown');
    return null;
  }
}

function leave(to: string): NextResponse {
  const res = NextResponse.redirect(new URL(to, webEnv().appUrl), 303);
  res.cookies.delete({ name: SUPPORT_COOKIE, path: '/' });
  return res;
}

/**
 * Phase 8b: the banner's Exit. POST only, outside `(app)` (no layout or support resolution runs first). Runs
 * `end_support_session` on the operator's own context (a support context would refuse the write), always clears
 * `rm_support`, and 303s back to the agency's console page with `?ended=1` (or `/platform` when nothing was open).
 *
 * M6: resolves the signed-in user directly (`getOperatorViewer`, no redirect), so an operator who lost their own
 * membership mid-session still ends their own open row and loses the cookie (then `/no-access`, where `/platform`
 * would send them anyway). Not signed in: nothing to end; the cookie is still cleared. A failed `Origin` check is a
 * 403 that ends nothing and clears nothing (CSRF); the session then runs out at its expiry.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse('Forbidden', { status: 403 });
  const viewer = await getOperatorViewer();
  if (!viewer || viewer.kind === 'guest') return leave('/platform');
  if (viewer.kind !== 'user') {
    await endDirectly(viewer.userId);
    return leave('/no-access');
  }
  const { ctx } = viewer;
  // A throwing tool (e.g. a database outage) must not skip the cookie clear: treat it as a refusal and fall through.
  let r: Awaited<ReturnType<typeof runTool<{ agencyId: string | null }>>> | { ok: false } = { ok: false };
  try {
    r = await runTool<{ agencyId: string | null }>(ctx, 'end_support_session', {});
  } catch (e) {
    console.error('support exit tool failed', e instanceof Error ? e.constructor.name : 'unknown');
  }
  // A refusal must not leave the row open: end the caller's own session directly (same row the tool would end).
  const agencyId = r.ok ? r.data.agencyId : await endDirectly(ctx.userId);
  return leave(agencyId ? `/platform/agencies/${agencyId}?ended=1` : '/platform');
}
