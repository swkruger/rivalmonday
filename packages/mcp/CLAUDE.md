# @cs/mcp — working notes
Remote MCP server (stateless Streamable HTTP) over the `@cs/tools` registry. `apps/web` mounts it at `POST /mcp` and wires `mcpDeps()` (`apps/web/src/server/mcp.ts`).

## Gotchas
- **Resolution order per request (`handleMcpRequest`):** non-POST 405 (before any auth) → `resolveBearer` (PAT = sha256 lookup; else `verifyOAuth` + an ACTIVE `oauth_grant_binding`) → `tokenAccess` (live membership + active client; scope capped by the live role) → server/transport → `registry.invoke(ctx, name, args, { channel: 'mcp', tokenId, tokenScope })`. Any miss is the same 401 with `WWW-Authenticate: Bearer resource_metadata=...`.
- **Never cache token validity (d13):** every request re-resolves token, membership and client status. Don't add a cache "for speed"; revocation and lost membership must bite on the next call.
- **Rate limit = one SQL statement** (`mcp_rate_window` upsert bumps the minute and day rows together; 60/min, 2000/day, UTC day; old windows deleted when the day row is created). It counts `tools/call` and `resources/read` only (P17), before the visibility gate, so probing unknown names still costs.
- **Tool handlers use the SDK's low-level `server.server.setRequestHandler`** for `tools/list` and `tools/call` (we hand over the registry's JSON Schema; `McpServer.registerTool` would re-derive from zod). Resources and prompts use the high-level API.
- **Error shape:** `toToolResult` maps `permission_denied` to `not_found` (404-not-403). Resource errors are a plain `Error` with `code`/`data` (not `McpError`, which prefixes its message). The internal-error log carries `err.cause`, never the input.
- **Resource images:** `resources/read` accepts only `{uri, mimeType, text|blob}`; screenshots go out as `blob`, not `{type:'image'}`.
- **Each request builds a fresh server + transport** (`enableJsonResponse`, no session id) and closes it after responding; keep module state out of the server factory.
- **SPIKE-BOUND names** (`docs/work/phase-6.md` § Spike findings; Better Auth 1.7.7): `requireActiveAccessToken`, `oauthProviderAuthServerMetadata`, `verifyOAuthQueryParams`, the `auth."oauthConsent".id` binding key. A Better Auth upgrade must re-run the OAuth tests in `apps/web` (`oauth-consent`, `auth-options`, `mcp`) first.
- **White-label name** is `productNameFor(agency)` (`branding.displayName`, else "Rival Monday"); tool descriptions have "Rival Monday" replaced with it.
