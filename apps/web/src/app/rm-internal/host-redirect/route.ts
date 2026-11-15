import { NextResponse } from 'next/server';
import { HOST_REDIRECT_HEADER } from '@/server/hosts';

export const dynamic = 'force-dynamic';

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
  if (!target || (target.protocol !== 'https:' && target.protocol !== 'http:')) {
    return new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return new NextResponse(null, { status: 307, headers: { location: target.href, 'cache-control': 'no-store' } });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
