import { NextResponse } from 'next/server';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint, at `/.well-known/oauth-protected-resource` and the
 * path-inserted `/.well-known/oauth-protected-resource/mcp`. Hand-built: the resource client's helper would name the
 * app origin as the authorization server, but the issuer is `<appUrl>/api/auth` (Task 1 spike).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  if (path && !(path.length === 1 && path[0] === 'mcp')) return new NextResponse('Not found', { status: 404 });
  const { appUrl } = webEnv();
  return NextResponse.json(
    {
      resource: `${appUrl}/mcp`,
      authorization_servers: [`${appUrl}/api/auth`],
      scopes_supported: ['read', 'feedback', 'manage'],
      bearer_methods_supported: ['header'],
      resource_name: 'Rival Monday',
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
