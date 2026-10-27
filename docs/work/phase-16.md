# phase-16 — design system v1 on every page except onboarding

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-16   **Base:** main @ 0c28be0e
**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (D10–D19). **Plans:** one per sub-phase, written just before it runs. Inputs `docs/design-system/` (09 § 9). Prior brief + page inventory (87 pages → frame/archetype): `git show 1c2d0f0e:docs/work/phase-16.md`.

## Status (overwrite)
2026-10-27: Q1–Q9 answered (owner: take the recommendations; whole pass, no stops between sub-phases; onboarding drift OK). Spec written. Next: 16a plan → execute → 16b … 16f on this branch.

## Next (overwrite)
16a lean plan (`docs/superpowers/plans/2026-10-27-phase-16a-foundations.md`) → SDD → final review → 16b plan …

## Interfaces this branch adds or changes
Planned (09 § 9): tokens in `styles.css`, `theme.ts` foreground, new `@cs/ui` primitives, `Card` = Frame, `PageHeader` `meta`/`tabs`/`variant`, shell frame + sheet, `scripts/design-lint.sh`. No migrations expected (next free **0096**).

## Assumes from other branches
None in flight. 13a (white-label, unbuilt, plan approved) touches `theme.ts`, `app-shell`, `auth-card`: whichever runs second rebases.

## Decisions (owner-approved)
- D1 Look only: content and behaviour unchanged; storyboard look (one sheet, sections over cards). Priority: Overview, Brief detail.
- D2 All pages to the new design; owner verifies after review, asks per-page changes.
- D3 Context switcher stays in the left sidebar (15a D4; overrides Frame 2).
- D4 Runs after Phases 7 and 15 (met).
- D5–D9 16-onboarding (done): split flows, O1–O14, images only on 4 screens (D7).
- D10–D19 (2026-10-27): see spec § 2 — six sub-phases in one continuous pass on this branch; narrow new-UI set; no bottom tabs; shots + axe harness; lint report-only; 13a after; onboarding screens may change.

## New backlog (target → item)
- BACKLOG § Design system: OD-5 bottom tab bar < 768 waits for 3–5 pilot-owner phone tests (D12).

## Owner verification steps
At the end: before/after shots (`apps/web/test-results/shots/index.html`); decide `design-lint` in CI (D17); sign the sr-only "(required)" Field copy.

## Brief
### 1. Scope
Roadmap row 16 ("16-onboarding ✅; rest not started"); core-spec §: none (DS README is the source). Visual migration only (09 § 0.3). Order 09 § 9: PR1 tokens (§ 3, radius trap, contrast test, `design-lint.sh` report-only) → PR2 primitive restyle (§ 4) → PR3 new primitives (`DotStatus`, `FilterChip`, `Tag`, `TierMark`, `Segmented`, `Field`, `Alert`, `Toast`, `Section`, `Band`, `KpiStrip`, `CitationPill`, `SourcesList`, `TableFrame`) → PR4 container sweep C1–C4 (must precede PR5) → PR5 shell + PageHeader (§ 5.1–5.2, drill-in settings nav) → **PR6 Overview slice, owner stop** (Frame 8) → PR7 workspace pages (Frame 7, bulk bar) → PR8 detail + settings (Frames 6, 9) → PR9 Friday + briefs, docked panel D-14 (Frame 12) → PR10 responsive D-23/OD-5 (Frame 10) → PR11 lock-in. Acceptance 08 § 8; detection 09 § 8; cards 09 § 6.2; codemods 09 § 7. Out: onboarding/intake/sign-up (done), except tokenising `OnboardingShell` literals.

### 2. Reuse, don't rebuild
- `@cs/ui` (`packages/ui/src`): `styles.css` (Tailwind 4 `@theme inline`; `--radius` 0.75rem trap, `--shadow-card`, `--color-line`, `--you`, `--chip-*`; no DS tokens yet: unchanged since 1c2d0f0e), `theme.ts` (`themeVars`, `readableTextOn`/`contrastRatio` → `--primary-foreground`), `components/*` (shadcn set + status-chip, confirm-dialog, save-bar, skeleton, tabs-link, breadcrumb, friday-badge, wordmark).
- Web `apps/web/src/components/`: `page-header`, `page-skeleton`, `stat-card`, `settings-nav`, `list-detail(-sheet)`, `shell/*` (app-shell, sidebar(-nav), top-bar, context-switcher, mobile-nav, `shell-providers`, banners), `charts/*`, `help/*`, `ask/*`, `evidence-chips`; `lib/{labels,page-gates}.ts`, `lib/format/*`.
- 16-onboarding added `components/onboarding/` (`onboarding-shell.tsx` L7 split, `preview-window`, `step-progress`, `step-footer`, `field.tsx`, `previews/*`), route group `(onboarding)`, shared `ShellProviders`. **No tokens or `@cs/ui` primitives** (plan: shell uses literals; `field.tsx` is local, candidate for PR3 `Field`).
- Counts now (excl. tests): `<Card` 54 in 32 files; `shadow-card` 61 web + 2 ui = **117** (backlog said 153; 0 in onboarding).

