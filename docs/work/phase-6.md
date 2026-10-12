# phase-6 - MCP server & Ask assistant "Friday"

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-6   **Base:** main @ 1c4a7fd
**Plan/spec:** not yet written

## Status (overwrite)
Kicked off 2026-10-11; brief below. No spec, plan or code yet.

## Next (overwrite)
Owner answers the open questions (Q1 first) in `superpowers:brainstorming`; then spec (new decisions only).

## Interfaces this branch adds or changes
None yet. Next free migration: **`0038`** (latest applied `0037_agency_ops_rls.sql`).

## Assumes from other branches
None: `git branch --no-merged main` lists no other branch (2026-10-11).

## Decisions (owner-approved)
None yet.

## New backlog (target -> item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope (roadmap row 6, spec §8.2-8.4, ~3 wks)
- **Catalogue (§8.2):** add `search` (semantic over evidence text) + `fetch` (any item by id); map `update_service_area`/`update_services` (have `update_client_profile`), `pin_page` (= `set_page_pin`), `run_prospecting_brief` (= `run_prospect_snapshot`). Results carry `evidence_ids` + deep links; lists paginate with `detail=summary|full`.
- **MCP (§8.3):** Streamable HTTP `/mcp`, stateless, official TS SDK, Zod->JSON Schema; OAuth 2.1 (PKCE, DCR) + consent picking the client workspace, scopes `read`/`feedback`/`manage`; PATs; resources `evidence://{id}`, `brief://{id}`; 4 prompts; ChatGPT-shaped `search`/`fetch`; white-label names; tier/`mcp`-flag gating, per-token rate limits, metering; typed errors, no existence leaks.
- **Ask (§8.4, §3):** persisted per-client threads, streaming, tools filtered by access context, UI-confirmed writes; starter questions; grounding (cited ids + Jev Noul post-check, unsupported sentences replaced, "Possible reason"); injection defence; quota, prompt caching, <= 8 steps; agency voice; agency thread visibility on by default, disclosed, per-client toggle.
- **UI (§5.2):** module 10 Ask, Overview starter questions, evidence-viewer buttons, AI connections (module 11).

### 2. Already built - reuse, don't rebuild
- `@cs/core`: `tools.ts` (registry, `ToolError` codes incl. `rate_limited`/`quota_exceeded`, audit), `access.ts` (`FEATURES` has `ask`, `mcp`), `links.ts` + `/go/<target>/<id>` deep links.
- `@cs/tools`: `registry.ts`, `tools/all.ts`, `tools/schemas.ts`, `workspace/scope.ts`, ~80 tools (briefs, alerts, recommendations, `submit_feedback`, events/evidence, all data views).
- `apps/web/src/server/`: `run-tool.ts`, `tools.ts` (`callTool`, `isHiddenToolError`), `current-viewer.ts`, Better Auth 1.7.7 (`auth.ts`, `auth-options.ts`, schema `auth`; no OAuth-provider plugin yet).
- `@cs/ai`: `config/ai.yaml` `ask_assistant` (sonnet-5, unverified), OpenRouter chat/embeddings, Jev cascade, `llm_call` ledger; pgvector `embedding` in `db/src/schema/engine.ts`.
- `redactForModel`: `packages/collectors/src/evidence/model-privacy.ts`.
- Usage placeholder `questions: { used: null, quota: null }` (`tools/usage.ts`); limits `set_client_limits`, `tools/src/limits.ts`. `recommendation.source` allows `'ask'`.
- Missing tables (§10.4): `ask_thread`, `ask_message`, `api_token`, `oauth_client`.
- UI: `/c/[clientId]/settings/ai/page.tsx` placeholder, `EvidenceChips`, evidence viewer, `@cs/ui`; register screens in `packages/demo/src/coverage.ts`.

### 3. Binding decisions (do not re-open)
- Better Auth self-hosted, hosts the MCP OAuth provider; access in own `membership` (CLAUDE.md; 5a d1).
- `@cs/tools` shared by web/MCP/Ask, `@cs/core` registry mechanics (5a d9); web writes via `runTool`.
- OpenRouter + Jev cascade; tau 0.85 fixed. `redactForModel`; `upsell_tag` agency-only; filter `retracted_at IS NULL`, `client.status = 'active'`.
- Page refusals 404; typed errors, no existence leaks (§11). Friday renamable, orange pill.

