# Phase 6a — Tool catalogue hardening + remote MCP server

**Date:** 2026-10-11 · **Branch:** `phase-6` · **Core spec:** §8.2, §8.3, §11 (read those; this file records only new decisions and interfaces).
**Phase split (owner, 2026-10-11):** 6a = catalogue + MCP + OAuth + PATs + AI-connections page. 6b = Ask/Friday (threads, streaming, grounding, quota, UI) — brief questions 6, 7, 8, 10 are decided in 6b.

## Decisions (owner-approved 2026-10-11 — do not re-open)
| # | Decision |
|---|---|
| d1 | MCP runs as a route in `apps/web` (`/mcp`), not `apps/mcp` (overrides §8.3 heading / §10.1). Protocol code lives in a new package `@cs/mcp`. |
| d2 | OAuth 2.1 (PKCE + DCR + refresh) via `@better-auth/oauth-provider@1.7.7` (matches `better-auth@1.7.7`). **Task 1 is a gating spike**; if it fails, stop and re-decide with the owner (fallback candidates: hand-rolled endpoints, PAT-only). |
| d3 | Token reach: **agency roles** → every client the membership allows, tools take `client_id`. **Client roles** → the grant/PAT is bound to one client chosen at consent/creation. Membership and client status are re-checked live on every call. |
| d4 | Effective permission = role permissions ∩ token scope ∩ per-client `mcp` feature (agency roles bypass features as today). Scopes nest: `read` ⊂ `feedback` ⊂ `manage`. A scope is grantable only if the role holds that permission, and `manage` is offered to agency roles only in 6a (d5); `client_viewer` can only grant `read`. |
| d5 | MCP tool exposure is an **allowlist** (opt-in `channels`). `read` scope: the read tools in §8.2 that exist. `feedback`: + `submit_feedback`, `update_recommendation_status`, add-recommendation-from-finding. `manage` (agency roles only via MCP): + `set_alert_rules`, `update_client_profile`, `set_page_pin`, `run_prospect_snapshot`. Billing, members, limits, client lifecycle, review queues, `approve_brief` stay web-only. |
| d6 | `search` is **hybrid**: Postgres FTS over event, brief_item, recommendation, alert, review text + pgvector similarity over the already-embedded `event` and `capture_block` rows; merged with reciprocal rank fusion (k = 60). |
| d7 | Audit-exempt reads: `audit: 'skip-web'` on a named list of polled/navigation reads; skipped **only** for channel `web`. MCP (and later Ask) calls are always audited. No sampling. |
| d8 | The audit log is the MCP usage meter (`channel`, `token_id` columns). No separate meter table. |
| d9 | Rate limits per token, fixed windows in Postgres (no Redis): **60 calls/min, 2,000 calls/day** (constants in `@cs/mcp`). |
| d10 | No tiers exist yet: gating = per-client `mcp` feature + rate limits. Tier gating is Phase 7. |
| d11 | REST API (§8.1) is out of Phase 6 → BACKLOG. |
| d12 | Everything returned over MCP that carries captured text (search snippets, `fetch` text, `evidence://` text, `get_evidence`) passes through `redactForModel`. |
| d13 | No caching of token validity: revoking a PAT or grant takes effect on the next call. |

## Interfaces

### `@cs/core` registry (modify `packages/core/src/tools.ts`)
```ts
export type ToolChannel = 'web' | 'mcp' | 'ask';
interface ToolDefinition<I, O, D> {
  // …existing fields…
  channels?: readonly ToolChannel[];   // default ['web']; 'mcp' opt-in per d5
  audit?: 'always' | 'skip-web';       // default 'always' (d7)
  mcpScope?: 'read' | 'feedback' | 'manage'; // minimum token scope; default derived from `permission` (read→read, feedback→feedback, manage→manage); 'agency' tools need read unless set
}
interface CallOptions { channel: ToolChannel; tokenId?: string; tokenScope?: 'read' | 'feedback' | 'manage' }
// AuditEvent gains: channel: ToolChannel; tokenId: string | null
```
- `registry.call(ctx, name, input, opts)` and `registry.list(ctx, opts)` filter by channel and scope.
- An unknown tool and a tool hidden by role/feature/channel/scope both throw `ToolError('not_found')` with the same message (backlog: no enumeration).
- `countRows`: `items` array → length; top-level array → length; `{results}` array → length; else null.
- When the audit write fails, log the original handler error (if any) before the audit error, then fail closed as today.

