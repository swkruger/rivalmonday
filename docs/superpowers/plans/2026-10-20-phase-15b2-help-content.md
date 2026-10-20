# Phase 15b-2 — Help content wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`): interfaces and behaviour are binding; implementers write the code and the copy. Steps use `- [ ]`.

**Goal:** Every `PageHeader` page gets a help key, a guide, a description, tips and teaching empty states; user-facing terminology is fixed ("topic", assistant name, "I review alerts first", seat); three high-severity a11y/understanding fixes land; the §8 coverage test enforces it all.
**Architecture:** Content only on top of the 15b-1 system (no migration). Per-context copy files merged into `PAGE_COPY`; guides as `docs/help/pages/*.md` seeded by `kb:seed`; `list_help_guides` adds account guides to every context; a static coverage test closes the wave.
**Tech stack:** Next.js App Router, `@cs/core` glossary, `@cs/tools` help tools, KB seed, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-20-phase-15b2-help-content-design.md` (C1–C7, §2–§4). Parent: `docs/superpowers/specs/2026-10-19-phase-15b-help-system-design.md` (B1–B10, §3, §7, §8). Page inventory: `docs/work/phase-15b2.md` § Brief 2. Audit: `docs/research/2026-10-18-phase-15-ux-audit.md` §2–§3 (items tagged 15b).

## Global constraints
- Audience values exactly `all | agency | client | operator`. Client roles and guests never receive agency/operator text (guides, tips, empty states, glossary, search). Agency roles never receive operator text. Tips/empty states with agency-only content set `audience: 'agency'`.
- No "Rival Monday" in agency/client-facing help; neutral fallbacks ("your agency", "your business"/"the client"). Never hard-code "Friday": `{assistant}` (short copy) / `{{assistant}}` (guides). Glossary entries use **no** placeholders.
- Copy derived from the code: every metric/threshold/limit stated cites its source in a `// source: <path>:<fn>` comment (TS) or is verifiable from a named function (guides: list sources in the batch sign-off doc). Never state what the code doesn't do.
- US English, sentence case, plain words; miles in copy (value conversion is 15c).
- "Theme" never appears in user-facing text after Task 2 (C3); identifiers/routes/DB/tools/packs keep `theme` (15b-3).
- Guides: `docs/help/pages/<context>.<page>[.<audience>].md`, front matter `help_key`/`audience`/`title`, exactly three H2 sections `What this page tells you`, `How to use it`, `Common questions`. `help_key` matches `^page:[a-z0-9.-]+$`.
- Every wired page calls `helpGuides(ctx, <context>, clientId?)` with the scope `PageGuide` derives (`helpScopeOf`) and passes `guide={guides.has(KEY)}`.
- Brand tokens only; web reads via registered tools; page refusals → 404.
- Read `docs/gotchas-cross-cutting.md` and touched packages' `CLAUDE.md` first. Focused tests: `pnpm --filter <pkg> exec vitest run <pattern>`. E2E on `E2E_PORT=3101`.

## Decisions
Spec C1–C7. Plan-local: **P1** each content task writes its batch's rows into that batch's sign-off doc as it goes (one doc per C1 batch; Task 9 finalises). **P2** content tasks extend `packages/tools/src/kb/help-content.test.ts`'s expected-keys list for their pages (the real-files seed test) and add a page render test per page group following `apps/web/src/app/(app)/c/[clientId]/help-pilot.test.tsx`. **P3** the coverage test (Task 10) is the gate; until then partial coverage is fine.

## File structure
- `apps/web/src/help/copy/{index,client,agency,platform,account}.ts` (PageKey union + per-context `PAGE_COPY` parts).
- `docs/help/pages/*.md` (guides); `packages/core/src/help/glossary.ts` (terms).
- `packages/tools/src/tools/help.ts` (account prefix); `apps/web/src/components/help/help-groups.ts` ("Your account").
- C4: `apps/web/src/components/pressure-badge.tsx`, the approval confidence indicator (find in `app/(app)/agency/approvals/**`), `apps/web/src/components/charts/theme-heatmap.tsx`, the client setup form (`app/(app)/c/[clientId]/setup/**`).
- Page files under `apps/web/src/app/**/page.tsx` (helpKey wiring, tips, `EmptyState`).
- `apps/web/src/help/coverage.test.ts` (new); `apps/web/src/app/white-label-leak.test.tsx`; `apps/web/e2e/help.spec.ts`; `packages/demo/src/coverage.ts`.
- Sign-off docs: `docs/archive/phase-15b2-copy-signoff-{client,agency,platform-account,terminology}.md`.

