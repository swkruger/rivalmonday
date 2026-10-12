import { handleMcpRequest } from '@cs/mcp';
import { mcpDeps } from '@/server/mcp';

export const dynamic = 'force-dynamic';

/** Remote MCP endpoint (stateless Streamable HTTP). It authenticates itself with a Bearer token, so `proxy.ts` lets it through. */
export const POST = (req: Request) => handleMcpRequest(req, mcpDeps());

const methodNotAllowed = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