### Database (migration = next free number at execution time, ≥ `0038`)
```sql
ALTER TABLE audit_log ADD COLUMN channel text NOT NULL DEFAULT 'web'
  CHECK (channel IN ('web','mcp','ask'));
ALTER TABLE audit_log ADD COLUMN token_id uuid NULL;

CREATE TABLE api_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  client_id uuid NULL,                       -- required when the creator has a client role (d3)
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  token_hash text NOT NULL UNIQUE,           -- sha256 hex of the full token
  token_prefix text NOT NULL,                -- first 12 chars, for display
  scope text NOT NULL CHECK (scope IN ('read','feedback','manage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  revoked_at timestamptz NULL,
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE
);
CREATE INDEX api_token_user_idx ON api_token (user_id) WHERE revoked_at IS NULL;

-- OAuth grant → workspace binding (Better Auth plugin owns its own oauth_* tables in schema `auth`)
CREATE TABLE oauth_grant_binding (
  consent_id text PRIMARY KEY,               -- Better Auth consent/grant id (confirmed in spike)
  agency_id uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  client_id uuid NULL,
  scope text NOT NULL CHECK (scope IN ('read','feedback','manage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE
);

CREATE TABLE mcp_rate_window (
  token_key text NOT NULL,                   -- 'pat:<id>' | 'oauth:<consent_id>'
  window_kind text NOT NULL CHECK (window_kind IN ('minute','day')),
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (token_key, window_kind, window_start)
);
```
- RLS: `api_token` and `oauth_grant_binding` — a user reads/revokes **their own** rows (`user_id = app.user_id`); agency admins read and revoke all rows in their agency. Token lookup by hash and `mcp_rate_window` use the **service role** only.
- Search FTS: generated `tsvector` columns (`english`) + GIN indexes on the searched text columns of `event`, `brief_item`, `recommendation`, `alert`, `review` (exact columns fixed in the plan after reading the schema).

### Tokens
- PAT format: `rm_pat_` + 32 random bytes base62. Shown once at creation; stored as `sha256(token)` hex; `token_prefix` = first 12 chars.
- Bearer resolution order: prefix `rm_pat_` → `api_token` (not revoked); otherwise → Better Auth OAuth access-token verification → `oauth_grant_binding` (not revoked).
- Resolution yields `{ tokenKey, tokenId, userId, agencyId, clientId | null, scope }`. `AccessContext` is then built from live `membership` (and `clientScope` narrowed to `[clientId]` when bound). No live membership, or bound client not `active` → HTTP 401.

### `/mcp` and discovery (apps/web)
- `app/mcp/route.ts`: `POST` (JSON-RPC over Streamable HTTP, stateless: `sessionIdGenerator: undefined`, new server per request), `GET`/`DELETE` → 405.
- Missing/invalid token → `401` + `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`.
- `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414), shapes as the plugin produces them.
- `/oauth/consent` page: shows the requesting client app's name and the scopes as plain-language bullets. Client-role users pick one client workspace (pre-selected and read-only when they have exactly one); agency roles see "All clients you can access" with no picker (d3). Approve writes `oauth_grant_binding`.

### `@cs/mcp` (new package `packages/mcp`)
```ts
export function createMcpServer(args: {
  ctx: AccessContext; token: ResolvedToken; registry: ToolRegistry<ToolDeps>; deps: ToolDeps;
  branding: { productName: string }; // agency.branding?.productName ?? 'Rival Monday'
}): McpServer;
export function checkRateLimit(db, tokenKey: string, now?: Date): Promise<{ ok: true } | { ok: false; retryAfterS: number }>;
export const RATE_LIMITS = { perMinute: 60, perDay: 2000 } as const;
```
- Tools: `registry.list(ctx, { channel: 'mcp', tokenScope })` → MCP tools with JSON Schema from Zod (`z.toJSONSchema`). Descriptions replace the literal `Rival Monday` with `productName`; server `name` = productName.
- Tool errors → `{ isError: true, content: [{ type: 'text', text: JSON.stringify({ code, message }) }] }`. `internal` has a generic message only.
- Rate limit exceeded → tool error `rate_limited` with `retry_after_s`.
- Resources: `evidence://{id}` → text (redacted, d12) + screenshot as an image content block if present; `brief://{id}` → the client-facing brief rendering (approved/sent only, items `active`, sorted by `ord`, no `upsell_tag` for client roles).
- Prompts: `weekly_review`, `competitor_deep_dive(competitor_id)`, `respond_to_price_change(event_id)`, `prepare_client_meeting(client_id?)` — templated user messages that name the tools to use; copy fixed in the plan.

