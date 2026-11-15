import 'server-only';
import { type EnvName, mcpOrigin } from '@cs/db';
import type { McpHandlerDeps } from '@cs/mcp';
import { mcpAuth } from './auth';
import { dbs } from './db';
import { webEnv } from './env';
import { perEnv } from './env-cache';
import { createVerifyOAuth } from './oauth-consent';
import { registry, toolDeps } from './tools';

/**
 * What `handleMcpRequest` needs for `name` (default: the live environment). 13a1 Task 8: `/mcp` is served only on
 * `mcp.<NEUTRAL_DOMAIN>`, so the 401 challenge and the OAuth audience use the MCP origin (tool links in `deps` are built
 * by `toolDeps`, unchanged). OAuth tokens verify against that env's MCP-host auth instance.
 */
const handlerDeps = perEnv((name: EnvName): McpHandlerDeps => {
  const origin = mcpOrigin(webEnv().hostEnv);
  return {
    service: dbs(name).service,
    registry: registry(name),
    deps: toolDeps(name),
    appUrl: origin,
    verifyOAuth: createVerifyOAuth({ context: () => mcpAuth(name).$context, service: dbs(name).service, appUrl: origin }),
  };
});
export const mcpDeps = (name?: EnvName): McpHandlerDeps => handlerDeps(name);
