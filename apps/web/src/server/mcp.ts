import 'server-only';
import type { EnvName } from '@cs/db';
import type { McpHandlerDeps } from '@cs/mcp';
import { dbs } from './db';
import { webEnv } from './env';
import { perEnv } from './env-cache';
import { registry, toolDeps } from './tools';

/** What `handleMcpRequest` needs for `name` (default: the live environment). `verifyOAuth` is wired by the OAuth task. */
const handlerDeps = perEnv((name: EnvName): McpHandlerDeps => ({
  service: dbs(name).service,
  registry: registry(name),
  deps: toolDeps(name),
  appUrl: webEnv().appUrl,
  verifyOAuth: null,
}));
export const mcpDeps = (name?: EnvName): McpHandlerDeps => handlerDeps(name);