### 3. Binding decisions (don't reopen)
Root `CLAUDE.md` § Decisions: DS v1, brand, charts, 15 UX/IA (switcher, Ask first, settings routes, `PageHeader` + help key), 15c (no `loading.tsx`, miles, tz, `readableTextOn`, `labels.ts`, grep gates), white-label. 15a D2 mockups before code, D8 drawer < lg, D11 no dark mode. 15c C9 mobile list/detail sheet, C10 one copy sign-off per sub-phase. DS OD-1…OD-5 (OD-5 bottom tabs only after phone validation). 09 § 0: tokens only, one concern per PR, only `--primary/--secondary` per agency.

### 4. Backlog to fold in (verbatim)
Phase 16 follow-ups:
- "Rest of Phase 16 … `/rm-kickoff` a new sub-phase; brief, D1–D4, open OD-5 and the 9 open questions are in `git show 1c2d0f0e:docs/work/phase-16.md`" — *phase-16*
- Soon: "`contact.updated_at` instead of bumping `created_at`…"; "Onboarding polish: 'Save and exit' saves nothing; support banner overlaps the onboarding top row; …"; "Owner-pick clock: cancel + re-ask restarts the 14-day wait…"; "`client-boundary` gate ignores default imports/barrels; pages import constants from `'use client'` modules (`knowledge/page.tsx` `selectClass`)" — *phase-16* (non-visual except the banner overlap; candidates only)
Design system v1 implementation:
- "Extend `@cs/ui` `ConfirmDialog` (controlled open, inline error, children) and fold the page-local `ActionDialog` … into it" — *phase-15c3 (R11)*
- "plans-tab 'Agencies not on the current version' uses the shadow `card`; move `billing/plan-move-parts.tsx` to `platform/_components/`; web hard-codes `['ask','mcp']` instead of `PLAN_FEATURES`" — *phase-15c3b*
- "`--color-secondary-foreground` is still a literal" — *phase-15c2a*
- "Hex without tokens: disabled `bg-[#CBD5E1]`; signal-pills unticked border `#CBD5E1`; tier chip `#E2E8F0`/`#F1F5F9`/`#4A5D73`; topic-heatmap INK/WHITE/LINE and sentiment fills" — *phase-15c2b2*
- "Migrate the app … 09 § 9 (11 PRs …). 153 Card/shadow-card usages mapped." — *design-system*
- "Validate the responsive proposal (D-23: drawer < 1024, bottom tab bar < 768) with 3–5 pilot owners on phones before PR 10." — *design-system*
- Older items (prior brief § 4): chip hex dup, `global-error` Inter, 'Other' #94a3b8/categorical fail dataviz, KPI `text-xl`, heatmap table, `#B45309`, snippet #47A8E7, 8c strip > 1560px, tips in `CardTitle`.

### 5. In flight
`git branch --no-merged main`: none (phase-16 = main). Next migration **0096** (last `0095_onboarding_split.sql`).

### 6. Open questions (by design impact)
1. **Split / first sub-phase.** a) **16a foundations PR1–4 (tokens, primitives, new primitives, container sweep; tokenise OnboardingShell) → 16b shell + PageHeader + Overview slice (owner stop) → 16c client workspace + detail/settings → 16d Friday + briefs → 16e agency, account, platform, public → 16f responsive + lock-in** (rec.; first = 16a); b) 11 sub-phases, one per PR; c) one branch, page by page.
2. **New UI vs D1 "look only".** a) In: drill-in settings nav, bulk bar only where bulk actions exist, peek panel; docked Friday (D-14) in 16d (rec.); b) all DS pieces incl. new behaviours everywhere; c) strict restyle, new pieces to backlog.
3. **Bottom tabs (OD-5 vs 15a D8).** a) drawer only now; bottom tabs to backlog until pilot owners test on phones (rec.; pilots not started); b) prototype + owner phone test in 16f, then build; c) build per D-23 now.
4. **Mockups.** a) storyboard frames = approval for framed pages; one HTML mockup per unframed group (agency, platform, auth) and per new piece, as in 16-onboarding (rec.); b) mockup every page; c) none.
5. **Visual verification.** a) Playwright screenshots 1440 + 390 per page vs frame, owner review per sub-phase (rec.); b) owner manual only.
6. **Pages without a frame.** a) nearest archetype + frame components, no new patterns (rec., 07); b) design new frames first.
7. **Tests / axe.** a) class-asserting unit tests → role/`data-slot`/`data-variant`; E2E stays role-based; add `@axe-core/playwright` (dev dep) in 16a (rec.; 16-onboarding deferred axe); b) broad `data-testid`; c) no axe.
8. **Lint gate.** a) `design-lint.sh` report-only, blocking in lock-in, CI only on approval (rec.); b) blocking from the start.
9. **13a ordering.** a) 16a/16b first; 13a after, on new tokens (rec.); b) 13a first; c) in parallel (conflicts in `theme.ts`, shell, auth card).
Resolved since prior brief: 15c-2a merged (old Q3); dark mode out (15a D11; old Q7); switcher in sidebar (D3).
