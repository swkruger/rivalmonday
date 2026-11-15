import { agencyByHostname, platformOrigin } from '@cs/db';
import { type NextRequest, NextResponse } from 'next/server';
import { dbs } from './server/db';
import { activeEnvName } from './server/dev-guard';
import { webEnv } from './server/env';
import { HOST_REDIRECT_HEADER, HOST_REDIRECT_PATH, type HostInfo, hostnameOf, INTERNAL_PATH, requestOriginFor, resolveHost, routeForHost } from './server/hosts';
import { safeNext } from './server/safe-next';

/** `/mcp`, `/.well-known/*`, `/api/ask/*` and `/api/stripe/webhook` and `/api/stripe/connect-webhook` (Stripe signature) authenticate themselves (Bearer token / public metadata / `getViewer`, no session → 404); `/oauth/consent` stays behind the session check. `/start/**` is the public client intake (Phase 11c; Turnstile, rate limits and tokens guard it). `/onboarding/*.webp` are the static O14 images: the `next/image` optimizer fetches them without cookies. */
const PUBLIC = [/^\/sign-in(\/|$)/, /^\/sign-up(\/|$)/, /^\/start(\/|$)/, /^\/join\//, /^\/u\//, /^\/files\/logo\//, /^\/api\/auth\//, /^\/l\//, /^\/health$/, /^\/bot$/, /^\/robots\.txt$/, /^\/api\/postmark\/webhook$/, /^\/link-expired$/, /^\/link-other-account$/, /^\/_next\//, /^\/favicon/, /^\/icon\.svg$/, /^\/dev-panel\//, /^\/mcp$/, /^\/\.well-known\//, /^\/api\/ask\//, /^\/api\/stripe\/webhook$/, /^\/api\/stripe\/connect-webhook$/, /^\/api\/waitlist$/, /^\/api\/site-status$/, /^\/waitlist\//, /^\/sample\//, /^\/onboarding\/[\w-]+\.webp$/];

/** 13a1 (P4, P9): headers only this proxy sets; any client-sent copy is dropped first. */
const PROXY_HEADERS = ['x-rm-path', 'x-rm-host-kind', 'x-rm-host-agency', 'x-rm-origin', HOST_REDIRECT_HEADER];

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

const NO_REFERRER = /^\/(?:start\/(?:v|verify)|waitlist\/confirm|sample)\//;

/**
 * Cheap presence check only — it just gates on whether *some* session or guest cookie exists so unauthenticated
 * requests redirect early. The real re-verification (signature, TTL, membership/contact liveness) happens in
 * `requireViewer`/`resolveViewer` on every request (Review Focus 3 & 4); proxy never decides access by itself.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  // Forwards the current path so `requireViewer` can build a safe `next` for the sign-in redirect (and pick the client
  // hint), plus the host kind, host agency and validated origin (13a1). Client-sent copies are dropped first: only this proxy sets them.
  for (const h of PROXY_HEADERS) headers.delete(h);
  // The internal redirect route is reachable only through the rewrite below, never by a client on any host.
  if (INTERNAL_PATH.test(pathname)) return notFound();
  // Liveness answers on any host without a DB lookup (and carries no host headers).
  if (pathname === '/health') return NextResponse.next({ request: { headers } });
  // 13a1 (P4, P5, R7): session-free host rules. The lookup is cached 60 s per hostname (R2, the one named cross-request cache).
  const env = webEnv().hostEnv;
  const envName = activeEnvName();
  const rawHost = req.headers.get('host');
  let host: HostInfo | null;
  try {
    host = await resolveHost(rawHost, { env, envName, lookup: (h) => agencyByHostname(dbs(envName).service, h, env) });
  } catch (e) {
    // Fail closed: a host we could not resolve is served nothing (and `resolveHost` caches no failed lookup).
    console.error(`[proxy] host lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    return notFound();
  }
  const route = routeForHost(host, { pathname, search, method: req.method }, platformOrigin(env));
  if (route.kind === 'not_found') return notFound();
  if (route.kind === 'redirect') {
    // Issued by the internal route (307 + no-store): a proxy redirect to the platform origin would be relativised by self-hosted Next.
    headers.set(HOST_REDIRECT_HEADER, route.to);
    return NextResponse.rewrite(new URL(HOST_REDIRECT_PATH, req.url), { request: { headers } });
  }
  headers.set('x-rm-path', `${pathname}${search}`);
  const hostname = hostnameOf(rawHost);
  if (host && hostname) {
    headers.set('x-rm-host-kind', host.kind);
    if (host.kind === 'agency') headers.set('x-rm-host-agency', host.agencyId);
    headers.set('x-rm-origin', requestOriginFor(host, hostname, env));
  }
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