## Dependencies on in-flight work (re-check in Task 0)
- `phase-7` (7a1 executing): touches `server/tools.ts`, `server/env.ts`, `next.config.ts`, one export line in `packages/core/src/index.ts`, Sentry files; no page/help files. Migrations 0081+ (15b-2 adds none).
- 15c not started (C2: it rebases on 15b-2). 13a not started (title template, same page files later).

## Review focus
1. A client owner on any client page, Help page, guide or tip never sees agency-only wording (routing, upsell, seats, review queue, AM, costs, vendor names, confidence thresholds).
2. White-label agency without a display name: no "Rival Monday" in any new copy; assistant name is the agency's.
3. No "Theme"/"themes" left in user-facing strings (UI, copy, guides, glossary) while routes/identifiers still say theme.
4. Pages whose content differs by role (agency vs client on `/c/<id>/*`) show the right guide/tip variant; pages a client can't reach have no client guide.
5. Factual accuracy: every number in copy (limits, thresholds, windows, prices, schedules) matches the code it cites.

---

### Task 0: Pre-flight
- [ ] `git rebase main`; confirm worktree install + test DB `cs_phase_15b2_test`; re-check the page inventory against `apps/web/src/app/**/page.tsx` (`PageHeader` users) and fix the per-task page lists below if pages moved; grep user-facing "Theme"/"themes", "Friday", "After AM check" to size Task 2; commit plan fixes `docs(phase-15b2): pre-flight`.
  - Findings: recount matches the lists below (client 25, agency 19 incl. `agency.help`, platform 16 + help, account 3 + `kb.detail`); no page moved. Rebase no-op, `node_modules` present, `cs_phase_15b2_test` exists. Role reach on `/c/<id>/*`: `pitch-snapshot`, `settings.delivery`, `settings.runbook` refuse client roles (`isAgencyRole` -> notFound); `settings.billing` is `client_owner` only (agency 404). Client `ask`/`ask.thread` render `PageHeader` in `ask/ask-screen.tsx`, not `page.tsx`, so the Task 10 `<PageHeader` scan must include it. Task 2 size: about 17 theme strings in 8 files + 10 in 2 guides, 3 hard-coded Friday, 1 "After AM check"; no e2e asserts the old theme strings. Details: `.superpowers/sdd/2026-10-20-phase-15b2-help-content/task-0-report.md`.

### Task 1: System — account guides in every context, "Your account" group, per-context copy files
**Files:** `packages/tools/src/tools/help.ts` (+test); `apps/web/src/components/help/help-groups.ts` (+test); split `apps/web/src/help/copy/` into `index.ts` (types, `PageKey`, `PAGE_COPY` merge, `renderCopy`), `client.ts` (existing), new `agency.ts`, `platform.ts`, `account.ts` (empty records typed for their keys).
**Interfaces:**
```ts
// copy/index.ts
export type ClientPageKey = `client.${string}`; // narrowed by the literal keys in client.ts
export type PageKey = keyof typeof CLIENT_COPY | keyof typeof AGENCY_COPY | keyof typeof PLATFORM_COPY | keyof typeof ACCOUNT_COPY;
export const PAGE_COPY: Record<PageKey, PageCopy>; // = { ...CLIENT_COPY, ...AGENCY_COPY, ...PLATFORM_COPY, ...ACCOUNT_COPY }
// each context file: export const <CTX>_COPY = { ... } as const satisfies Record<`<ctx>.${string}`, PageCopy>;
```
- `list_help_guides` rows: `help_key LIKE 'page:<context>.%' OR help_key LIKE 'page:account.%'` (account rows still audience-filtered; platform context still platform-level rows only).
- `groupGuides`: account keys go to a group labelled **"Your account"**, placed after the context's menu groups and before "Other".
**Tests:** tools — account guide listed in client/agency/platform contexts, audience filtering still applies to account rows, agency-only account guide hidden from client; web — "Your account" group order; `TipKey` still type-checks for existing pilot tips; existing `help` tests green.
**Done when:** `pnpm --filter @cs/tools exec vitest run help`, `pnpm --filter @cs/web exec vitest run help`, `tsc --noEmit` (tools, web).

