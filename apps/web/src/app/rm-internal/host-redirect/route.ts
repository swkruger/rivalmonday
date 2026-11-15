import { agencyByHostname } from '@cs/db';
import { NextResponse } from 'next/server';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import { HOST_REDIRECT_HEADER, requestOriginFor, resolveHost } from '@/server/hosts';

export const dynamic = 'force-dynamic';

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/**
 * Defence in depth: the target must be on a host we serve, with exactly the origin we build for it (APP_URL's scheme and port) —
 * the platform, the mcp host, or an agency host (`<slug>.<neutral>` or a live custom domain) via the proxy's cached `resolveHost`.
 */
async function servedOrigin(target: URL): Promise<boolean> {
  const env = webEnv().hostEnv;
  const envName = activeEnvName();
  try {
    const host = await resolveHost(target.host, { env, envName, lookup: (h) => agencyByHostname(dbs(envName).service, h, env) });
    return !!host && requestOriginFor(host, target.hostname, env) === target.origin;
  } catch {
    return false; // a failed lookup fails closed
  }
}

/**
 * 13a1 P5: the proxy's cross-host redirects (agency host → platform for staff-only paths, fallback host → live custom domain).
 * Only the proxy reaches this route (it rewrites here, sets the target header after dropping any client copy, and 404s direct
 * requests under `/rm-internal`). A route handler's absolute `Location` is kept as is by self-hosted Next, unlike a middleware one.
 */
async function handle(req: Request): Promise<Response> {
  // The proxy's rewrite carries its request headers (`NextResponse.rewrite(…, { request: { headers } })`).
  const to = req.headers.get(HOST_REDIRECT_HEADER);
  let target: URL | null = null;
  try {
    target = to ? new URL(to) : null;
  } catch {
    target = null;
  }
  if (!target || (target.protocol !== 'https:' && target.protocol !== 'http:') || !(await servedOrigin(target))) return notFound();
  return new NextResponse(null, { status: 307, headers: { location: target.href, 'cache-control': 'no-store' } });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
