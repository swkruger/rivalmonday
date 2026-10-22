import { type NextRequest, NextResponse } from 'next/server';
import { safeNext } from './server/safe-next';

/** `/mcp`, `/.well-known/*`, `/api/ask/*` and `/api/stripe/webhook` and `/api/stripe/connect-webhook` (Stripe signature) authenticate themselves (Bearer token / public metadata / `getViewer`, no session → 404); `/oauth/consent` stays behind the session check. `/start/**` is the public client intake (Phase 11c; Turnstile, rate limits and tokens guard it). */
const PUBLIC = [/^\/sign-in(\/|$)/, /^\/sign-up(\/|$)/, /^\/start(\/|$)/, /^\/join\//, /^\/u\//, /^\/files\/logo\//, /^\/api\/auth\//, /^\/l\//, /^\/health$/, /^\/bot$/, /^\/robots\.txt$/, /^\/api\/postmark\/webhook$/,/^\/link-expired$/, /^\/link-other-account$/, /^\/_next\//, /^\/favicon/, /^\/dev-panel\//, /^\/mcp$/, /^\/\.well-known\//, /^\/api\/ask\//, /^\/api\/stripe\/webhook$/, /^\/api\/stripe\/connect-webhook$/];

const NO_REFERRER = /^\/start\/(?:v|verify)\//;

/**
 * Cheap presence check only — it just gates on whether *some* session or guest cookie exists so unauthenticated
 * requests redirect early. The real re-verification (signature, TTL, membership/contact liveness) happens in
 * `requireViewer`/`resolveViewer` on every request (Review Focus 3 & 4); proxy never decides access by itself.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  // Forwards the current path so `requireViewer` can build a safe `next` for the sign-in redirect (and pick the client
  // hint). Any client-sent `x-rm-path` is dropped first: only this proxy ever sets it.
  headers.delete('x-rm-path');
  headers.set('x-rm-path', `${pathname}${search}`);
  if (PUBLIC.some((p) => p.test(pathname))) {
    const res = NextResponse.next({ request: { headers } });
    // Phase 11c: the preview URL carries a view token and the verify URL a verify token — never pass either on as a referrer.
    if (NO_REFERRER.test(pathname)) res.headers.set('Referrer-Policy', 'no-referrer');
    return res;
  }
  const hasSession = req.cookies.getAll().some((c) => c.name.endsWith('session_token'));
  if (!hasSession && !req.cookies.has('rm_guest')) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(safeNext(`${pathname}${search}`))}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
