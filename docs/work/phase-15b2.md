# phase-15b2 — Help content wave: guides, tips, descriptions, empty states for every page

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-15b2   **Base:** main @ 00e8e02a
**Plan/spec:** [15b-2 spec](../superpowers/specs/2026-10-20-phase-15b2-help-content-design.md) (C1–C7) on [15b spec](../superpowers/specs/2026-10-19-phase-15b-help-system-design.md) §7–§8 · [plan](../superpowers/plans/2026-10-20-phase-15b2-help-content.md) (T0–T11)

## Status (overwrite)
2026-10-21: **built — all tasks T0–T10 done (SDD, each task reviewed), final whole-branch review (Opus) + one fix wave done.** Main not moved since base (00e8e02a). Final checks: `test:affected --base main` green after the fix wave (`@cs/web` full unit 1960/1960; other packages green at the final review), `e2e:affected --base main --full` 121/121. Test DB `cs_phase_15b2_test`, `E2E_PORT=3101`. Awaiting owner copy sign-off + merge go-ahead.

## Next (overwrite)
1. Owner: sign off the four copy docs (`docs/archive/phase-15b2-copy-signoff-{client,agency,platform-account,terminology}.md`) incl. their "Decisions for the owner" rows (Business type relabel, neutral Platform access label, agency-only alert-cap line, quiet-hours hint, First moves vs First steps).
2. `/rm-merge phase-15b2` on the owner's go-ahead (full unit + full E2E there). After merge: `pnpm kb:seed` on `cs_dev`.
3. Then 15b-3 (topic rename, spec C7) plan; 15c rebases on 15b-2.

## Interfaces this branch adds or changes
No migration (next free still 0081). `list_help_guides` returns `page:account.%` rows in every context (audience-filtered); Help pages "Your account" group. Copy split `apps/web/src/help/copy/{index,client,agency,platform,account}.ts` — **`server-only`**: the shell's `HelpProvider` (`components/help/help-provider.tsx`) sends each viewer only their audience's copy via `helpCopyFor(audience)` (`help/copy/payload.ts`); client components get text from context (`help/render.ts` holds `renderCopy`, no copy); server pages showing per-audience empty states use `HelpEmpty` by key. Page reach lists in `apps/web/src/help/reach.ts` (`AGENCY_ONLY_CLIENT_PAGES`/`CLIENT_ONLY_CLIENT_PAGES`, account routes). Gates: `help/coverage.test.ts` (every `<PageHeader` has a helpKey + guides per reachable audience + tips resolve; delegated headers declared), `help/copy-bundle.test.ts` (no `'use client'` value-import chain reaches `help/copy`), `help/copy/payload.test.ts`, `terminology.test.ts` (no user-facing "theme"/"Friday", incl. Ask/workspace labels, guides, glossary), `white-label-leak.test.tsx`. Every PageHeader page has a key + guide (client 25, agency 18, platform 16, account 3). Glossary `theme` → `topic`, + `first-steps`. `PressureBadge` text labels ("High/Medium/Low pressure", "Quiet"); approval confidence "High confidence NN%" (≥ 0.85) / "Confidence NN%" (`components/confidence-label.ts`); heatmap legend; Setup "Advanced" disclosure. UI renames: "Topic proposals", "I review alerts first", Vertical/Service type → "Business type", Platform access "platform support". `resolveTip` searches past prefix page keys.

## Assumes from other branches
- **phase-7** (7a1 executing): no `page.tsx`/help files. Touches `server/tools.ts`, `server/env.ts`, `next.config.ts`, `core/src/index.ts` (one line), Sentry files. Its `0080_runtime_roles`/`0081_lifecycle` collide with main's `0080_kb_help_key`; it renumbers to 0081/0082. Add no migration here without re-checking.
- **phase-7-planning**: parked, docs only; no overlap.
- **13a** (not started): title template and error pages touch the same page files.
- **15c** (not started): overlaps nearly every page (error/404/loading, StatusChip, miles/formatters, ConfirmDialog, SaveBar). See Q2.

## Decisions (owner-approved)
Binding: Brief § 4. New 2026-10-20 (spec C1–C7): C1 one branch, 4 batches (client/agency/platform+account/terminology) each with a sign-off doc, coverage test last, one merge; C2 15b-2 before 15c; C3 user-facing terminology now, identifiers in 15b-3; C4 only (H) structural items (labels beside colour, heatmap legend, Setup Advanced); C5 every PageHeader page gets a guide except Help pages + `/kb/[id]`; C6 "Your account" group on all Help pages; C7 15b-3 full rename incl. DB/tools/packs with MCP aliases, LLM question keys/gold labels/model_batch names stay `theme`.

## New backlog / Owner verification
New backlog: 15b-3 → topic rename (spec C7) incl. tool descriptions/'Unknown theme'/`nav-counts` description, `vertical-draft` prompt, page key `platform.themes`. 15c → non-(H) structural audit items (Ask visibility line, alert-rules band bar, …), Moves "N signals" → "N changes", km → miles (rankings radius, profile Area), Report page empty state when no data, billing guide's 7th status "Not available", "Google place id" label for clients, `TipRow` tips inside `CardTitle` lengthen heading accessible names. 13a → support-session email subject + `support.ts` tool description still name the product. Help hardening (soon): filter agency-only `TipRow` labels out of client payloads server-side; `@cs/core/glossary` subpath + bundle gate (agency-only terms rely on tree-shaking today); `account.onboarding.skip` → `audience: 'agency'`; coverage reach lists not cross-checked against page role gates (M8); Help pages list guides for pages the viewer can't open (M9); spread-header helpKey check is per file. Tooling: `e2e:affected` tag selection pulls single tests out of `describe.serial` files (false failures in kb.spec/new-vertical.spec); `pnpm test:affected --base <sha>` selects nothing (use the default merge-base).
Owner verification: sign off the four copy docs; after merge `pnpm kb:seed` on `cs_dev`; as agency admin and as client owner open a `/c/<id>` page (Guide shows the right version, `?` tips, no agency wording for the client); white-label agency without display name shows no "Rival Monday"; `/platform/themes` reads "Topic proposals"; Help pages show a "Your account" group.

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
