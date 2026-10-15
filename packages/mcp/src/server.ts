import type { AccessContext, CallOptions, TokenScope, ToolRegistry } from '@cs/core';
import type { Db } from '@cs/db';
import { assertAgencyServiceable, type ToolDeps } from '@cs/tools';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult, CallToolRequestSchema, ListToolsRequestSchema, type ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedToken } from './auth';
import { toToolResult } from './errors';
import { registerPrompts } from './prompts';
import { enforceRateLimit, type McpSession, registerResources } from './resources';

export const SERVER_VERSION = '1.0.0';

/**
 * One MCP server for one request, acting as the token's caller. Tools are the registry's (it validates input and writes
 * the audit row), exposed through the low-level handlers so the SDK neither re-validates nor wraps them.
 */
export function createMcpServer(args: {
  ctx: AccessContext;
  token: ResolvedToken & { scope: TokenScope };
  registry: ToolRegistry<ToolDeps>;
  deps: ToolDeps;
  service: Db;
  branding: { productName: string };
}): McpServer {
  const { ctx, token, registry, deps, service, branding } = args;
  const opts: CallOptions = { channel: 'mcp', tokenId: token.tokenId, tokenScope: token.scope };
  const session: McpSession = { ctx, opts, tokenKey: token.tokenKey, registry, deps, service };
  const server = new McpServer({ name: branding.productName, version: SERVER_VERSION }, { capabilities: { tools: {}, resources: {}, prompts: {} } });

  server.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => ({
    tools: registry.describe(ctx, opts).map((t) => ({
      name: t.name,
      description: t.description.replace(/Rival Monday/g, branding.productName),
      inputSchema: t.inputSchema as ListToolsResult['tools'][number]['inputSchema'],
    })),
  }));

  server.server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const { name, arguments: input } = req.params;
    try {
      await enforceRateLimit(session);
      await assertAgencyServiceable(service, ctx); // 9a: read_only/suspended agency -> service_paused (resources too, I7; tools/list and prompts carry no agency data)
      const out = await registry.invoke(ctx, name, input ?? {}, opts);
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (e) {
      return toToolResult(e, name);
    }
  });

  registerResources(server, session);
  registerPrompts(server);
  return server;
}
