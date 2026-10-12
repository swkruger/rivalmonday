# phase-6 - Remote MCP server (6a) and Ask assistant "Friday" (6b)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-6   **Base:** main @ 1c4a7fd
**Spec/plan:** `docs/superpowers/{specs,plans}/2026-10-11-phase-6a-mcp*.md` (d1-d13, P1-P18)

## Status (overwrite)
**6a done and ready to merge:** Tasks 0-15 reviewed, final whole-branch review + one fix wave, re-review clean. Branch-wide `test:affected` 14/14, `e2e:affected` 30/30. Tree clean; migrations 0038-0041 **not yet applied to `cs_dev`**. **6b (Ask / Friday) not started.**

## Next (overwrite)
1. Owner: go-ahead for `/rm-merge phase-6` (full unit + E2E there; migrate `cs_dev` 0038-0041), then the owner verification steps below. Undecided copy: "Token revoked." / "App disconnected.".
2. Plan 6b (`/rm-kickoff`, brainstorming). Open: **(6)** Ask model: re-probe sonnet-5 ZDR + strict `json_schema` on OpenRouter, else sonnet-4.6; **(7)** grounding vs streaming (rec: verify, then stream); **(8)** quota (rec: per-client monthly limit; cap pause stays Phase 7); **(10)** agency view of Ask threads (rec: toggle + read-only view). Missing tables: `ask_thread`, `ask_message`.

## Interfaces this branch adds or changes
**Migrations (next free: `0042`):**
- `0038_mcp` (generated): `api_token` (`id, agency_id, user_id -> auth.user, client_id?, name 1-80, token_hash unique, token_prefix, scope read|feedback|manage, created_at, last_used_at, revoked_at`); `oauth_grant_binding` (`consent_id` text PK = `auth."oauthConsent".id`, `id` uuid unique = audit `token_id`, `oauth_client_id`, `agency_id`, `user_id`, `client_id?`, `scope`, timestamps); `mcp_rate_window` (`token_key, window_kind minute|day, window_start, count`); `audit_log.channel` (default `'web'`) + `token_id`; `recommendation.source` gains `'mcp'`.
- `0039_mcp_rls` (custom): RLS + grants (`app_user`: SELECT on `api_token` without `token_hash`, SELECT on `oauth_grant_binding`, `UPDATE (revoked_at)` on both; inserts service-role) and SQL-only `search_tsv` columns + GIN (review, recommendation, brief_item, event, alert).
- `0040_feedback_kind_created` (R12). `0041_auth_oauth` (custom): the 7 `auth."oauth*"` tables from `docs/work/phase-6-oauth-schema.sql` + GRANTs to `app_service`.
- `withTenant` also sets `app.user_id` / `app.role` (SQL `app_user_id()`, `app_role()`); `TenantScope` gained `userId`/`role`.

**`@cs/core`:** `tokens.ts` (`TokenScope`, `PAT_PREFIX='rm_pat_'`, `generatePat`, `hashPat`, `isPatFormat`, `scopeCovers`, `grantableScopes`, `effectiveScope`). Registry `Tool` gains `channels?` (default `['web']`), `audit?: 'always'|'skip-web'`, `mcpScope?` (`mcpScopeOf`); handler 4th arg `CallMeta {channel, tokenId}`; `invoke/list/describe(ctx, ..., opts?: CallOptions {channel, tokenId?, tokenScope?})`; hidden = unknown = `not_found`; audit rows carry `channel`/`tokenId`.

**`@cs/mcp` (new):** `resolveBearer`, `tokenAccess`, `touchPat`, `ResolvedToken`, `VerifyOAuth`; `createMcpServer`, `SERVER_VERSION`; `handleMcpRequest(req, McpHandlerDeps {service, registry, deps, appUrl, verifyOAuth})`; `checkRateLimit`, `RATE_LIMITS`; `toToolResult`, `RateLimitedError`; `productNameFor`, `DEFAULT_PRODUCT_NAME`. SDK pinned 1.30.1.

**`@cs/tools`:** `ToolDeps` + `appUrl?`, `embedQuery?`, `evidenceStore?`. New tools: `search`, `fetch` (ChatGPT shapes), `add_recommendation` (`['mcp']`), `create_api_token`, `list_api_tokens`, `revoke_api_token`, `list_oauth_grants`, `revoke_oauth_grant`. List tools take `cursor`, `limit` (off-web <= 50), `detail=summary|full`; rows carry `evidenceIds` + `url`. Helpers: `paging.ts`, `workspace/model-text.ts` (`forChannel`, `summaryForChannel`; d12), `access/oauth.ts`.

**Routes (`apps/web`):** `POST /mcp` (GET/DELETE 405); `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server[/api/auth]`; `/oauth/consent`; `/agency/ai`, `/c/<id>/settings/ai`; `/sign-in` resumes the OAuth authorize. `oauthProvider` plugin (`@better-auth/oauth-provider@1.7.7`, `@better-auth/utils@0.4.2` exact) with `before` hooks. Server: `server/mcp.ts`, `server/oauth-consent.ts`. E2E tag `@ai-connections`.

## Assumes from other branches
None. `phase-7-planning` (docs only) assumes our `api_token`/OAuth tables and a unified registry `not_found`; no code overlap.

