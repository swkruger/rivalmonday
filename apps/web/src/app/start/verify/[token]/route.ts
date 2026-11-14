import { verifyIntake } from '@cs/tools';
import { NextResponse } from 'next/server';
import { requestHost } from '@/server/request-host';
import { toolDeps } from '@/server/tools';
import { SLUG_RE } from '../../params';

export const dynamic = 'force-dynamic';

/**
 * Phase 11c §3: the `lead_verify` email link. Uses the token (hash lookup in `verifyIntake`; reusable until it expires, so a
 * mail scanner's pre-open is harmless) and sends the visitor to the preview page with a fresh view token. Unknown, expired
 * or decided → the expired page, which points back to
 * the intake page named by `?from=` (an agency slug, `-` for "agency, but no known page", absent for the platform page).
 * The token lives in the URL, so the response is never cached and never leaks it as a referrer; nothing here logs it.
 * 13a1 N3: redirects stay on the request's origin; on an agency host only that agency's leads verify (others: the expired page).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const host = await requestHost();
  const at = (path: string) => new URL(path, host.origin);
  const scope = host.info.kind === 'agency' ? { agencyId: host.info.agencyId } : undefined;
  const r = await verifyIntake(toolDeps(), token, new Date(), scope);

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
