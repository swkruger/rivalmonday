import type { ToolRegistry } from '@cs/core';
import type { Db } from '@cs/db';
import type { ToolDeps } from '@cs/tools';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveBearer, tokenAccess, touchPat, type VerifyOAuth } from './auth';
import { productNameFor } from './branding';
import { createMcpServer } from './server';

export interface McpHandlerDeps { service: Db; registry: ToolRegistry<ToolDeps>; deps: ToolDeps; appUrl: string; verifyOAuth: VerifyOAuth | null }

const INVALID_TOKEN = JSON.stringify({ error: 'invalid_token', error_description: 'Sign in again or use a valid access token.' });

function unauthorized(appUrl: string): Response {
  return new Response(INVALID_TOKEN, {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer resource_metadata="${appUrl.replace(/\/+$/, '')}/.well-known/oauth-protected-resource"`,
    },
  });
}

/**
 * `POST /mcp`: stateless Streamable HTTP with JSON responses. Every request re-resolves the token, membership and client
 * status (d13) and gets its own server + transport, closed once the response is produced.
 */
export async function handleMcpRequest(req: Request, d: McpHandlerDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const token = await resolveBearer({ service: d.service, verifyOAuth: d.verifyOAuth }, req.headers.get('authorization'));
  const access = token ? await tokenAccess(d.service, token) : null;
  if (!token || !access) return unauthorized(d.appUrl);
  if (token.kind === 'pat') {
    await touchPat(d.service, token.tokenId).catch((e: unknown) => {
      // eslint-disable-next-line no-console -- last-used bookkeeping must never fail the request
      console.error('[mcp] touchPat failed', e);
    });
  }
  const server = createMcpServer({
    ctx: access.ctx, token: { ...token, scope: access.scope }, registry: d.registry, deps: d.deps, service: d.service,
    branding: { productName: await productNameFor(d.service, token.agencyId) },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}