## Decisions (owner-approved)
Spec d1-d13 binding (d5 allowlist, d9 rate limits, d12 redaction, d13 no validity caching). Plan-local, approved 2026-10-12:
- P1 keep `invoke/list/describe(ctx, ..., opts?)`; default channel `web`. P2 handlers get `meta`. P3 hidden = unknown; audit keeps `permission_denied`. P4 client role without `mcp` sees no tools (not 401).
- P5 camelCase inputs; `search`/`fetch` keep ChatGPT shapes. P6 GUCs + grants as in 0039. P7 binding `id` + `oauth_client_id`. P8 OAuth scope = binding scope capped by live role.
- P9 consent picker = memberships; binding written by the auth flow. P10 token tools: `read`, feature `mcp`, no guests, <= 20 active PATs per user.
- P11 `url` = `/go/<t>/<id>` for brief/brief_item/alert, else direct paths. P12 cursor base64url `{"o":offset}`; `detail` summary off-web. P13 `search_tsv` SQL-only; no ANN index. P14 `add_recommendation`.
- P15 white-label name = `branding.displayName` else "Rival Monday". P16 `embedQuery` only in `dev`. P17 rate limits count `tools/call` + `resources/read`. P18 `fetch` of global types uses the first active in-scope client.
- **Consent page (owner, 2026-10-12):** under the lead line "After you allow, you'll be sent to **{host}**." (redirect_uri host, port if non-default; omitted if unparseable); Access defaults to Read only.

Rulings (R = behaviour unless marked *process*):
- R1 channel allowlist test converges as tools land (*process*). R2 `@ai-connections` tag added with its spec (*process*). R3 owner verification names the deployed host (*docs*). R4 Task 0 setup done at kickoff (*process*).
- R5/R10 loopback DCR hook sets `native` only for public (`none`) clients with all-loopback redirects. R6 consent accept/deny via `auth().handler(new Request(...))`.
- R7 `/sign-in` resumes the OAuth authorize; plugin config adds resources/grant types. R8 test DB names end in `_test` (*process*).
- R9 authorize deletes plugin consents without an active binding; `verifyOAuth` fails closed without one. R11/R13 reviewers run `test:affected --base <task BASE>` in the background (*process*).
- R12 `feedback.kind` gains `'created'` (migration 0040). R14 Task 15 docs fixes folded into the final fix wave (*process*). R15 fix-wave scope; other triage -> backlog (*process*).

## Spike findings (condensed; SQL in `docs/work/phase-6-oauth-schema.sql`)
- **Issuer** = `<appUrl>/api/auth`; metadata at the root and the RFC 8414 path-inserted URL; PRM is hand-built.
- **Opaque tokens** (SHA-256 at rest); `requireActiveAccessToken` throws on revoked/expired/unknown/client-disabled/session-gone. `aud` = `<app>/mcp`. TTL 1 h access / 30 d refresh (rotating, needs `offline_access`).
- **Consent binding key** = `auth."oauthConsent".id` (no unique `(clientId,userId)`: newest by `updatedAt`). Consent query signed, valid 600 s.
- **Revoke** = set `revoked` on access and refresh rows; deleting the consent alone does not kill tokens.

## New backlog (target -> item)
- Later: REST API (spec §8.1). Phase 7: tier gating of `mcp`/`ask`. MCP `manage` for client roles. ANN vector index (P13). 6b: `'ask'` channel on `add_recommendation`.
- Search: pages are vector-only (empty without `embedQuery`); page EXISTS should require `embedding IS NOT NULL`; model-written brief_item/alert titles unredacted; `fetch` brief text uncapped.
- White-label/connector card: the `claude mcp add` example's server name `rival-monday` (and resource names) not white-labelled; resource screenshot mime hard-coded `image/webp`; the card says "create a token below" to agency roles on the client page.
- Hardening: `resources.ts` upsell offset-0 misattribution + unchecked `BriefView` cast; `add_recommendation` inserts not in one tx; `revoke_oauth_grant` partial failure (fail-closed); second-tab `dropUnboundConsents` race and DELETE on every authorize; member-less users can Cancel consent; `clientScope[0]` single-client assumption.
- Tests: cross-agency (binding admin, agency token, `search` clientId), P18 scoped member, client-bound `clientScope`, review cross-client leak, duplicate/other-agency evidence on `add_recommendation`, page-level `/sign-in` OAuth, exact client-role `tools/list`, `get_client_profile` regex, tools.test spy restore + skip-web failing call.
- Small: web caps (`list_clients` 1000, `list_client_competitors` 200); offset paging drift (P12); null-rating title; PRM `max-age=300`; revoke success copy undecided and persists; `test:affected` default base re-tests the whole branch.

## Owner verification steps
1. Local: with your go-ahead, `pnpm db:migrate` on `cs_dev`; `pnpm dev:web`; create a token at `/agency/ai`; `claude mcp add --transport http rival-monday http://localhost:3000/mcp --header "Authorization: Bearer rm_pat_..."`; ask "What changed at aireserv.com this month?" and check evidence ids are cited; revoke and confirm the next call fails.
2. If live: on the deployed host (e.g. https://rivalmonday.app), Claude.ai -> Add custom connector `https://<host>/mcp` -> sign in -> check the consent page names the app's redirect host -> pick workspace and access -> ask -> disconnect and confirm the next call fails.
3. Decide the revoke success copy.

## ARCHITECTURE notes for `/rm-merge`
Add `@cs/mcp` (bearer resolution, stateless per-request server, resources `evidence://`/`brief://`, 4 prompts, rate limit); registry channels/scopes/audit; the new tools; web routes and the consent flow; the new tables; migrations 0038-0041. STATE: next migration `0042`; move Phase 6 BACKLOG items done here (catalogue, `skip-web` audit, `detail`/deep links, brief tools) out and file the items above.
