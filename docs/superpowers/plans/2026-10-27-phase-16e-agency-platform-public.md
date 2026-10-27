# Phase 16e — agency, platform, account and public pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page outside the client workspace and onboarding (agency, agency settings, inbox/kb/notifications, platform, auth/account, `/start`, errors, `/bot`) on design system v1 — look only (D1).

**Architecture:** No new primitives expected: 16a–16d left `Section`, `Band`, `KpiStrip`/`Kpi`, `HairlineGrid`, `TableFrame`, `Table`, `Field`, `SaveBar`, `StatusChip`, `Tag`, `DotStatus`, `Card` (`variant`), `Segmented` classes and the native control classes in `@cs/ui`, plus `StatStrip` and `PageHeader` (`tabs`/`meta`/`variant`) in web. Each task applies the playbook § 6.1 decision tree and the § 6.2 verdict rows for its own files, swaps raw `<table>` for `@cs/ui` `Table`, hand-rolled panels for `Band`, hand-rolled KPI tiles for `StatStrip`, and remaining literals for tokens. Three HTML mockups (D13) record the unframed groups first.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, `@cs/ui` (shadcn/radix), Vitest + Testing Library, Playwright (+ `@axe-core/playwright` shots harness).

**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (§ 2 D10–D19, § 3 row 16e). Recipes: `docs/design-system/09-ai-implementation-playbook.md` § 5.2, § 6.1, § 6.2 tables *Agency pages*, *Agency settings*, *Onboarding and public* (`auth-card`, `/start`), *Platform / operator*, *Shared components* (runbook, `support-sessions-table`), *Other hand-rolled containers* items 1–9 — **binding; tasks cite rows instead of repeating class strings.** Archetypes L1–L5 in `05-design-system-specification.md` § 4; D-15 (forms), D-21 (detail), D-22 (auth) in `04-design-decisions.md`; acceptance `08-implementation-guide.md` § 8. Branch state/backlog: `docs/work/phase-16.md`.

## Global Constraints
- D1 look only: no route, permission, copy or behaviour change. Headings keep their text **and level** where E2E reads them (`ops` needs h2 `Worker`/`Queues`/`Vendors`/`Sources`; `navigation` h1 `Branding & voice`/`Team`; `support` heading `Platform access`; `platform` heading `People`; `help` regions `Search results`/`Glossary`; `errors` h1 `Page not found`/`Something went wrong`; `ops` h1 `RivalMondayBot`; `runbook` h1 `Runbook` + `[data-item]`).
- Tokens only (`packages/ui/CLAUDE.md`): no hex, `rounded-lg|xl|2xl|[…]`, `text-[…px]`, `shadow-*` literals, `uppercase tracking`, `font-bold|extrabold` in touched lines; `text-13`/`text-11` for 13/11 px; 15 px → `text-base`, 22 px → `text-2xl`, 34 px KPI values come from `Kpi`. `text-muted-foreground` → `text-muted-ink` in touched files (same colour, one name). `#EEF2F6` borders → the `Table` defaults (`border-line`). Layout widths (`max-w-[400px]`, `[640px]`, `[680px]`) are allowed.
- Focus `focus-visible:outline-2 outline-offset-2 outline-ring` (fixed). Status = `StatusChip`/`DotStatus`/`Tag` (no colour-only meaning). ≤ 1 primary button per view; destructive red only inside a confirm dialog.
- The shell already gives `max-w-[1560px]` and `gap-10` (`app-shell.tsx:131`): pages render a fragment; page-level `max-w-[1560px]`/`gap-5` wrappers go.
- Tests (D16): class assertions → role / `data-slot` / `data-variant` / `data-tone` in the task that breaks them; E2E role-based. Raw `<table>` → `@cs/ui` `Table` keeps table semantics, so `.closest('tr')` and `getByRole('row'|'cell')` keep working. A moved/new component needs its `apps/web/scripts/e2e-affected-rules.ts` rule checked.
- Implementers run focused tests only (`pnpm --filter @cs/web exec vitest run <pattern>`; one named E2E spec with `-g` only where a task says so); `test:affected`, `e2e:affected` and shots run once, in Task 11. E2E and shots share port 3100 — never concurrently. Commit by explicit paths (`git commit -- <paths>`), never amend. No migrations (next free `0096`).
- Commit trailer `Co-Authored-By: <your model> <noreply@anthropic.com>`; LF only.

