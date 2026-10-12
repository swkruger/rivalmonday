import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';

export const dynamic = 'force-dynamic';

type MetadataAuth = Parameters<typeof oauthProviderAuthServerMetadata>[0];

/**
 * RFC 8414 authorization-server metadata for the OAuth provider (issuer `<appUrl>/api/auth`), at
 * `/.well-known/oauth-authorization-server` and the path-inserted `/.well-known/oauth-authorization-server/api/auth`
 * (Task 1 spike item 9). Public, like the protected-resource metadata; `proxy.ts` lets `/.well-known/*` through.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  if (path && !(path.length === 2 && path[0] === 'api' && path[1] === 'auth')) return new NextResponse('Not found', { status: 404 });
  // `buildAuthOptions` returns the widened BetterAuthOptions, so the plugin's endpoints are not in `auth().api`'s type.
  return oauthProviderAuthServerMetadata(auth() as unknown as MetadataAuth)(req);
}
