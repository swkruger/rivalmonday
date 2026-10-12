# phase-8b — Read-only agency drill-down for platform admins

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8b   **Base:** main @ 6c14877
**Plan/spec:** 8b spec `docs/superpowers/specs/2026-10-12-phase-8b-support-sessions-design.md` (g1–g11); plan `docs/superpowers/plans/2026-10-12-phase-8b-support-sessions.md` (S1–S4, Tasks 0–9). Parent: 8a spec/plan on `phase-8` (`docs/superpowers/specs/2026-10-12-phase-8a-platform-console-design.md`).

## Status (overwrite)
8b spec owner-approved 2026-10-12 (support sessions = "view as agency" incl. client workspaces, read-only, reasoned, 60 min); plan written, awaiting owner approval. Execution after phase-6 + phase-8 merge.

## Next (overwrite)
1. Owner approves the 8b plan + execution method.
2. After phase-6 and phase-8 merge: Task 0 pre-flight (rebase, inventory direct service calls).

## Interfaces this branch adds or changes
None yet.

## Assumes from other branches
- **phase-8 (8a):** `platform_admin` (owner|staff|viewer), `platformRole`, `requirePlatformOperator(deps, ctx, min?)`, `recordPlatformAudit` (`tools/src/platform/audit.ts`, per-agency → target `audit_log` with `role = 'platform_<role>'`), `get_platform_agency`, `/platform/agencies/[id]` stub, `platform_audit_log`, `navFlagsFor(v, isPlatformOperator)`. 8b deepens that page.
- **phase-6:** `CallOptions { channel }`, registry `channels`/`audit`/`mcpScope`, `audit_log.channel`; `client.ask_review_allowed` + `/platform/ask[/threadId]` (audit `platform_view_ask_thread`); migrations 0038–0043.
- **phase-9 (9a):** billing panel + staff/owner actions on `/platform/agencies/[id]`; agency state `read_only`/`suspended` (`service_paused`; suspended users redirected to billing).
- **phase-7-planning (parked):** `/platform/health`; no overlap beyond nav.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope
Owner: "Read only access to agency level." 8b decides how deep and how privately a platform admin sees one agency.
- **Core §3:** Platform → Agency → Client; no platform role in the role table. (§3 AM Ask-thread reads superseded by 6b e5.)
- **§5.1 agency views:** portfolio, approval queue, prospecting, branding & voice, users/usage/limits, playbooks. **§5.2:** 11 client modules (overview … settings incl. AI connections) + evidence viewer.
- **§4.5 privacy:** reviewer names salted-hashed, never shown; PII stripped only at the model boundary (stored text stays raw); retention; deletion process. **§8.1:** every call audited. **§2.2:** "agency legal/DPA plumbing, support routing" = Phase 2 (wholesale). No support-access/impersonation/consent text in core spec.
- Later console: agency management, comms, income statement; 8b stays read-only.

### 2. Already built — reuse
- **Viewer → ctx:** `apps/web/src/server/current-viewer.ts` `getViewer` (React `cache`, per request) → `resolveViewer` (`server/viewer.ts`: `user | member-less | guest`); `requireContext()` → `{ viewer, ctx }`, member-less → `/no-access`. `AccessContext` (`packages/core/src/access.ts`): `agencyId, userId, role, clientScope, features`; `hasPermission`/`canAccessClient`. Note: 8a operators need *some* membership to get a ctx.
- **Registry:** `packages/core/src/tools.ts` `ToolRegistry.invoke(ctx, name, input)`: `permission: 'read'|'feedback'|'manage'|'agency'` + optional `feature`; **no read/write flag** — `'agency'` mixes reads and writes. Per-call audit via `createAuditSink` (`@cs/db`). Reads `callTool` (`server/tools.ts`, hidden → 404); writes `runTool`. Tenancy: `withTenant(db, {agencyId, clientScope}, fn)` (`db/src/tenant.ts`).
- **Agency page reads:** `/agency` `get_portfolio`; `/agency/usage` `get_usage`; `/agency/team` `listTeam(service, ctx)` + `list_clients`; `/agency/branding` `getAgencyBranding(service, ctx)` (direct service calls, not tools); approvals `list_brief_queue`/`get_brief_review`; alerts `list_alert_queue`; prospects `list_prospects`/`get_prospect_report`; playbooks `list_playbooks`.
- **Client reads (`/c/<id>/…`):** `get_workspace_overview`, `list_alerts/briefs/moves/recommendations/trend_reports`, `get_competitor_profile/timeline`, `list_tracked_pages`; changes `search_events`, `get_event`, `compare_snapshots`; evidence `get_evidence` + file route `app/files/evidence/[clientId]/[evidenceId]/route.ts`; `get_price_matrix`, `get_ad_activity`, `list_ads`, `get_rating_trend`, `get_theme_benchmark`, `get_geogrid`, `get_share_of_voice`, `get_move`, `get_brief`, `get_alert`, `get_trend_report`, `get_client_profile`, `get_alert_rules`.
- **Read-only injection options:** (i) platform tools reusing the queries via `deps.service` (8a); (ii) synthetic `AccessContext` for the target agency (`role 'agency_admin'`, `clientScope 'all'`) + an `operator`/`readOnly` marker that the registry checks — needs a per-tool read/write mark or read allow-list, write controls hidden; (iii) a `platform` field on phase-6 `CallOptions`.
- **Audit:** `audit_log` (actor, role, tool, input hash, outcome, rows; + phase-6 `channel`).

