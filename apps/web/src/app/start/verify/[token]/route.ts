import { verifyIntake } from '@cs/tools';
import { NextResponse } from 'next/server';
import { webEnv } from '@/server/env';
import { toolDeps } from '@/server/tools';
import { SLUG_RE } from '../../params';

export const dynamic = 'force-dynamic';

/**
 * Phase 11c §3: the `lead_verify` email link. Consumes the single-use token (hash lookup in `verifyIntake`) and sends the
 * visitor to the preview page with a fresh view token. Unknown, used or expired → the expired page, which points back to
 * the intake page named by `?from=` (an agency slug, `-` for "agency, but no known page", absent for the platform page).
 * The token lives in the URL, so the response is never cached and never leaks it as a referrer; nothing here logs it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = webEnv();
  const at = (path: string) => new URL(path, env.appUrl);
  const r = await verifyIntake(toolDeps(), token, new Date());

  let res: NextResponse;
  if ('expired' in r) {
    const from = new URL(req.url).searchParams.get('from');
    const origin = from === null ? '' : `?from=${SLUG_RE.test(from) ? from : '-'}`;
    res = NextResponse.redirect(at(`/start/verify${origin}`));
  } else {
    res = NextResponse.redirect(at(`/start/v/${r.leadId}?t=${encodeURIComponent(r.viewRaw)}`));
  }
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