### New tools (`@cs/tools`)
```ts
search: input  { query: string(1..200), client_id?: uuid, types?: ('event'|'brief_item'|'recommendation'|'alert'|'review'|'page')[], limit?: int(1..20)=10 }
        output { results: { id: string; title: string; snippet: string; url: string }[] }
fetch:  input  { id: string }   // '<type>:<uuid>', type ∈ event|evidence|brief|brief_item|recommendation|alert|review|page
        output { id: string; title: string; text: string; url: string; metadata: { type: string; client_id: string; evidence_ids: string[]; occurred_at?: string } }
```
- Both `permission: 'read'`, `channels: ['web','mcp']`. `client_id` required for agency roles when they can see more than one client; for bound tokens it defaults to the bound client.
- Filters on every path: client scope, `retracted_at IS NULL`, `client.status = 'active'`, client-facing status rules (brief approved/sent, items active, alerts delivered, hide `feedback`/`playbook_override`), `upsell_tag` stripped for client roles.
- Query embedding: one `@cs/ai` embeddings call per search (512-d); if it fails, fall back to FTS-only, never error.
- `url` = existing `/go/<target>/<id>` deep link (`@cs/core/links.ts`).
- Malformed `fetch` id and an id outside the scope both → `not_found`.

### Catalogue hardening
- List tools exposed over MCP accept `detail: 'summary' | 'full'` (default `summary`) and paginate (`cursor`, `limit ≤ 50`); summary rows carry `id`, title, date, `evidence_ids`, `url`.
- Every new or MCP-exposed read over `brief_item`/`recommendation` strips `upsell_tag` for client roles; renderers sort brief items by `ord` without assuming contiguity.
- `audit: 'skip-web'` on: `get_competitor_search_status`, `list_clients`, and any other read the plan finds polled by the web UI (listed explicitly in the plan).

### AI connections UI
- `/c/[clientId]/settings/ai`: connector URL (`<origin>/mcp`) with short Claude / ChatGPT / Claude Code instructions; **Access tokens** (create with name + scope, token shown once with copy button, list with prefix/scope/last used, revoke); **Connected apps** (OAuth grants with app name, scope, connected date, revoke). Hidden (404) when the client's `mcp` feature is off, for client roles.
- Agency equivalent at the agency settings area: the same two lists across the agency (admins see everyone's; account managers their own).
- Writes go through `runTool`: new tools `create_api_token`, `revoke_api_token`, `list_api_tokens`, `list_oauth_grants`, `revoke_oauth_grant` (`channels: ['web']`). `create_api_token` returns the plaintext once.

## Error handling summary
| Situation | Result |
|---|---|
| No/invalid/revoked token | HTTP 401 + `WWW-Authenticate` resource metadata |
| Membership gone, bound client not active | HTTP 401 |
| Tool unknown or not allowed | tool error `not_found` (identical text) |
| Item outside scope | tool error `not_found` |
| Rate limit | tool error `rate_limited` + `retry_after_s` |
| Handler crash | tool error `internal`, generic text; original error logged |

## Testing
- Unit: scope intersection; channel/scope filtering; hidden not-found parity; `countRows`; PAT generate/hash/lookup; rate windows (minute/day rollover); `fetch` id parsing; RRF merge.
- Integration (local test DB): official MCP SDK client against the `/mcp` handler with real PATs — `initialize`, `tools/list` per role × scope, `tools/call`, 401 header, revocation effective on next call, cross-tenant `search`/`fetch` return nothing, retracted/upsell/status filters.
- E2E: AI connections (create → shown once → revoke); consent page workspace pick.
- Owner verification: Claude Code with a PAT against `cs_dev`; Claude.ai custom connector via OAuth on the temp host if reachable.

## Out of scope (→ BACKLOG)
REST API (§8.1); tier gating (Phase 7); Ask/Friday and its writes (6b); MCP `manage` for client roles.