### 4. Backlog to fold in (verbatim, BACKLOG § Phase 6)
Tools & registry:
- [ ] Registry reveals `not_found` vs `permission_denied`, so tool names can be enumerated — *from Phase 1 review*
- [ ] `countRows` only recognises `{items}` outputs — *from Phase 1 review*
- [ ] Log the original handler error when the audit write also fails — *from Phase 1 review*
- [ ] Audit-exempt read class for polled/navigation reads: `get_competitor_search_status` writes ≈ 15–40 `audit_log` rows per search; `(app)/layout.tsx`'s `list_clients` writes one per agency navigation — *from 5a, 5b-1 owner verification*
- [ ] List tools' `detail=summary|full`, and dashboard deep links in results — *from 5c-2 (decision 16)*
- [ ] Brief tools in the catalogue (`list_briefs`, `get_brief`, …; §8.2) — check what 5a already registered — *from 4a "Not in 4a"*
- [ ] Every new read path over `brief_item`/`recommendation` strips `upsell_tag` for client roles (spec §8.5; RLS can't hide a column) — *from 4a cross-phase*
- [ ] Client-facing readers filter by status: `brief` approved/sent, items `active`, hide `feedback`/`playbook_override`; `alert` delivered only; `trend_report` — or tighten RLS — *from 4a/4b cross-phase*
- [ ] Renderers sort brief items by `ord`; never assume ords are 0-based or contiguous — *from 4a cross-phase*

Ask:
- [ ] `ask_assistant` still routes to `anthropic/claude-sonnet-5`: re-probe ZDR + strict `json_schema` on OpenRouter first (vendor-APIs doc, "Verified 2026-10-03 — Phase 4a"); `brief_writer`/`playbook_writer`/`theme_discovery` moved to sonnet-4.6 for the same reason — *from 4a*
- [ ] Ask "save as recommendation" (`recommendation.source = 'ask'` already allowed) — *from 4a "Not in 4a"*
- [ ] "Add recommendation" and "Ask Friday" buttons in the evidence viewer — *from 5c-1 (decision 19)*
- [ ] Ask question quota (5b-2 left a placeholder); decide with the owner whether pausing Ask at 100 % of cap is needed before Phase 7 — *from 5b-2 (decision 18)*
- [ ] `ask` client-feature switch on Profile → Client features (kept on save today) ships with the Ask UI — *from HANDOVER §5, 2026-10-11*
- [ ] `/c/<id>/settings/ai` "AI connections" placeholder becomes real — *from HANDOVER §5*

### 5. In-flight workstreams
Confirmed: no unmerged branches besides `phase-6` (which equals main). Next migration `0038`.

### 6. Open questions for the owner
1. **Split?** (a) 6a catalogue hardening + MCP/OAuth/PATs, 6b Ask/Friday + UI; (b) 6a catalogue, 6b MCP, 6c Ask; (c) one phase. **Rec: (a).**
2. **Where MCP runs:** (a) `/mcp` route in `apps/web` (shares Better Auth), MCP code in its own package; (b) separate `apps/mcp` (§10.1). **Rec: (a).**
3. **OAuth 2.1 + DCR:** (a) Better Auth OAuth-provider/MCP plugin after a spike (PKCE, DCR, consent + workspace pick, refresh); (b) hand-rolled; (c) Auth.js + OAuth server (§14). **Rec: (a), (c) if spike fails.**
4. **Token scope:** (a) each grant/PAT = one user + one client; (b) agency tokens span allowed clients, tools take `client_id`; (c) agency's choice. **Rec: (b) agency roles, (a) client roles.**
5. **`search` backend:** (a) pgvector; (b) full-text now, semantic later; (c) hybrid. **Rec: (c) if embeddings cover evidence text, else (b).**
6. **Ask model:** (a) re-probe sonnet-5 ZDR first, else sonnet-4.6; (b) sonnet-4.6 now. **Rec: (a).**
7. **Grounding vs streaming:** (a) stream tool progress, verify, then stream the verified answer; (b) stream draft, strike unsupported; (c) verify per sentence. **Rec: (a).**
8. **Quota:** (a) per-client monthly question limit, hard stop; budget-cap pause stays Phase 7; (b) also pause at 100 % cap now; (c) per-tier (needs tiers). **Rec: (a).**
9. **Writes in Ask/MCP:** (a) allowlist (save as recommendation, `update_recommendation_status`, `submit_feedback`, `set_alert_rules`); (b) all the role permits. **Rec: (a).**
10. **Agency view of Ask threads:** (a) toggle + read-only agency view in the Ask phase; (b) toggle now, view later. **Rec: (a).**
11. **Audit-exempt reads:** (a) `noAudit` on named web polled/nav reads (MCP/Ask always audited); (b) sampling. **Rec: (a).**
12. **REST (§8.1):** (a) out of Phase 6; (b) thin REST over the registry. **Rec: (a).**
