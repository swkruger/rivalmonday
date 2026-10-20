# phase-15b2 — Help content wave: guides, tips, descriptions, empty states for every page

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-15b2   **Base:** main @ 00e8e02a
**Plan/spec:** [15b-2 spec](../superpowers/specs/2026-10-20-phase-15b2-help-content-design.md) (C1–C7) on [15b spec](../superpowers/specs/2026-10-19-phase-15b-help-system-design.md) §7–§8 · [plan](../superpowers/plans/2026-10-20-phase-15b2-help-content.md) (T0–T11)

## Status (overwrite)
2026-10-20: brief, spec addendum (owner-approved) and lean plan (12 tasks) committed; **plan awaiting owner review** before execution. No code. Worktree installed; test DB `cs_phase_15b2_test` (local cluster, has pgboss). E2E on `E2E_PORT=3101`.

## Next (overwrite)
1. Owner reviews the plan → execute via `superpowers:subagent-driven-development` from Task 0 (pre-flight: rebase, recount pages, size the terminology grep).
2. After 15b-2 merges: 15b-3 (topic rename, spec C7) plan; then 15c (rebases on 15b-2).

## Interfaces this branch adds or changes
Planned (no migration; next free 0081): `list_help_guides` returns `page:account.%` in every context; Help pages "Your account" group; copy split `apps/web/src/help/copy/{client,agency,platform,account}.ts`; ~61 page keys + guides; glossary `theme` → `topic`; `apps/web/src/help/coverage.test.ts`; `PressureBadge`/approval confidence text labels; heatmap legend; Setup "Advanced" disclosure. User-facing "Theme" → "topic" only (routes/tools/DB keep `theme` until 15b-3).

## Assumes from other branches
- **phase-7** (7a1 executing): no `page.tsx`/help files. Touches `server/tools.ts`, `server/env.ts`, `next.config.ts`, `core/src/index.ts` (one line), Sentry files. Its `0080_runtime_roles`/`0081_lifecycle` collide with main's `0080_kb_help_key`; it renumbers to 0081/0082. Add no migration here without re-checking.
- **phase-7-planning**: parked, docs only; no overlap.
- **13a** (not started): title template and error pages touch the same page files.
- **15c** (not started): overlaps nearly every page (error/404/loading, StatusChip, miles/formatters, ConfirmDialog, SaveBar). See Q2.

## Decisions (owner-approved)
Binding: Brief § 4. New 2026-10-20 (spec C1–C7): C1 one branch, 4 batches (client/agency/platform+account/terminology) each with a sign-off doc, coverage test last, one merge; C2 15b-2 before 15c; C3 user-facing terminology now, identifiers in 15b-3; C4 only (H) structural items (labels beside colour, heatmap legend, Setup Advanced); C5 every PageHeader page gets a guide except Help pages + `/kb/[id]`; C6 "Your account" group on all Help pages; C7 15b-3 full rename incl. DB/tools/packs with MCP aliases, LLM question keys/gold labels/model_batch names stay `theme`.

## New backlog / Owner verification
New backlog: 15b-3 → topic rename (spec C7); 15c → non-(H) structural audit items (Ask visibility line, alert-rules band bar, …). Verification: four sign-off docs (C1); after merge `pnpm kb:seed` on `cs_dev`.

## Brief

### 1. Scope
See the [15b-2 spec](../superpowers/specs/2026-10-20-phase-15b2-help-content-design.md) and [15b spec](../superpowers/specs/2026-10-19-phase-15b-help-system-design.md) §7–§8.

### 2. Page inventory (64 keys `page:<ctx>.<id>`; 3 pilot done, 61 to write)
- **platform 17:** overview, agencies, agencies.detail, billing, leads, reviews, themes, ask, ask.thread, knowledge, knowledge.new, knowledge.detail, health, costs, verticals (14b), runbook (14b).
- **agency 18:** portfolio, clients.new, approvals, approvals.detail, alerts, prospects, prospects.new, prospects.detail, leads, settings.{ai, billing, branding, intake, platform-access, runbook (14b), slack-teams, team, usage}.
- **client 25:** overview*, competitors, competitors.detail, changes*, pricing, ads, reviews*, rankings, moves, recommendations, ask, ask.thread, briefs, briefs.detail, alerts.detail, reports.detail, evidence.detail, pitch-snapshot, setup, settings.{profile, delivery, alerts, ai, billing, runbook (14b)}. (*pilot.) Many need agency + client guides.
- **account 4:** inbox, settings.notifications, kb.detail, onboarding.
- **No PageHeader:** `/agency/settings`, `/c/[id]/settings` (redirects), `/paused`, `/`, public/auth pages. Help pages x3 have one (guide-exempt, Q4). New-business-type panel (`components/new-business-type.tsx`) is a component: no key.