## Decisions (Claude's calls under D10 — recorded for the owner's end review)
Spec D10–D19, 16b P1–P9, 16c P1–P11, 16d P1–P10 stand. Plan-local:
- **P1 Archetypes.** Agency dashboard = L2 with today's order (16b P7: containers change, content order doesn't). Agency alerts/approvals/leads/prospects lists, platform agencies/leads/knowledge/ask/topics/reviews/verticals = L1 (one table or queue per page: flush, no wrapper; a table among sections = `TableFrame`). Settings pages (agency settings, `/settings/notifications`) = L4 (drill-in nav exists since 16b). Platform agency detail and prospect detail = L3 **without** the 320 px aside (no avatar, no DOM reorder: ruled Sections in today's order). Help guides, `/kb/[id]`, `/bot` = L5 (680 px reading column). Platform overview/costs/health/billing = L2 (KPI strip + sections; charts in a `HairlineGrid` where two sit side by side).
- **P2 Queue items stay Cards** (actionable objects, § 6.2 judgement calls resolved): alert items (`alert-controls`), lead cards, review-queue items, topic proposals, catalogue items, runbook play/rule items. `Card` default variant, inner panels → `Band`, no nested borders. Each keeps its heading inside the card and the card as the nearest `div` ancestor holding its buttons (E2E `intake:63`, `new-vertical:95` filter `div` by heading + button).
- **P3 KPI groups → `StatStrip`** (same items, titles become its `h2`s): agency usage near/over cap, platform costs summary, platform billing "agencies by state". Costs "Warnings": today's amber value colour (`#B45309`) was colour-only meaning; it becomes the plain value (the count says it) — no new pill text. `platform-costs` E2E line 51 (reads `$` from the heading's parent) is updated to read the `Kpi` cell (`[data-slot="kpi"]` ancestor; confirm the attribute in `kpi-strip.tsx`) — role-based heading lookup kept.
- **P4 Auth pages (D-22):** `AuthCard` keeps its name and props but renders a centred 400 px column on `bg-surface` white (no `Card`, no canvas): logo/Wordmark top, title `h1` (`text-2xl font-semibold`, real `<h1>` replacing `CardTitle role=heading`), body below. `/paused` and the sign-up "paused" branch inherit it. Sign-up's open branch already uses L7 (`OnboardingShell`) — unchanged.
- **P5 Platform billing tabs** → `PageHeader` `tabs` (same hrefs/labels/`aria-current`), so the page starts with its `h1`. Range toggle (`_components/range-toggle.tsx`) and signups panel toggle → Segmented classes (links keep roles, 16c P1).
- **P6 Error pages:** `ErrorPanel`/`ErrorBoundaryPage` keep the centred column, heading `text-2xl font-semibold text-ink`, body `text-muted-ink`; `global-error.tsx` keeps inline styles (no CSS guaranteed) — untouched.
- **P7 Branding editor preview:** the live preview is a `Frame` (§ 6.2). Literals inside the preview that render the *agency's own* colours/email mock come from data or `themeVars` and stay; any remaining hex/`text-[11px]` there → tokens (`text-11`) or, if no token fits, listed in the work file for 16f's allowlist.
- **P8 Evidence refs on approvals + recommendations** (16d backlog line): `agency/approvals/[briefId]` and `c/[clientId]/recommendations` pass `evidenceRefsFor(...)` to `EvidenceChips` exactly like the brief page (16d P3) — names become `Evidence n: source, date`; fallback unchanged.
- **P9 No danger zone** (16c P5 carry-over): agency settings hold no destructive setting (client pause/archive are row actions with their `ConfirmDialog`; agency hold/archive are platform actions) → BACKLOG line, not built.
- **P10 Mockups (D13)** go to `docs/design-system/mockups/phase-16e/` (agency, platform, auth) for the record; the build does not wait for the owner (D10).