### Task 2: Terminology (user-facing strings) — topic, assistant name, "I review alerts first", seat
**Files:** every web file with user-facing "Theme"/"themes"/"themed"/"unthemed" in the review sense (Reviews filter "All themes" → "All topics", heatmap titles/axis, nav label "Theme proposals" → "Topic proposals", `/platform/themes` page title + copy, Business types catalogue "Review themes", competitor sections, runbook item-card fallback text, help copy/guides/glossary text); hard-coded "Friday" in user-facing strings (Approvals, Alerts and anywhere else) → `assistantName` from the existing theme/branding source; Delivery "After AM check" → "I review alerts first"; glossary: term id `theme` → `topic` (term "Topic"), update `seeAlso` refs and any `HelpTip term="theme"`; `seat` term already defines seat = active client — check tips use it.
**Behaviour:** UI text only (C3): do **not** rename routes (`/platform/themes`), query params (`?theme=`), page keys (`page:platform.themes`), component/function names, tool names, DB, packs. Tests asserting old strings are updated. Exclude UI-theme senses (`themeForViewer`, brand theme, dark/light).
**Tests:** a test that scans `apps/web/src/**/*.tsx` string literals/JSX text, `apps/web/src/help/copy/*.ts`, `docs/help/pages/*.md` and `GLOSSARY` for `/\btheme(s|d)?\b/i` in user-facing text (allow-list identifiers/route segments/UI-theme files) and fails listing hits; "Friday" literal scan in `apps/web/src` user-facing strings; Delivery label test.
**Done when:** `pnpm --filter @cs/web exec vitest run`, `pnpm --filter @cs/core exec vitest run`, `pnpm --filter @cs/tools exec vitest run help-content`, `tsc --noEmit`; E2E specs asserting old strings updated (`grep -rn "Theme\|Friday\|After AM" apps/web/e2e`).

### Task 3: C4 — text labels beside colour, heatmap legend, Setup "Advanced"
**Files:** `components/pressure-badge.tsx` (+test); approval confidence indicator (+test); `components/charts/theme-heatmap.tsx` (+test); client setup form (+test).
**Behaviour:**
- `PressureBadge` always renders visible text: "High pressure" / "Medium pressure" / "Low pressure" / "Quiet" (bands from `packages/tools/src/pressure.ts`: ≥70 high, ≥40 medium, >0 low, 0 quiet — verify and cite). Colour stays; text is not `sr-only`.
- Approval confidence (amber border today): visible "High/Medium/Low confidence" label with the same thresholds the code uses (find and cite).
- Heatmap: a legend explaining cell colour (share of reviews checked for the topic that mention it) and the ±5-point arrows (cite `packages/engine/src/reviews/benchmark.ts`), sentence case, "topic" wording.
- Setup: lat/lng/place id fields grouped in a closed-by-default "Advanced" disclosure (`<details>` or existing `@cs/ui` pattern) with `FieldHint`s explaining each; values and submit behaviour unchanged; disclosure opens automatically when one of its fields has a validation error.
**Tests:** label text per band (no colour-only state); confidence label per threshold; legend renders with heatmap; Advanced closed by default, opens on its field's error, submit unchanged.
**Done when:** `pnpm --filter @cs/web exec vitest run pressure approvals heatmap setup`, `tsc --noEmit`.

### Task 4: Client batch A — competitors, competitors.detail, pricing, ads, rankings, moves
**Files:** `help/copy/client.ts`; `docs/help/pages/client.<page>[.agency|.client].md`; the six `app/(app)/c/[clientId]/<page>/page.tsx` (+ page render test file `c/[clientId]/help-client-a.test.tsx`); `packages/tools/src/kb/help-content.test.ts`; `docs/archive/phase-15b2-copy-signoff-client.md` (create).
**Behaviour (each page):** `HELP_KEY` + `helpGuides(ctx,'client',clientId)` + `guide={…}`; `PAGE_COPY` description (used as `PageHeader.description`); tips for the audit-named terms (competitors: tiers Top rival/Worth watching/Minor + "Rated <date>" + empty next step; pricing: pill + "Your service"; ads: targeting; rankings: average map rank, grid, local pack, not-found = 21, Scan now limits (≤1/client/7 days, ≤10/agency/day — cite); moves: statuses + "N signals"); bespoke empty states → `EmptyState`; guides — agency + client versions where content differs (agency: routing, review, upsell, scan limits for agency; client: none of those), else `all`. Sign-off doc rows: string, audience, source.
**Tests:** per page — Guide button when the guide exists for the viewer, tips render for client and agency viewers with the right variant, agency-only tips absent for client; real-files seed test lists the new keys/audiences.
**Done when:** `pnpm --filter @cs/web exec vitest run "c/[clientId]" help`, `pnpm --filter @cs/tools exec vitest run help-content`, `tsc --noEmit`.

