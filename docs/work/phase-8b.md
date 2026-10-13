# phase-8b — Read-only agency drill-down for platform admins

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8b   **Base:** phase-8 @ 213abd2 (stacked; main @ 5aedcb6)
**Plan/spec:** 8b spec `docs/superpowers/specs/2026-10-12-phase-8b-support-sessions-design.md` (g1–g11); plan `docs/superpowers/plans/2026-10-12-phase-8b-support-sessions.md` (S1–S4, Tasks 0–9). Parent: 8a spec/plan on `phase-8` (`docs/superpowers/specs/2026-10-12-phase-8a-platform-console-design.md`).

## Status (overwrite)
Execution started 2026-10-13, **stacked on `phase-8`** (owner go-ahead: build 8b now, verify + merge phase-8 then 8b). phase-6 is on main. Plan owner-approved 2026-10-12. **Task 0 done** 2026-10-13: findings below; `pnpm test:affected` (base = main, so all of 8a too; 14 packages) 2,057/2,058 passed — only the known `@cs/engine` `score-stage.test.ts` date time-bomb (fails on main too).

## Next (overwrite)
1. Settle the "Design gaps" below (controller/owner) and patch Tasks 1–9 paths/names, then SDD Tasks 1–9 (Tasks 1+2 in one reviewer pass).
2. Merge order: phase-8 first, then rebase 8b on main and `/rm-merge phase-8b`.

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

## Pre-flight findings (Task 0)
Full report: `.superpowers/sdd/2026-10-12-phase-8b-support-sessions/task-0-report.md` (local). Not rebased (stacked on `phase-8` @ 213abd2); no phase-9 branch exists.

**Plan name/path corrections:** `buildAccessContext` → `createAccessContext` (`@cs/core`); `ALL_FEATURES` → `FEATURES`; tool type `Tool` → `ToolDefinition` (`toolkit<ToolDeps>().defineTool`); cookie secret `serverEnv().BETTER_AUTH_SECRET` → `webEnv().authSecret` (`@/server/env`); `platformRole(deps, ctx)` takes a ctx, not a userId; `ToolDeps.platformAdmins` ✔; `AuditEvent.role` is `Role` → widen for `'platform_support'`. Ask tools are **not** `ask_*`: `list_my_ask_threads`, `get_my_ask_thread`, `delete_my_ask_thread`, `get_ask_starters` → use an explicit exported set. Migrations: **0049** (+0050 RLS); pattern = `REVOKE ALL … FROM app_user` + ENABLE/FORCE RLS (0034/0048). Activity feed is computed: extend `ACTIVITY_KINDS` (`tools/platform-console.ts`) + `ActivityKind` in `platform/_components/activity-feed.tsx`. 106 tools / 35 files (≈47 write, 59 read); no tool output has an email field (masking = direct paths only). E2E: add `@support` to `KNOWN_TAGS` + rules.

**S4 (confirmed):** `(app)/layout.tsx` and every `/platform/*` page call `requireContext()` → member-less operators get `/no-access`; platform tools are `permission: 'agency'`, so operators need an agency-role membership today.

**Design gaps to settle before Tasks 5–7:**
1. `/platform/*`, the Exit route and `start/end_support_session` must run on the operator's own ctx, not the support ctx (else operator writes incl. Exit and "replace" are refused `read_only_session`; `getReviewableAskThread` audits into the target agency).
2. Cookies can't be set/cleared during Server Component render → expired/revoked/invalid handling must redirect to a route handler that ends the row + clears the cookie.
3. Email can't use `notify()`/outbox (`notification.client_id NOT NULL`, `AGENCY_KINDS`, contact recipients) → send directly via the web email transport (magic-link precedent) or add a migration.
4. Support viewer needs `ctx` and `name` (used by `theme.ts`, files/go routes, inbox, top-bar); resolve it inside `viewerWith` so `getViewerForClient` sees it too.
5. Task 1 breaks typecheck until Task 2 (106 defs + 5 test files with inline tools) → one reviewer pass.
6. `toFormResult` maps `read_only_session` to "Not found"; `callTool` would 500 → map to g10 copy.

