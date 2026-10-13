import { type NextRequest, NextResponse } from 'next/server';
import { requireOperatorContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { runTool } from '@/server/run-tool';
import { SUPPORT_COOKIE } from '@/server/support-cookie';

export const dynamic = 'force-dynamic';

/** CSRF: the banner's Exit is a same-origin form POST, so the browser always sends `Origin`; anything else is refused. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin === new URL(webEnv().appUrl).origin;
}

/**
 * Phase 8b: the banner's Exit. POST only, outside `(app)` (no layout or support resolution runs first). Runs
 * `end_support_session` on the operator's own context (a support context would refuse the write), always clears
 * `rm_support`, and 303s back to the agency's console page with `?ended=1` (or `/platform` when nothing was open).
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse('Forbidden', { status: 403 });
  const { ctx } = await requireOperatorContext();
  const r = await runTool<{ agencyId: string | null }>(ctx, 'end_support_session', {});
  const agencyId = r.ok ? r.data.agencyId : null;
  const to = agencyId ? `/platform/agencies/${agencyId}?ended=1` : '/platform';
  const res = NextResponse.redirect(new URL(to, webEnv().appUrl), 303);
  res.cookies.delete({ name: SUPPORT_COOKIE, path: '/' });
  return res;
}
