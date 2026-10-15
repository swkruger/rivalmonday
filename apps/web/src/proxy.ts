import { type NextRequest, NextResponse } from 'next/server';
import { safeNext } from './server/safe-next';

/** `/mcp`, `/.well-known/*`, `/api/ask/*` and `/api/stripe/webhook` and `/api/stripe/connect-webhook` (Stripe signature) authenticate themselves (Bearer token / public metadata / `getViewer`, no session → 404); `/oauth/consent` stays behind the session check. */
const PUBLIC = [/^\/sign-in(\/|$)/, /^\/api\/auth\//, /^\/l\//, /^\/health$/, /^\/link-expired$/, /^\/link-other-account$/, /^\/_next\//, /^\/favicon/, /^\/dev-panel\//, /^\/mcp$/, /^\/\.well-known\//, /^\/api\/ask\//, /^\/api\/stripe\/webhook$/, /^\/api\/stripe\/connect-webhook$/];

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
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next({ request: { headers } });
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
