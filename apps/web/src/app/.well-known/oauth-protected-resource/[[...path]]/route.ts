import { mcpOrigin } from '@cs/db';
import { NextResponse } from 'next/server';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint, at `/.well-known/oauth-protected-resource` and the
 * path-inserted `/.well-known/oauth-protected-resource/mcp` (served only on the MCP host, 13a1 Task 8). Hand-built: the
 * resource client's helper would name the origin as the authorization server, but the issuer is `<mcp origin>/api/auth`
 * (Task 1 spike). No `resource_name`: public metadata names no product (white-label).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  if (path && !(path.length === 1 && path[0] === 'mcp')) return new NextResponse('Not found', { status: 404 });
  const origin = mcpOrigin(webEnv().hostEnv);
  return NextResponse.json(
    {
      resource: `${origin}/mcp`,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: ['read', 'feedback', 'manage'],
      bearer_methods_supported: ['header'],
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