### Task 5: Client batch B — recommendations, ask, ask.thread, briefs, briefs.detail, alerts.detail, reports.detail, evidence.detail, pitch-snapshot
**Files / Behaviour / Tests / Done when:** as Task 4 for these pages (render test `c/[clientId]/help-client-b.test.tsx`). Topics: recommendations (save from an assistant answer — only when Ask is on: copy must not promise Ask when the module is off), Ask (visibility/disclosure line wording from 15a ruling "…reviewed by our support team…" when no displayName — copy only, structural line is 15c), briefs (Monday delivery, "Where you stand" quiet weeks, confidence %), alerts detail (score, alert vs brief), reports (quarterly), evidence (captured by our monitoring service, hashes explained plainly), pitch-snapshot (verified in Task 0: agency roles only, clients get 404 — agency guide only, no client guide, list it in `AGENCY_ONLY_CLIENT_PAGES`). Client `ask`/`ask.thread` wire `helpKey` in `ask/ask-screen.tsx` (where `PageHeader` renders).

### Task 6: Client batch C — setup, settings.profile, settings.delivery, settings.alerts, settings.ai, settings.billing, settings.runbook
> Task 0: `settings.delivery` and `settings.runbook` are agency-only (clients get 404: agency guide only, add to `AGENCY_ONLY_CLIENT_PAGES`); `settings.billing` is `client_owner`-only (agency 404: client guide only).
**Files / Behaviour / Tests / Done when:** as Task 4 (render test `c/[clientId]/help-client-c.test.tsx`); finalise `docs/archive/phase-15b2-copy-signoff-client.md`. Topics: setup steps + 14-day starting-point cap + Advanced fields (pairs with Task 3 `FieldHint`s), profile pressure (H) + "15 miles · 0 ZIP codes" wording (value conversion is 15c) + contact link, delivery ("I review alerts first", 17:00 digest zone — cite), alert rules (levels; band bar is 15c), AI connection (access levels), billing (who pays whom — agency-billed; never names Rival Monday), runbook (14b: plays, "Update available", customise).

### Task 7: Agency batch A — portfolio, clients.new, approvals, approvals.detail, alerts, prospects, prospects.new, prospects.detail, leads
**Files:** `help/copy/agency.ts`; `docs/help/pages/agency.<page>[.agency].md` (agency pages: `agency` or `all`); the nine `app/(app)/agency/**/page.tsx` (+ render test `app/(app)/agency/help-agency-a.test.tsx`); `help-content.test.ts`; `docs/archive/phase-15b2-copy-signoff-agency.md` (create).
**Behaviour:** as Task 4 with context `'agency'`. Topics: portfolio empty state + onboarding checklist count, pressure (label from Task 3), new client wizard (lookup → profile → competitors → invite → billing; vertical vs service type naming = business type), approvals (confidence label, what approving does), alerts (score 70+, 17:00 digest — cite), prospects (Convert / "Accept and invite"), leads (lead pool).
**Tests / Done when:** as Task 4 with agency pages (`pnpm --filter @cs/web exec vitest run agency help`).

### Task 8: Agency batch B — settings.ai, settings.billing, settings.branding, settings.intake, settings.platform-access, settings.runbook, settings.slack-teams, settings.team, settings.usage
**Files / Behaviour / Tests / Done when:** as Task 7 (render test `help-agency-b.test.tsx`); finalise the agency sign-off doc. Topics: AI access levels, billing ($229 incl. 3 seats + $99/seat, seat = active client, "includes 3 clients" (H) clarified — cite `packages/billing/src/seed.ts` + note prices are editable per plan), branding (white-label, display name, sender), intake link (slug rename effect), platform access (support sessions: 60 min, read-only, audited — cite), runbook (agency level, updates to clients), Slack/Teams (webhook how-to), team (roles, account manager scope), usage (Cap/Limit labels, what counts).