## File structure
- `docs/design-system/mockups/phase-16e/{agency,platform,auth}.html`
- `apps/web/src/components/`: `auth-card.tsx`, `error-panel.tsx`, `error-boundary-page.tsx`, `help/{help-index,page-guide,help-tip,empty-state}.tsx`, `settings-nav.tsx`, `support-sessions-table.tsx`, `agency/{branding-editor,intake-link-card,onboarding-checklist}.tsx`, `runbook/{item-card,knob-card,runbook-editor,diff}.tsx`, `evidence-chips.tsx` (callers only), `recommendation-board.tsx`
- `apps/web/src/app/(app)/agency/**` (page, alerts, approvals, leads, prospects, settings/*), `app/(app)/{inbox,kb/[id],settings/notifications}/**`
- `apps/web/src/app/(platform)/platform/**` (overview `_components`, agencies, billing, costs, health, knowledge, reviews, topics, verticals, leads, ask)
- `apps/web/src/app/{bot,oauth/consent,start,join/[token]}/**`, `app/sign-in/check-email/resend-button.tsx`
- `apps/web/e2e/platform-costs.spec.ts` (P3), `apps/web/e2e-shots/{routes.ts,shots.spec.ts}`, `docs/work/phase-16.md`

## Dependencies on in-flight work
None (`phase-16` is the only unmerged branch; this is it). Task 0 re-checks the `@cs/ui` exports listed under Architecture, `StatStrip` props `{items:{title,value,pill?,hint?,help?,href?}[];label?}`, `PageHeader` `tabs`, `evidenceRefsFor` in `server/evidence-refs.ts`. 13a runs after Phase 16 (D18).

## Review Focus
1. **E2E locators that lean on DOM shape** — `intake:63` (lead card `div` with heading + Accept), `intake:204` (`Recent assignments` ancestor holding a `<table>`), `new-vertical:95` (catalogue card `div`), `platform-costs:51` (KPI value next to its heading), `help` (`region` names), `ops:32` (h2 levels): each task touching these files keeps the shape or updates the spec in the same commit → Tasks 4, 9, 10 + E2E in Task 11.
2. **Tables that become `@cs/ui` Table** — empty states, row actions (menus, inline forms in `client-limits`, `codes`, `invite-links`), right-aligned tabular numbers and `.closest('tr')` unit tests keep working; a table inside a form keeps its inputs' labels → Tasks 8–10 tests.
3. **Auth column without the card at 390 / 1440** — no horizontal scroll, white-label logo still shows (`themeVars` applied), exactly one `h1`, the Turnstile widget (`.cf-turnstile`) still mounts, `/paused` still skips the shell → Task 2 tests + shots.
4. **Forms keep their save model** — SaveBar forms (`branding-editor`, `contact-form`, `defaults-form`, `spend-guard-settings`) still show the bar only when dirty; button-save forms (`invite-form`, `webhook-controls`, knowledge editor, consent) keep button names; `Field` swaps keep every `getByLabel` → Tasks 5, 7, 10 tests.
5. **Platform pages at 390** — wide operator tables scroll inside their own container (Table's `overflow-x-auto`), never the page; billing tabs wrap or scroll; no horizontal page scroll (existing E2E rule) → shots in Task 11.

---

### Task 0: Pre-flight
- [ ] `git status` clean; `git fetch`; if `main` moved, `git rebase main` + `pnpm install` (main gained only docs + `scripts/hooks/` since `0c28be0e`). Confirm the exports under *Dependencies*. Record `pnpm design:lint` total (165 after 16d) and `git grep -c` over the File-structure paths for `<Card`, `<table`, `#EEF2F6`, `text-muted-foreground`, `rounded-lg`, `font-bold`, `text-\[[0-9]+px\]` in the work file § Status. If a file named here moved, fix the plan inline; commit `docs(phase-16): 16e pre-flight` only if changed.

### Task 1: Mockups (D13, P10)
**Goal:** three static HTML mockups for the record, built only from `docs/design-system/component-examples/{rm-tokens,rm-components}.css` (Northpoint Digital fiction from 07).
**Files:** create `docs/design-system/mockups/phase-16e/{agency,platform,auth}.html`.
**Behaviour:** `agency.html`: agency home (L2: StatStrip, clients Frame table, onboarding Band), alerts queue (L1: Card items), team settings (L4: drill-in nav, Frame tables, invite Section). `platform.html`: overview (KPI strip + 2 charts in a hairline grid + activity Section), agency detail (L3 no aside: ruled Sections, people Frame table), health (four Frame tables with h2). `auth.html`: sign-in centred 400 px column on white (P4), check-email, 404 panel. Each frame labelled with archetype + decisions cited. No JS.
**Done when:** the three files open in a browser without missing CSS (relative `../../component-examples/` links); `git ls-files --eol docs/design-system/mockups/phase-16e | grep crlf` prints nothing. Commit `docs(design-system): 16e mockups`.

### Task 2: Auth column, errors, `/bot`, OAuth consent, link pages
**Goal:** D-22 auth column (P4), error panels (P6), `/bot` as L5, consent form on tokens.
**Files:** modify `components/auth-card.tsx` (+ test), `components/error-panel.tsx`, `components/error-boundary-page.tsx`, `app/bot/page.tsx`, `app/oauth/consent/consent-form.tsx`, `app/join/[token]/page.tsx`, `app/sign-in/check-email/resend-button.tsx`, `app/sign-up/sign-up-form.tsx` (input class only).
**Interfaces:** `AuthCard` props unchanged; renders `<main data-slot="auth-column">` with an inner `max-w-[400px]` column; title is `<h1>`.
**Behaviour:** white-label branding (`themeVars`, logo) still applied; `join` muted panel → `Band`; consent `<select>`/`<input>` → `nativeSelectClass`/`nativeInputClass` or `Field`; `/bot` keeps its own `<main>` and themeVars, content in a 680 px column, hex → tokens.
**Tests (TDD):** `auth-card.test.tsx`: renders exactly one `heading` level 1 with the title; no element with `data-slot="card"`; logo `img` alt kept. Existing `sign-up-form.test` (`.cf-turnstile`) green. `error-panel` test (create if missing): h1 text per kind unchanged.
**Done when:** `pnpm --filter @cs/web exec vitest run auth-card error-panel sign-up consent bot` green; `bash scripts/design-lint.sh` total ≤ Task 0's.

### Task 3: Help components, settings nav, shared tables
**Goal:** shared pieces used across 16e pages.
**Files:** modify `components/help/{help-index,page-guide,help-tip,empty-state,tip-row}.tsx` (+ `help.test.tsx`), `components/settings-nav.tsx`, `components/support-sessions-table.tsx`, `components/ask/answer.test.tsx` (16d backlog: class assertions → `data-slot`/role, D16; no source change).
**Behaviour:** `help-tip` `text-[10px]` → `text-11` (16d backlog; 10 px is below the 12 px floor — 11 px is the smallest token); page-guide/help-index `font-bold` → `font-semibold`, bordered blocks → Frame/`Band` per § 6.2 item 1/4; `empty-state` → borderless centred (`.rm-empty` recipe, § 6.2 item 8) kept inside its table/frame; help-index keeps `region` names `Search results`/`Glossary` and the Glossary heading inside a `section`. `settings-nav` muted panel → chip scroller tokens (16b P3). `support-sessions-table` raw table → `Table`.
**Tests (TDD):** `help.test.tsx` HelpTip assertions (`outline-ring`, no `ring-primary`) stay; empty-state renders its text without a dashed border (`data-slot="empty-state"`); support table rows found by `getByRole('row', {name})`.
**Done when:** `vitest run help settings-nav support-sessions answer` green.

### Task 4: Agency home, alerts, approvals, leads, prospects
**Goal:** § 6.2 *Agency pages* rows; P2 queue cards; P8 approvals refs.
**Files:** modify `app/(app)/agency/page.tsx`, `components/agency/onboarding-checklist.tsx` (Band), `agency/alerts/alert-controls.tsx`, `agency/approvals/[briefId]/{page,review-controls}.tsx`, `agency/leads/{page,lead-card}.tsx`, `agency/prospects/[clientId]/{page,snapshot-controls}.tsx`, `components/recommendation-board.tsx` caller `app/(app)/c/[clientId]/recommendations/page.tsx` (P8).
**Behaviour:** dashboard clients table → `TableFrame` (among sections); alert/lead cards = `Card` with `Band` sub-panels, `text-[15px] font-bold` → `text-base font-semibold`, native controls → shared classes; review-controls auto-send/approve bar → `Band` (pressed state = primary fill, 16d note kept), 17 inputs keep labels; prospect steps → ruled `Section`s (`as="h2"`), landscape chart in a `Section`; approvals detail `flex-col gap-3` wrapper goes. P8: both pages call `evidenceRefsFor` (server, never throws) and pass `refs` to `EvidenceChips`.
**Tests (TDD):** approvals detail: an evidence pill is named `Evidence 1: {competitor}, {date}` with a seeded ref and `Evidence 1` without; lead card: heading + `Accept` button share the nearest `div` card (`closest('[data-slot="card"]')` contains both); review-controls existing tests green with role queries.
**Done when:** `vitest run agency/page alert-controls review-controls lead-card prospects recommendation` green; `pnpm --filter @cs/web exec playwright test e2e/intake.spec.ts -g "lead"` green (needs the dev server free — skip if another E2E runs; Task 11 covers it).

### Task 5: Agency settings
**Goal:** § 6.2 *Agency settings* rows on the L4 column.
**Files:** modify `agency/settings/{billing/page,billing/client-billing/section,billing/client-billing/revenue-card,platform-access/page,slack-teams/page,slack-teams/webhook-controls,team/page,team/invite-form,usage/page,ai/page,intake/preview/page}.tsx`, `components/agency/{intake-link-card,branding-editor}.tsx`.
**Behaviour:** billing plan summary/discount → `Section`, invoices → `TableFrame`; client billing as definition rows (16c deviation note) inside a `Section` (`labelled` keeps `region 'Billing'`); team members/invitations → `TableFrame`; slack-teams list + form → `Section`; platform-access switch → `Section`, sessions → `TableFrame`; usage KPI grid → `StatStrip` (P3), its table → `TableFrame`; intake link → `Section`; branding form → `Section`, preview → `Frame` (P7). Muted panels → `Band`. 16c deviation carried here: client Delivery form (`app/(app)/c/[clientId]/settings/delivery/*`) wrapper → one `Section` (no inner frame), same fields and SaveBar.
**Tests (TDD):** usage: `StatStrip` shows "Near cap"/"Over cap" titles as `h2` and their counts; billing: `getByRole('region', {name: 'Billing'})` present; existing settings tests green.
**Done when:** `vitest run agency/settings branding-editor intake-link` green.

### Task 6: Runbook editor (16c P10)
**Goal:** § 6.2 runbook rows; serves agency, platform and client runbook pages.
**Files:** modify `components/runbook/{item-card,knob-card,runbook-editor,diff}.tsx` (+ tests).
**Behaviour:** item-card = `Card` (actions) with `Band` sub-panels; knob-card = rows in one Frame (grouped rows, § 6.2) — keep each knob's own switch and label; "Uses agency runbook" notice → `Band`; `font-bold` → `font-semibold`. `[data-item="…"]` attributes stay on the item root.
**Tests (TDD):** item root keeps `data-item` and contains its action buttons; knob switches keep accessible names.
**Done when:** `vitest run runbook` green.

### Task 7: Inbox, kb, notifications, `/start`
**Goal:** account pages + intake pages on tokens.
**Files:** modify `components/ask/ask-card.tsx`, `app/(app)/inbox/page.tsx`, `app/(app)/kb/[id]/page.tsx`, `app/(app)/settings/notifications/{page,contact-form}.tsx`, `app/start/{intake-form,verify/page,v/[leadId]/page}.tsx`.
**Behaviour:** inbox items → divided rows in one Frame list (§ 6.2 item 3), each row keeps its button and link; `components/ask/ask-card.tsx` native control → `nativeInputClass` (16d backlog); notifications table → `TableFrame`, contact form keeps SaveBar; kb article = L5 column. `/start` stays in `OnboardingShell` (L7): `text-[13px]`/`[15px]` → `text-13`/`text-base`, `rounded-lg` → `rounded-md`, sub-panels → `Band`, `shadow` removed.
**Tests (TDD):** inbox: each item's action button still found by name; `start/pages.test.tsx` (`.cf-turnstile`) green.
**Done when:** `vitest run inbox notifications start kb` green.

### Task 8: Platform overview, agencies, agency detail, leads
**Goal:** § 6.2 *Platform* rows (overview, agencies, detail, leads).
**Files:** modify `platform/page.tsx`, `platform/_components/{activity-feed,ai-guard-banner,mini-form,overview-charts,plan-move-parts,range-toggle}.tsx`, `platform/agencies/{page,agency-table}.tsx`, `platform/agencies/[id]/{page,people-section,billing-panel,client-limits,archived-view,hold-banner,manage-menu,support-dialog}.tsx`, `platform/leads/{page,assign-form}.tsx`.
**Behaviour:** overview charts in a `HairlineGrid cols={2}` of Sections, activity → `Section`; agencies table → flush `Table` (remove wrapper); detail = P1 L3: `PageHeader` first (status chip moves into `meta`), team dl + billing → `Section`, clients/support tables → `TableFrame`, people-section raw tables → `Table`; client-limits inline inputs keep labels; range toggle → Segmented classes (links keep roles); leads tables → `TableFrame`, keeping `Recent assignments` and its `<table>` under one `Section` (intake:204).
**Tests (TDD):** detail: first heading in DOM order is the h1 agency name; `hold-banner` keeps `data-tone`; leads `page.test` `.closest('tr')` green; range toggle links keep `aria-current`.
**Done when:** `vitest run platform/page platform/agencies platform/leads overview` green.

### Task 9: Platform billing, costs, health
**Goal:** § 6.2 *Platform* rows (billing, costs, health); P3, P5.
**Files:** modify `platform/billing/{page,codes,connect-panel,invite-links,plan-agencies,plan-editor,signups-panel}.tsx`, `platform/costs/{page.tsx,_components/*}`, `platform/health/{page.tsx,_components/*}`, `e2e/platform-costs.spec.ts`.
**Behaviour:** billing editors → `Section`×5 with inner tables → `Table`; agencies-by-state → `StatStrip`; tabs → PageHeader `tabs` (P5). Costs: remove page wrapper; summary → `StatStrip` (P3); monthly chart hex → `--chart-*` tokens (validate with the `dataviz` skill only if colours change); cost tables → `TableFrame`; form-bits panels → `Band`. Health: four tables → `TableFrame` with **h2** titles kept; spend-guard raw tables → `Table`; remove wrapper.
**Tests (TDD):** update `costs/page.test.tsx:42` (`B45309`) to assert the Warnings value via the strip cell; billing/plan-agencies `.closest('tr')` tests green; health renders h2 `Worker`, `Queues`, `Vendors`, `Sources`.
**Done when:** `vitest run platform/billing platform/costs platform/health` green; `playwright test e2e/platform-costs.spec.ts` green when port 3100 is free.

### Task 10: Platform knowledge, reviews, topics, verticals, ask
**Goal:** § 6.2 rows for the operator queues and editors.
**Files:** modify `platform/knowledge/{page,editor,import-panel,scope-fields,sync-badge}.tsx`, `platform/reviews/review-queue.tsx`, `platform/topics/topic-queue.tsx`, `platform/verticals/catalog-queue.tsx`, `platform/ask/{page,[threadId]/page}.tsx`.
**Behaviour:** knowledge filter form → toolbar (no wrapper), list → Frame list, editor → `Section`s + preview `Frame`; review items, topic proposals, catalogue items = `Card` (P2) with `Band` sub-panels, `uppercase` labels → `text-13 text-muted-ink`; recently-decided → `TableFrame`; catalogue raw table → `Table`; ask list/thread → Frame list / Frame, `details` "Trace" kept.
**Tests (TDD):** `knowledge/page.test.tsx:69,71` (`text-danger`) → assert the error by role/text; catalogue card: heading and its buttons share `closest('[data-slot="card"]')`.
**Done when:** `vitest run platform/knowledge platform/reviews platform/topics platform/verticals platform/ask` green.

### Task 11: Final verification, shots and work file
- [ ] **Shot routes** (`e2e-shots/routes.ts`, fixtures in `shots.spec.ts`): add `agency-approvals`, `agency-approval-detail`, `agency-leads`, `agency-prospects`, `agency-settings-billing`, `agency-settings-usage`, `agency-settings-runbook`, `inbox`, `settings-notifications`, `platform-leads`, `platform-topics`, `platform-verticals`, `platform-ask`, `check-email`, `link-expired`. Set `gate: true` on every 16e route (existing ones listed in the work file + new).
- [ ] `pnpm test:affected --base main`, then `pnpm --filter @cs/web e2e:affected --base main`, then `pnpm --filter @cs/web shots` with `SHOTS_LABEL=after-16e` (sequential, port 3100). 0 serious/critical axe on gated routes (fixes the platform/sign-up hits from the 16e backlog line).
- [ ] Final whole-branch review of 16e commits (most capable model) against the frames/mockups and 08 § 8; one fix wave.
- [ ] Work file: Status (16e done, lint total, shots count), Next = 16f, backlog lines (P9 danger zone, any 16f allowlist literals from P7). Commit `docs(phase-16): 16e done`.