**Direct-call inventory (no registry):**
| Where | Call | R/W | Emails | Action |
|---|---|---|---|---|
| `(app)/layout.tsx:36` | `unreadCount` (own inbox) | R | – | ok |
| `(app)/layout.tsx:37` | `isPlatformOperator` only for `kind==='user'` | R | – | "Back to platform" |
| `server/theme.ts:16` | `getAgencyBranding(viewer.ctx)` | R | – | ok (g8) |
| `agency/branding/page.tsx:12` | `getAgencyBranding` | R | – | ok |
| `agency/team/page.tsx:22` | `listTeam` | R | **members, `name‖email`, invites, dialogs** | mask |
| `agency/webhooks/page.tsx:15` | `listWebhooks` | R | – (hook URLs) | ok |
| `c/[id]/settings/delivery/page.tsx:21` | `listClientRecipients` | R | **table + dialog** | mask |
| `c/[id]/ask/ask-screen.tsx:34`, `evidence/[id]/page.tsx:51` | `assistantNameFor`/`productNameFor` | R | – | Ask 404s today → private copy |
| `inbox/page.tsx:16` · `inbox/actions.ts:15-26` | `listInbox` · `markRead`/`markAllRead` | R · **W direct** | – | operator's own rows; 404 in session |
| `c/[id]/ask/actions.ts:31,59,74` | raw UPDATE/INSERT `ask_message` | **W direct** | – | gated `kind!=='user'` ✔ |
| `files/{brief,report}/[id]/route.ts` → `servePdf` | read tools + **enqueue PDF job** | R + **W on GET** | – | decide allow/refuse |
| `files/evidence/…/route.ts` → `serveEvidence` | `get_evidence` + store | R | – | ok |
| `go/[target]/[id]/route.ts:30` | `goDestination` (withTenant select) | R | – | ok |
| `api/ask/turn` → `handleAskTurn` | begin/run turn | **W** | – | 404 non-`user` ✔ |
| `(app)/actions.ts:22` | `endSession` sign-out | cookie | – | also clear `rm_support` |
| `platform/ask/*` | `list/getReviewableAskThread` (audit → `ctx.agencyId`) | R | – | operator ctx only |

No render path writes seen/last-viewed state. Every server action under `agency/**` and `c/**` uses `runTool` except the gated Ask confirm SQL; `toggleWebhookAction`/`setPrefAction` ignore refusals.

## Brief

### 1. Scope
Owner: "Read only access to agency level." 8b decides how deep and how privately a platform admin sees one agency.
- **Core §3:** Platform → Agency → Client; no platform role in the role table. (§3 AM Ask-thread reads superseded by 6b e5.)
- **§5.1 agency views:** portfolio, approval queue, prospecting, branding & voice, users/usage/limits, playbooks. **§5.2:** 11 client modules (overview … settings incl. AI connections) + evidence viewer.
- **§4.5 privacy:** reviewer names salted-hashed, never shown; PII stripped only at the model boundary (stored text stays raw); retention; deletion process. **§8.1:** every call audited. **§2.2:** "agency legal/DPA plumbing, support routing" = Phase 2 (wholesale). No support-access/impersonation/consent text in core spec.
- Later console: agency management, comms, income statement; 8b stays read-only.

### 2. Already built — superseded by the plan and "Pre-flight findings (Task 0)".

### 3. Binding decisions
- Root `CLAUDE.md` § Decisions; web reads = registered tools, writes via `runTool`; refusals → 404; `upsell_tag` never client-facing; `retracted_at IS NULL`.
- 8a d1–d9: d2 `platform_admin` + env owners (roles matter once writes exist); d4 `requirePlatformOperator` then `deps.service`, explicit columns, no new RLS/DB roles; d5 no writes; d7 aggregates + names/statuses only ("privacy beyond that is 8b"); d8 every platform read audited (per-agency → that agency's `audit_log`).
- 6b e5: Ask threads author-only, no agency view. e6: platform read-only view only where `client.ask_review_allowed` (default true, disclosed to client users), each open audited. e4: usage visible to platform admins.

### 4. Backlog to fold in
None on impersonation/support/operator/read-only access. Adjacent: "Soft-delete/archival before any delete feature" (`phase-7-planning`, *from Phase 1 review*) — later agency delete only.

### 5. In-flight workstreams — see "Assumes from other branches".

### 6. Open questions — answered by the spec (g1–g11, owner-approved 2026-10-12).
