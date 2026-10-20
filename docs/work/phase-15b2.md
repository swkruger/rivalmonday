# phase-15b2 — Help content wave: guides, tips, descriptions, empty states for every page

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-15b2   **Base:** main @ 00e8e02a
**Plan/spec:** [15b spec](../superpowers/specs/2026-10-19-phase-15b-help-system-design.md) §7–§8 (plan not written; 15b-1 plan is the pattern)

## Status (overwrite)
Kickoff 2026-10-20: brief written, nothing built.

## Next (overwrite)
Owner answers Brief § 6; then brainstorming -> lean plan -> approval.

## Interfaces this branch adds or changes
Expected: ~61 `PAGE_COPY` keys (`apps/web/src/help/copy/`), ~100 guides in `docs/help/pages/`, glossary `theme` -> `topic`, coverage test, demo coverage entries. No migration (next free: 0081).

## Assumes from other branches
- **phase-7** (7a1 executing): no `page.tsx`/help files. Touches `server/tools.ts`, `server/env.ts`, `next.config.ts`, `core/src/index.ts` (one line), Sentry files. Its `0080_runtime_roles`/`0081_lifecycle` collide with main's `0080_kb_help_key`; it renumbers to 0081/0082. Add no migration here without re-checking.
- **phase-7-planning**: parked, docs only; no overlap.
- **13a** (not started): title template and error pages touch the same page files.
- **15c** (not started): overlaps nearly every page (error/404/loading, StatusChip, miles/formatters, ConfirmDialog, SaveBar). See Q2.

## Decisions (owner-approved)
Binding ones: Brief § 4. None new.

## New backlog / Owner verification
None yet. Verification: per-batch sign-off docs (B3), archived in `docs/archive/`.

## Brief

### 1. Scope
- **Spec §7:** every `PageHeader` page gets `helpKey` + `guide={guides.has(KEY)}`, a `PAGE_COPY` description, tips for audit-named terms/metrics, `EmptyState` copy and a guide (`all` or per audience, B2); includes 14b pages and audit §3 terminology. Sign-off per batch (B3).
- **§8:** coverage test enforced now: every `PageHeader` page has a `helpKey`; every used key has a guide per reachable audience; every `TipKey` exists. Leak test covers new copy; E2E per spec.
- **Roadmap row 15** (15b-2 "to be written"); **Phase 15 spec** D6 (help layers 1-4), D7 (platform-authored, placeholders, keyed `page:<ctx>.<page>`), §4 (glossary/terminology, one guide per key).

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
1. **Batching.** (a) one branch/plan, task groups by context (client, agency, platform + account, glossary), a sign-off doc each, coverage test last, one merge; (b) a branch per context; (c) one big sign-off. **Recommend (a):** the coverage test only passes at the end.
2. **Order vs 15c.** (a) 15b-2 first (edits sit at page tops), 15c rebases; (b) 15c first; (c) combined. **Recommend (a),** copy/terminology only.
3. **Structural 15b audit items** (colour-only badges, Ask visibility line, band bar, "Advanced" setup fields). (a) all; (b) none, to 15c; (c) (H) items only. **Recommend (c);** miles stay 15c.
4. **Coverage vs every page.** (a) every page incl. Help pages; (b) tiny exempt list (Help x3, `kb.detail`), short guides elsewhere incl. detail pages, panel via FieldHints + parent guides; (c) detail pages reuse parent guide. **Recommend (b).**
5. **`page:account.*` listing.** (a) "Your account" group on all Help pages, `onboarding` under agency "Other"; (b) agency/client only; (c) existing "Settings"/"Other". **Recommend (a).**
6. **Theme -> topic depth.** (a) UI strings, glossary, guides, filters, heatmap only; (b) (a) plus route `/platform/themes` -> `/platform/topics` (redirect) and key; (c) also DB/tools/packs. **Recommend (b):** (c) is a migration and MCP change for no user value.
