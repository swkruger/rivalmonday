# phase-6 - Remote MCP server (6a) and Ask assistant "Friday" (6b)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-6   **Base:** main @ 1c4a7fd
**Spec/plan:** 6a `docs/superpowers/{specs,plans}/2026-10-11-phase-6a-mcp*.md` (d1-d13, P1-P18); 6b `docs/superpowers/specs/2026-10-12-phase-6b-ask-design.md` (e1-e11) + `docs/superpowers/plans/2026-10-12-phase-6b-ask.md` (Tasks 0-13, Q1-Q13)

## Status (overwrite)
**6a done** (reviewed). **6b implemented (Tasks 1-13)**; final whole-branch review pending. Migrations 0038-0044 not applied to `cs_dev`. **6c = knowledge base** (own spec after 6b; e11).

## Next (overwrite)
1. Final whole-branch review (most capable model; `test:affected` + `e2e:affected --base main`) + one fix wave.
2. Brainstorm 6c (knowledge base: platform/agency/client sources; help docs, community Q&A, blogs; `[kb:]` citations).
3. After 6c: one `/rm-merge phase-6` with the owner's go-ahead (full unit + full E2E, migrate `cs_dev`), then owner verification below. Undecided copy: "Token revoked." / "App disconnected.".

## Interfaces this branch adds or changes
**Migrations (next free: `0045`):**
- `0038_mcp`: `api_token`, `oauth_grant_binding`, `mcp_rate_window`; `audit_log.channel`/`token_id`; `recommendation.source` gains `'mcp'`. `0039_mcp_rls`: RLS + grants, SQL-only `search_tsv` columns + GIN. `0040_feedback_kind_created`. `0041_auth_oauth`: 7 `auth."oauth*"` tables (`docs/work/phase-6-oauth-schema.sql`).
- `0042_ask`: `ask_thread`, `ask_message`, `ask_starter`; `client.ask_monthly_quota`, `client.ask_review_allowed`. `0043_ask_rls`: author-only RLS (no agency view), `app_client_visible`, column UPDATE grants. `0044_ask_quota_used`: SECURITY DEFINER count fn (relies on owner BYPASSRLS; `ask_message` is FORCE RLS).
- `withTenant` also sets `app.user_id`/`app.role`; `TenantScope` gained `userId`/`role`.

**Env:** `ASK_FAKE_AI` (E2E only; `parseWebEnv` throws with `VERCEL_ENV=production`; in turbo `globalPassThroughEnv` and playwright `E2E_SERVER_ENV`).

**`@cs/core`:** `tokens.ts` (PAT helpers, `scopeCovers`, `effectiveScope`); registry `Tool` gains `channels?`, `audit?`, `mcpScope?`; handler 4th arg `CallMeta`; `invoke/list/describe(ctx, ..., opts?)`; hidden = unknown = `not_found`; `isClientRole`.
**`@cs/mcp`:** `resolveBearer`, `createMcpServer`, `handleMcpRequest`, `checkRateLimit`, `productNameFor`; resources `evidence://`/`brief://`, 4 prompts. SDK pinned 1.30.1.
**`@cs/ai`:** `chatWithTools`; tasks `ask_assistant`, `ask_starters`, `ask_guard_decisions`.
**`@cs/ask` (new):** `beginTurn`, `runTurn`, citations/`groundAnswer`, starters, labels, prompt, actions; `@cs/ask/testing` `createScriptedAskAi`. Depends on `@cs/collectors` (`redactForModel`).
**`@cs/tools`:** MCP: `search`, `fetch`, `add_recommendation` (`['mcp','ask']`), token/grant tools; list tools take `cursor`/`limit`/`detail`. Ask: channel tags (Q4 set), `ASK_WRITE_TOOLS`, `GENERIC_STARTERS` (re-exported by `@cs/ask`); web tools `list_my_ask_threads`, `get_my_ask_thread`, `delete_my_ask_thread`, `get_ask_starters` (`{questions, reviewAllowed}`); platform `listReviewableAskThreads`, `getReviewableAskThread` (audit `platform_view_ask_thread`); `get_usage.questions`; `set_client_limits.askMonthlyQuota`; `update_client_profile.askReviewAllowed`; `update_agency_branding.assistantName`.
**Worker:** job `ask-starters` after a ready brief.
**Routes (`apps/web`):** `POST /mcp`; `/.well-known/oauth-*`; `/oauth/consent`; `/sign-in` resumes the OAuth authorize; `oauthProvider` plugin (`@better-auth/oauth-provider@1.7.7`, `@better-auth/utils@0.4.2`, exact pins); `/agency/ai`, `/c/<id>/settings/ai`. 6b: `POST /api/ask/turn` (SSE, header `x-ask-thread-id`, proxy-public, self-authenticating), actions `confirmAskAction`/`saveAskRecommendation`, `/c/[clientId]/ask[/threadId]`, `/platform/ask[/threadId]`, Overview Ask card, evidence-viewer ask buttons, settings fields. E2E tags `@ai-connections`, `@ask`.

## Assumes from other branches
None. `phase-7-planning` (docs only) assumes our `api_token`/OAuth tables and a unified registry `not_found`.

