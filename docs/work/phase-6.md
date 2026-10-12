# phase-6 - Remote MCP server (6a) and Ask assistant "Friday" (6b)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-6   **Base:** main @ 1c4a7fd
**Spec/plan:** `docs/superpowers/{specs,plans}/2026-10-11-phase-6a-mcp*.md` (d1-d13, P1-P18)

## Status (overwrite)
**6a implemented** (Tasks 0-15, all reviewed clean); the final whole-branch review (most capable model, `test:affected` + `e2e:affected` with default base) and one fix wave are pending. **Must fix in that wave:** a guest viewer on `/c/<id>/settings/ai` gets an error page (`list_api_tokens` permission_denied) instead of `notFound()`. Triage: `resources.ts` upsell offset-0 misattribution; `errors.ts` logs `cause` (may carry query params); unchecked `BriefView` cast; `ApiTokenView`/`OAuthGrantView` unexported; `add_recommendation` inserts not in one tx. **6b (Ask / Friday) not started.**

## Next (overwrite)
1. Final review + fix wave, owner verification (below), then `/rm-merge phase-6` with the owner's go-ahead.
2. Plan 6b (`/rm-kickoff`, brainstorming). Open: **(6)** Ask model: re-probe sonnet-5 ZDR + strict `json_schema` on OpenRouter, else sonnet-4.6; **(7)** grounding vs streaming (rec: verify, then stream); **(8)** quota (rec: per-client monthly limit; cap pause stays Phase 7); **(10)** agency view of Ask threads (rec: toggle + read-only view). Missing tables: `ask_thread`, `ask_message`.

## Interfaces this branch adds or changes
**Migrations (next free: `0042`):**
- `0038_mcp` (generated): `api_token` (`id, agency_id, user_id -> auth.user, client_id?, name 1-80, token_hash unique, token_prefix, scope read|feedback|manage, created_at, last_used_at, revoked_at`); `oauth_grant_binding` (`consent_id` text PK = `auth."oauthConsent".id`, `id` uuid unique = audit `token_id`, `oauth_client_id`, `agency_id`, `user_id`, `client_id?`, `scope`, timestamps); `mcp_rate_window` (`token_key, window_kind minute|day, window_start, count`; PK on the first three); `audit_log.channel` (default `'web'`) + `token_id` + index + check; `recommendation.source` gains `'mcp'`.
- `0039_mcp_rls` (custom): RLS + grants (`app_user`: column-limited SELECT on `api_token` without `token_hash`, `UPDATE (revoked_at)` on both token tables; inserts service-role only) and the SQL-only `search_tsv` generated columns + GIN indexes (review, recommendation, brief_item, event, alert).
- `0040_feedback_kind_created` (R12): `feedback_kind_check` adds `'created'`.
- `0041_auth_oauth` (custom): the 7 `auth."oauth*"` tables verbatim from `docs/work/phase-6-oauth-schema.sql` + GRANTs to `app_service`.
- `withTenant` also sets `app.user_id` / `app.role` (SQL `app_user_id()`, `app_role()`); `TenantScope` gained `userId`/`role`.

**`@cs/core`:** `tokens.ts` (`TokenScope`, `PAT_PREFIX='rm_pat_'`, `generatePat`, `hashPat` sha256 hex, `isPatFormat`, `scopeCovers`, `grantableScopes`, `effectiveScope`). Registry `Tool` gains `channels?: ToolChannel[]` (default `['web']`), `audit?: 'always'|'skip-web'`, `mcpScope?` (default from `permission` via `mcpScopeOf`); handler 4th arg `CallMeta {channel, tokenId}`; `invoke(ctx, name, input, opts?: CallOptions {channel, tokenId?, tokenScope?})`, same for `list`/`describe` (default `{channel:'web'}`); hidden = unknown = `not_found` (identical text); audit rows carry `channel`/`tokenId`.

**`@cs/mcp` (new):** `resolveBearer`, `tokenAccess`, `touchPat`, `ResolvedToken`, `VerifyOAuth`; `createMcpServer`, `SERVER_VERSION`; `handleMcpRequest(req, McpHandlerDeps {service, registry, deps, appUrl, verifyOAuth})`; `checkRateLimit`, `RATE_LIMITS`; `toToolResult`, `RateLimitedError`; `productNameFor`, `DEFAULT_PRODUCT_NAME`. SDK pinned 1.30.1.

**`@cs/tools`:** `ToolDeps` + `appUrl?`, `embedQuery?(text, scope)`, `evidenceStore?{get(key)}`. New tools: `search` and `fetch` (ChatGPT shapes; `fetchItem`, `parseItemId`, `ITEM_TYPES` exported), `add_recommendation` (`channels ['mcp']`, source `'mcp'`), `create_api_token` (plaintext only in the return), `list_api_tokens`, `revoke_api_token`, `list_oauth_grants`, `revoke_oauth_grant`. List tools take `cursor`, `limit` (off-web <= 50), `detail=summary|full`; rows carry `evidenceIds` + `url`. Helpers: `paging.ts` (`pageOf`, `detailOf`), `workspace/model-text.ts` `forChannel` (d12), `access/oauth.ts` (`revokePluginTokens`, `deletePluginConsent`, `consentIdFor`, `dropUnboundConsents`).

**Routes (`apps/web`):** `POST /mcp` (GET/DELETE 405); `/.well-known/oauth-protected-resource` (hand-built PRM, `authorization_servers:[<app>/api/auth]`); `/.well-known/oauth-authorization-server[/api/auth]`; `/oauth/consent` (page + action + form); `/agency/ai` and `/c/<id>/settings/ai` (AI connections); `/sign-in` resumes the OAuth authorize. Better Auth `oauthProvider` plugin (`@better-auth/oauth-provider@1.7.7`, `@better-auth/utils@0.4.2` exact) with `before` hooks (loopback DCR to native; authorize drops unbound consents). Server: `server/mcp.ts` (`mcpDeps`), `server/oauth-consent.ts`. E2E tag `@ai-connections`.

