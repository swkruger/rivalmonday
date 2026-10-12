import 'server-only';
import type { EnvName } from '@cs/db';
import type { McpHandlerDeps } from '@cs/mcp';
import { auth } from './auth';
import { dbs } from './db';
import { webEnv } from './env';
import { perEnv } from './env-cache';
import { createVerifyOAuth } from './oauth-consent';
import { registry, toolDeps } from './tools';

/** What `handleMcpRequest` needs for `name` (default: the live environment). OAuth tokens verify against that env's auth. */
const handlerDeps = perEnv((name: EnvName): McpHandlerDeps => ({
  service: dbs(name).service,
  registry: registry(name),
  deps: toolDeps(name),
  appUrl: webEnv().appUrl,
  verifyOAuth: createVerifyOAuth({ context: () => auth(name).$context, service: dbs(name).service, appUrl: webEnv().appUrl }),
}));
export const mcpDeps = (name?: EnvName): McpHandlerDeps => handlerDeps(name);