## Decisions (owner-approved)
Spec d1-d13 and e1-e11, plans P1-P18 and Q1-Q13 binding. Owner: one merge for all of Phase 6 after 6c; consent page lead line "After you allow, you'll be sent to **{host}**.", Access defaults to Read only; 6b Ask model sonnet-5 (probe OK for ZDR, tools, strict json_schema, caching); Q1 `ASK_FAKE_AI`.

6a rulings (condensed): P8 OAuth scope = binding scope capped by live role; P11 `url` = `/go/<t>/<id>` for brief/brief_item/alert; R5/R10 loopback DCR `native` only for public clients with loopback redirects; R6 consent via `auth().handler(new Request(...))`; R9 authorize deletes consents without an active binding, `verifyOAuth` fails closed; R12 `feedback.kind` gains `'created'`.

6b implementation rulings:
- T5 `groundAnswer` groups claims by evidence string (one `supportCheck` per distinct evidence; uncited sentences in one call).
- T6 evidence-text fallback via `toolDeps` under `get_evidence` access checks, `redactForModel`, cap 4000; a user message paired with a skipped assistant row is dropped from history.
- T3 `0044_ask_quota_used` added (author-only RLS makes plain counts per-user); `add_recommendation` already writes `source: meta.channel`.
- T1 null-content throw relaxed only when `tool_calls` present. T3 `monthStart` exported from `@cs/tools`; `update_client_profile` lives in `onboarding.ts`.
- T8 `x-ask-thread-id` header carries the new thread id; `saveAskRecommendation` input matches `add_recommendation` limits. T8 viewer = `getViewer()/requireContext()`; guest = `viewer.kind 'guest'`.
- T10 "Add recommendation" gated by the tool's real permission (feedback + dashboard).
- T12 `getViewerForClient` picks the membership by body `clientId` among the user's own (multi-membership resolved for Ask only).

## Spike findings (condensed)
Issuer `<appUrl>/api/auth`; PRM hand-built; opaque tokens hashed, `aud` = `<app>/mcp`, TTL 1 h / 30 d rotating; consent binding key = `auth."oauthConsent".id`; revoke = set `revoked` on access + refresh rows.

## New backlog (target -> item)
- Later: REST API (spec §8.1). Phase 7: tier gating of `mcp`/`ask`. MCP `manage` for client roles. ANN vector index. Brief writers -> sonnet-5 re-move. Ask request body-size cap (route reads body twice). Multi-membership fix is Ask-only; other routes still pick one.
- 6c: brief input e11 (knowledge base feeds the Ask prompt/citations).
- MCP search: vector-only pages (empty without `embedQuery`); model-written titles unredacted; `fetch` brief text uncapped; connector card server name `rival-monday` not white-labelled; screenshot mime hard-coded `image/webp`.
- MCP hardening: `resources.ts` upsell offset-0 misattribution; `add_recommendation` not one tx; `revoke_oauth_grant` partial failure; consent second-tab race; `clientScope[0]` single-client assumption.
- MCP tests: cross-agency, P18 scoped member, review cross-client leak, page-level `/sign-in` OAuth, exact client-role `tools/list`.
- Ask hardening: widen composite FK to `(id,user_id,client_id,agency_id)`; confirm should allowlist `action.tool` against `ASK_WRITE_TOOLS` and check action `clientId` = thread's; agency user with unknown clientId gets raw FK 23503; deadline checked only before model calls; `enqueueAskStarters` skipped if `notifyBriefOutcome` throws; `dataBlock tool=` name unescaped.
- Ask grounding: sentence split on "1."/"e.g."; nested-bullet indent lost; empty-evidence verifier call; fallback stores metadata-only line for html/screenshot evidence; `splitUnits` exported.
- Ask UI: thread delete one-click, error only in tooltip; save dialog allows duplicate saves; pre-persist error has empty `messageId`; quota 0 shows "N of 0"; `assistantName` read twice.
- Ask tests: ask-rls WITH CHECK rejection + user-delete cascade; ThreadList/SaveDialog/StarterChips components; E2E chip -> auto-send; `expectNoUsageNumbers` scans only main; settings toggle test not retry-safe.

## Owner verification steps
1. MCP local: with your go-ahead, `pnpm db:migrate` on `cs_dev` (incl. 0042-0044); `pnpm dev:web`; token at `/agency/ai`; `claude mcp add --transport http rival-monday http://localhost:3000/mcp --header "Authorization: Bearer rm_pat_..."`; ask "What changed at aireserv.com this month?", check evidence ids; revoke, confirm the next call fails.
2. If live: Claude.ai -> custom connector `https://<host>/mcp` -> sign in -> consent page names the redirect host -> pick workspace/access -> ask -> disconnect, confirm failure.
3. Ask: on a client, ask a question; see a cited answer and evidence chip; save as recommendation; confirm a proposed write. As a client user at quota, see the exact quota copy (no counts). As platform admin open `/platform/ask`.
4. Decide the revoke success copy.

## ARCHITECTURE notes for `/rm-merge`
Add `@cs/mcp` (bearer resolution, stateless per-request server, resources `evidence://`/`brief://`, 4 prompts, rate limit), registry channels/scopes/audit, new tools, consent flow, tables. Add `@cs/ask` (verify-then-send turns, quota, actions, starters) and the Ask web surface (SSE route, `/c/<id>/ask`, `/platform/ask`, Overview card). STATE: next migration `0045`; move Phase 6 BACKLOG items done here out and file the items above.