## Assumes from other branches
None. `phase-7-planning` (docs only) assumes our `api_token`/OAuth tables and a unified registry `not_found`; no code overlap.

## Decisions (owner-approved)
Spec d1-d13 are binding: see the spec (d5 channel allowlist, d9 rate limits, d12 redaction, d13 no validity caching). Plan-local, approved 2026-10-12:
- P1 keep `invoke/list/describe(ctx, ..., opts?)` (spec says `call`); default channel `web`. P2 handlers get `meta` as 4th arg.
- P3 hidden = unknown error; audit row keeps `permission_denied`. P4 a client role without the client's `mcp` feature sees no tools (not 401).
- P5 camelCase inputs; `search`/`fetch` keep ChatGPT output shapes. P6 GUCs + grants as in 0039. P7 binding `id` + `oauth_client_id`. P8 effective OAuth scope = binding scope capped by live role.
- P9 consent picker = memberships; binding written by the auth flow (service role). P10 token tools: `read`, feature `mcp`, no guests, <= 20 active PATs per user.
- P11 `url` = `/go/<t>/<id>` for brief/brief_item/alert, direct paths otherwise, absolute via `appUrl`. P12 cursor = base64url `{"o":offset}`; `detail` default summary off-web, full on web.
- P13 `search_tsv` SQL-only; no ANN index. P14 new `add_recommendation`. P15 white-label name = `branding.displayName` else "Rival Monday".
- P16 `embedQuery` only in `dev` with `OPENROUTER_API_KEY`. P17 rate limits count `tools/call` + `resources/read`. P18 `fetch` of global types with an agency token uses the first active in-scope client that sees it.

Rulings that changed behaviour:
- R1 channel allowlist test converges as tools land. R5/R10 loopback DCR hook sets `native` only for public (`none`) clients with all-loopback redirects. R6 consent accept/deny goes through `auth().handler(new Request(...))`, not `auth().api`.
- R7 `/sign-in` resumes the OAuth authorize. R9 prior consent would skip `/oauth/consent`: the authorize hook deletes plugin consents without an active binding, and `verifyOAuth` fails closed without one.
- R11/R13 reviewers run `test:affected --base <task BASE>` in the background (default base re-tests the whole branch, ~12 min).

## Spike findings (condensed; SQL in `docs/work/phase-6-oauth-schema.sql`)
- **Issuer** = `<appUrl>/api/auth`; serve metadata at the root and at the RFC 8414 path-inserted URL; PRM is hand-built (the plugin's says `authorization_servers:[appUrl]`).
- **Opaque tokens** (SHA-256 base64url at rest); `requireActiveAccessToken` throws on revoked/expired/unknown/client-disabled/session-gone (DB read per call). `aud` = `<app>/mcp`. TTL 1 h access / 30 d refresh (rotating, needs `offline_access`).
- **Consent binding key** = `auth."oauthConsent".id` (text; no unique index on `(clientId,userId)`, so `ORDER BY "updatedAt" DESC LIMIT 1`). The consent-page query is signed (`verifyOAuthQueryParams`), valid 600 s.
- **Revoke** = `UPDATE ... SET revoked = now()` on access and refresh tables; deleting the consent alone does not kill tokens. Web sign-out kills that session's access tokens only.
- **Loopback DCR:** Claude Code's `http://localhost` redirects need the native hook; a prior same-scope consent skips the page (R9).

## New backlog (target -> item)
- Later: REST API (spec §8.1) over the registry. Phase 7: tier gating of `mcp`/`ask`.
- MCP `manage` scope for client roles (agency roles only in 6a).
- ANN vector index (P13). 6b: `'ask'` channel on `add_recommendation` (source allowed already).
- `search` pages are vector-only: empty without `embedQuery` (add FTS or prod embeddings).
- Consent page shows the registrant-chosen app name (DCR): **owner decision** on also showing the redirect host (copy change).
- `test:affected` default base re-tests the whole branch; consider a narrower default.
- Deferred minors: undecided revoke success copy; `revoke_oauth_grant` partial failure leaves the plugin consent (fail-closed); second authorize tab's `dropUnboundConsents` can delete a just-accepted unbound consent; `fetch` brief text uncapped; model-written titles not redacted.

## Owner verification steps
1. Local: with your go-ahead, `pnpm db:migrate` on `cs_dev`; `pnpm dev:web`; create a token at `/agency/ai`; `claude mcp add --transport http rival-monday http://localhost:3000/mcp --header "Authorization: Bearer rm_pat_..."`; ask Claude Code "What changed at aireserv.com this month?" and check the answer cites evidence ids; revoke the token and confirm the next call fails.
2. If live: on the deployed host (e.g. https://rivalmonday.app), Claude.ai -> Add custom connector `https://<host>/mcp` -> sign in -> pick the workspace and access -> ask a question -> disconnect from AI connections and confirm the next call fails.
3. Decide the open copy items above.

## ARCHITECTURE notes for `/rm-merge`
Add `@cs/mcp` (bearer resolution, stateless per-request server, resources `evidence://`/`brief://`, 4 prompts, rate limit); registry channels/scopes/audit; the new tools; web routes and `oauthProvider` consent flow above; the new tables; migrations 0038-0041. STATE: next migration `0042`; move Phase 6 BACKLOG items done here (catalogue, audit-exempt reads via `skip-web`, `detail`/deep links, brief tools) out and file the items above.