### Task 9: Platform + account batch
**Files:** `help/copy/platform.ts`, `help/copy/account.ts`; guides `platform.<page>[.operator].md`, `account.<page>[...].md`; platform pages under `app/(platform)/platform/**/page.tsx` (overview, agencies, agencies.detail, billing, leads, reviews, themes, ask, ask.thread, knowledge, knowledge.new, knowledge.detail, health, costs, verticals, runbook) and account pages (inbox, settings.notifications, onboarding; `kb.detail` exempt) (+ render tests `app/(platform)/platform/help-platform.test.tsx`, `help-account.test.tsx`); `help-content.test.ts`; sign-off `docs/archive/phase-15b2-copy-signoff-platform-account.md`.
**Behaviour:** platform pages: `helpGuides(ctx,'platform')`; guides `operator` (or `all` only when safe — platform pages are operator-only anyway); may name the product (15a §2.7). Topics: overview "Last 28 days" (H), agencies Health legend, support dialog (60 min/read-only/audited), billing UUID entry, themes page (topic proposals; key stays `platform.themes`), reviews (τ 0.85 verifier, Jev → LLM → human), Ask reviews, knowledge (seed rows read-only, managed in repo), health, costs, business types (approve/merge), platform runbook. Account pages: notification labels ("Client alerts (agency)", "Rank scan skipped") — audiences per who reaches the page; onboarding agency-only; account guides list under "Your account" (Task 1).
**Tests / Done when:** as Task 4 with platform/account pages (`pnpm --filter @cs/web exec vitest run platform help`).

### Task 10: Coverage test, glossary completion, leak/E2E/demo, terminology sign-off
**Files:** create `apps/web/src/help/coverage.test.ts`; `packages/core/src/help/glossary.ts` (missing audit §3 terms: competitor/Top rival, change/move/signal/first steps, brief/report/alert, business type, seat, paused, topic, starting point — add only those not present; no placeholders); `apps/web/src/app/white-label-leak.test.tsx`; `apps/web/e2e/help.spec.ts` (+1 smoke per batch); `packages/demo/src/coverage.ts` (+README table); `docs/archive/phase-15b2-copy-signoff-terminology.md`.
**Interfaces (coverage test, binding):**
- Scan `apps/web/src/app/**/page.tsx`; a file containing `<PageHeader` must contain `helpKey=` unless its route is in `EXEMPT = ['/platform/help', '/agency/help', '/c/[clientId]/help', '/kb/[id]']`.
- Collect every `page:<…>` literal used as a help key; for each, the set of audiences that can reach it: `/c/[clientId]/**` → agency + client (unless the page refuses client roles — declare those in `AGENCY_ONLY_CLIENT_PAGES`), `/agency/**` → agency, `/platform/**` → operator, account routes → declared per route. A guide file must exist whose audience covers each (exact audience, or `all`).
- Every `tip="…"` literal and `TipKey` usage resolves in `PAGE_COPY`.
- Fails with one message listing every gap.
**Behaviour:** leak test opens every client-reachable page's tips and guide for a white-label client with no display name and asserts no "Rival Monday", no agency-only strings; E2E: one guide opens per batch with the right version; demo coverage reads for new `list_help_guides` calls.
**Done when:** `pnpm --filter @cs/web exec vitest run coverage white-label help`, `pnpm --filter @cs/demo exec vitest run`, `pnpm --filter @cs/tools exec vitest run help-content`, `E2E_PORT=3101 pnpm --filter @cs/web e2e:affected --full` green.

### Task 11: Final review + docs
- [ ] Whole-branch review (most capable model): `pnpm test:affected --base main`, `pnpm --filter @cs/web e2e:affected --base main --full`; one fix wave.
- [ ] Update `docs/work/phase-15b2.md` (Status, Interfaces, owner steps: `pnpm kb:seed` on `cs_dev` after merge; sign off the four copy docs; check a client page as agency + client; check `/platform/themes` reads "Topic proposals"). New backlog: 15b-3 topic rename (spec C7); 15c structural items deferred by C4. Commit.