### 3. Binding decisions
- Root `CLAUDE.md` § Decisions; web reads = registered tools, writes via `runTool`; refusals → 404; `upsell_tag` never client-facing; `retracted_at IS NULL`.
- 8a d1–d9: d2 `platform_admin` + env owners (roles matter once writes exist); d4 `requirePlatformOperator` then `deps.service`, explicit columns, no new RLS/DB roles; d5 no writes; d7 aggregates + names/statuses only ("privacy beyond that is 8b"); d8 every platform read audited (per-agency → that agency's `audit_log`).
- 6b e5: Ask threads author-only, no agency view. e6: platform read-only view only where `client.ask_review_allowed` (default true, disclosed to client users), each open audited. e4: usage visible to platform admins.

### 4. Backlog to fold in
None on impersonation/support/operator/read-only access. Adjacent: "Soft-delete/archival before any delete feature" (`phase-7-planning`, *from Phase 1 review*) — later agency delete only.

### 5. In-flight workstreams
- `phase-8`: same routes/tools/files (`platform-console.ts`, `platform/audit.ts`, `agencies/[id]/page.tsx`, nav). 8b must stack on 8a.
- `phase-9`: same detail page (billing panel), `platform.ts`, nav; its `read_only`/`suspended` states — avoid term clash with an operator "read-only" mode; drill-down must still work for suspended agencies.
- `phase-6`: registry `CallOptions`, `audit_log.channel`, `/platform/ask`.
- Migrations: next free at execution time; phase-6 0038–0043, phase-8 two after, phase-9 more after.

### 6. Open questions for the owner
1. **What does read-only agency access mean?** (a) dedicated `/platform/agencies/<id>/…` pages (portfolio, usage, team, branding summary) built from new platform tools, no client workspaces; (b) "view as agency": existing `/agency` + `/c/<id>` pages in a read-only operator mode, all writes refused; (c) (b) incl. client workspaces. **Rec: (a)** — (b) needs a read/write mark on ~80 tools + hidden write controls.
2. **Privacy of client data:** (a) aggregates + names only (8a d7); (b) full read like an agency admin, audited; (c) per-agency consent toggle (like `ask_review_allowed`). **Rec: (a)** plus portfolio/usage figures; (c) if deeper data is ever needed.
3. **Data in scope** (if Q2 ≠ a): evidence screenshots, briefs, Ask threads (stay on 6b `/platform/ask` rules), reviewer data (never), contact emails (masked?). **Rec:** briefs + evidence metadata only; contact emails masked; reviewer data and Ask excluded.
4. **Agency visibility:** (a) audit rows only (8a d8); (b) also a "Platform access" list on the agency's audit/team page; (c) (b) + email notice to agency admins. **Rec: (b)**.
5. **Support session:** (a) open access; (b) stated reason + time-boxed session (1 h) + banner "Viewing as platform — read only"; (c) (b) only for client-level data. **Rec: (a)** for (1a); (b) if (1b/c) chosen.
6. **Which roles may drill down:** (a) all (owner|staff|viewer); (b) staff+; (c) owner only for client-level data. **Rec: (a)** for aggregates, (b) for anything deeper.
7. **Client-workspace preview "as the client sees it"** for support: (a) out of 8b; (b) in 8b, read-only, audited. **Rec: (a)**, revisit with Phase 10 support routing.
8. **MCP/API:** (a) web only (`channels: ['web']`); (b) also MCP. **Rec: (a)**.
9. **Split?** (a) single 8b; (b) 8b-1 pages / 8b-2 deeper data. **Rec: (a)** unless Q1 = (b)/(c).