### 3. Already built: reuse
- `apps/web/src/components/help/` (`help-tip`, `field-hint`, `empty-state`, `page-guide`, `help-index`, `help-context`), `components/page-header.tsx`, `apps/web/src/help/copy/{client,index}.ts`, `server/help.ts` (`helpGuides`), `packages/tools/src/tools/help.ts`, `kb/seed.ts`, `packages/core/src/help/glossary.ts`, guides `docs/help/pages/<ctx>.<page>.<audience>.md`.
- Wiring example, `c/[clientId]/reviews/page.tsx`: `HELP_KEY='page:client.reviews'`, `COPY=PAGE_COPY[...]`, `<PageHeader helpKey guide={guides.has(HELP_KEY)}>`, `StatCard help={<HelpTip tip="client.reviews.newReviews"/>}`, `<EmptyState/>`.
- Extend: `packages/tools/src/kb/help-content.test.ts`, `c/[clientId]/help-pilot.test.tsx`, `app/white-label-leak.test.tsx`, `apps/web/e2e/help.spec.ts`, `packages/demo/src/coverage.ts` (`helpGuidesEmpty` -> non-empty).

### 4. Binding decisions (never re-open)
Root `CLAUDE.md` UX & IA (Phase 15) and Help (15b) lines; spec B1-B10 (audience rules, KB-backed guides, TS constants, glossary one source, neutral client-facing fallback); sign-off 2026-10-20: glossary has no placeholders; Theme -> "topic" everywhere in 15b-2; Confidence stays `all`; "After AM check" -> "I review alerts first"; "Friday" -> `assistantName`; seat = active client ($229, 3 seats, $99 extra).

### 5. Backlog to fold in (verbatim, `docs/BACKLOG.md`)
- [ ] **15b-2** help content wave: guides, `?` tips and teaching `EmptyState`s on every page (incl. 14b pages: Business types, platform/agency/client Runbook, new-business-type panel), glossary/terminology pass, audit §2–§3 items tagged 15b — [15b spec](superpowers/specs/2026-10-19-phase-15b-help-system-design.md) §7. Rename "Theme" → "topic" everywhere (UI, glossary, guides, filters, heatmap; owner 2026-10-20). Decide where `page:account.*` guides list; enforce the coverage test (spec §8); strip Markdown from Help search excerpts; check the Help search button focus ring — *phase-15b*
- [ ] 13a: client-visible "Rival Monday" fallbacks in MCP `serverInfo`/tool descriptions, `.well-known/oauth-protected-resource` `resource_name`, agency-facing KB `{{product}}` (client-facing KB help now falls back to "your agency"; `kbNamesFor` agency-facing still reads "Rival Monday") (only when no agency name resolves; the Ask system prompt now falls back to `agency.name`, 2026-10-19) — *phase-15a*
- [ ] Soon (15b-1): `c/[clientId]/layout.tsx` adds an audited `get_client_profile` read per agency request (resolve the name from the switcher list instead); seed imports `PAGE_HELP_KEY` from `tools/help` (move to a shared module); `docs/help/asking-the-assistant.md` "Cancelled." spelling — *phase-15b*
- [ ] Unscheduled: product tour (Overview, Portfolio); agency help override editor; cross-device pinned/recent clients; enterprise custom roles, multi-agency switcher, audit-log page; switcher "jump to any agency" via support session; Ask review to-do state + badge — *phase-15 decisions*
- [ ] Unscheduled (15b): console editor for platform guides; help-usage analytics; first-visit "new" hints — *phase-15b*
- [ ] **UI/UX review against Mobbin** (Mobbin MCP): optional cross-check of 15b/15c against real-world app patterns (the Phase 15 designer audit replaced the main review) — *owner, 2026-10-17*

**Audit items tagged 15b** (ux-audit §2-§3; H = high):
- **Platform:** overview "Last 28 days" hint (H); support dialog lacks 60 min/read-only/audited; billing comma-separated UUIDs; theme/topic/unthemed.
- **Agency:** PressureBadge colour-only (H); thin portfolio empty state; vertical/service type naming; "Friday" in Approvals/Alerts; confidence amber border (H); score 70+/17:00 digest; Convert/"Accept and invite" copy; Cap/Limit labels; runbook placeholder preview; "seat" (H); AI access levels; webhook how-to; "includes 3 clients" vs seats (H); slug rename; onboarding Plan price.
- **Client:** Overview pressure/"N high"/price moves/first moves; tiers, "Rated Mon 13 Oct", empty next step; profile pressure (H); Changes score scale (H), route pills; Pricing pill/"Your service"; Ads targeting repeat; Reviews heatmap (H), SelfNotice; Rankings jargon (H); Moves "N signals", statuses; Ask visibility line + branding fallback; Evidence terms; Setup lat/lng/km/place id (H; miles = 15c); Profile "15 km · 0 ZIP codes", contact link; Delivery "After AM check" (H), 17:00 zone; Alert rules band bar.
- **Account:** notifications "Client alerts (agency)", "Rank scan skipped".
- **Terminology:** competitor/Top rival; change/move/signal/first steps; brief/report/alert; business type; seat; paused; topic; `assistantName`.

### 6. Open questions for the owner
All answered 2026-10-20 — see Decisions (spec C1–C7).
