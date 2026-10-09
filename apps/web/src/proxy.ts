import { type NextRequest, NextResponse } from 'next/server';
import { safeNext } from './server/safe-next';

const PUBLIC = [/^\/sign-in(\/|$)/, /^\/api\/auth\//, /^\/l\//, /^\/health$/, /^\/link-expired$/, /^\/link-other-account$/, /^\/_next\//, /^\/favicon/, /^\/dev-panel\//];

/**
 * Cheap presence check only — it just gates on whether *some* session or guest cookie exists so unauthenticated
 * requests redirect early. The real re-verification (signature, TTL, membership/contact liveness) happens in
 * `requireViewer`/`resolveViewer` on every request (Review Focus 3 & 4); proxy never decides access by itself.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  // Forwards the current path so `requireViewer` can build a safe `next` for the sign-in redirect.
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
