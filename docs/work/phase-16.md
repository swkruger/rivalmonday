# phase-16 — design system v1 on every page except onboarding

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-16   **Base:** main @ 0c28be0e
**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (D10–D19). **Plans:** one per sub-phase, written just before it runs. Inputs `docs/design-system/` (09 § 9). Prior brief + page inventory (87 pages → frame/archetype): `git show 1c2d0f0e:docs/work/phase-16.md`.

## Status (overwrite)
2026-10-27: **16a + 16b + 16c done** on this branch (plans `docs/superpowers/plans/2026-10-27-phase-16{a-foundations,b-shell-overview,c-client-pages}.md`). Session paused by the owner after 16c. 16c: Competitors (flush table, suggestion cards + BulkBar), competitor detail (detail header + avatar, KPI strip, 2x2 hairline modules, xl side column), Changes (toolbar, segmented links, peek panel Prev/Next/Close + Esc), Moves, Recommendations, Pitch snapshot, Ads, Reviews, Rankings, Pricing, Evidence, client settings on the Form archetype; `@cs/ui` segmented link classes, BulkBar, control classes (`nativeSelectClass`, `textareaClass`, `toolbarControlClass`), Section `labelled` (opt-in named region), HairlineGrid multi-row fix; StatCard retired → StatStrip; one client-settings rule; E2E seed scores the $49 promo (2 days back). Unit affected green (db/mcp re-run alone after a test-DB overlap); E2E affected 145/145; shots 88/88 with gates off. design-lint 450 → 236 (16a) → 191 (16b) → 177 (16c). Chart ramps validated (sequential/diverging): all pass, no colour change.

## Next (overwrite)
1. **Open 16c items, do first:** (a) 4 axe-gated shot routes fail `scrollable-region-focusable`: `client-pitch-snapshot@390` (`@cs/ui` `Table` wrapper `overflow-x-auto`), `client-evidence` + `owner-evidence@1440` (screenshot box `max-h-[720px]`), `client-reviews@390` (heatmap scroll box). Evidence/reviews were already in the 16a `before` baseline. Fix = `tabIndex={0}` + `role="region"` + `aria-label` on each scroll box; for the shared `Table` wrapper prefer making only overflowing tables focusable (or gating on a `label` prop) — it's on every table, so check a11y names don't change elsewhere (D1). Then `SHOTS_LABEL=after pnpm --filter @cs/web shots` must pass with gates on. (b) Flaky `e2e/platform.spec.ts:192` (pre-existing): after the Unarchive confirm click add `await expect(page.getByRole('dialog')).toHaveCount(0)` before `page.goto` (the goto aborts the POST).
2. Then the 16d plan (Friday + briefs, spec § 3) → SDD → 16e → 16f. Owner review only at the end (D10). SDD ledgers for 16a–16c are in `.superpowers/sdd/` (gitignored) — read the 16c `progress.md` "Ruling:" lines for the end-of-phase rulings list.
3. Process notes for parallel implementers in one worktree: commit by explicit paths (`git commit -- <paths>`), never amend, no Playwright inside tasks, never run two vitest/E2E runs on the test DB at once (a turbo unit run + a focused web vitest collided once).

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
- Chart context grey #A3B1C2 is exempt from the dataviz chroma/contrast floor (recessive role; legend + table view). Rank charts highlight the best-ranked rivals.
- D10–D19 (2026-10-27): see spec § 2 — six sub-phases in one continuous pass on this branch; narrow new-UI set; no bottom tabs; shots + axe harness; lint report-only; 13a after; onboarding screens may change.

## New backlog (target → item)
- BACKLOG: top-bar search trigger + Ask pill (Frame 2); sidebar collapse-to-rail; brand-aware chart check (`--you` = agency secondary may clash with rival orange #E05A2B) → 13a.
- 16d: `brief-view` shared body literals (`rounded-[10px]`, `text-[15px]`, `CardTitle text-[17px]`); Ask page `aside` is a second complementary landmark; HelpTip trigger uses agency-coloured outline; `recommendation-board` rationale still `text-muted-foreground`; a `nativeInputClass` alias (Reviews' text input uses `nativeSelectClass`).
- 16e: review-controls pressed state now primary fill (was `secondary`); remaining native controls `rounded-md bg-transparent` (scope-fields, review-queue, knowledge/editor, ask-card, assign-form); agency-coloured `focus-visible:ring-primary` (help-index, help-tip, page-guide) → fixed focus; runbook editor (`components/runbook/*`, P10); client billing as definition rows + Delivery form as a Section (16c deviations); agency/platform pages' `gap-10` spacing per page; platform/sign-up colour-contrast + scroll-region axe hits (ungated today).
- BACKLOG (16c): applied-filter chips with ✕; bulk bar Select all/clear; client danger zone; Competitors stacked mobile rows (16f); `rounded-[5px]` literal on Moves rows; thin tests (AI page sections, Rankings compare form, history-period nav).
- 16f: fold onboarding Field into `@cs/ui` Field; delete `--shadow-card`; `design-lint --strict` (first: stop silencing git-grep errors, count untracked files, allowlist playbook literals `border-[1.5px]`/`rounded-[2px]`/gradient/`size-[11px]`/`leading-[18px]`/`tracking-[-0.01em]`); StatusChip `icon` required; onboarding `min-h-screen` + banner spacer scroll; banner height in 3 places → one constant; remaining onboarding `#8796AB`/`text-[11px]`.
- 13a: checked Switch uses `bg-secondary` + white thumb (~1.4:1 on #FFD400).
- Card-in-card reduced to plain wrappers (P4): `agency/leads/lead-card.tsx:135` (quote rule), `components/ai-connections.tsx:128` (Band), `changes/viewer.tsx` (frame kept as media well), `competitor-controls.tsx:193,361` (divided list). Not traced across component files.
- BACKLOG § Design system: OD-5 bottom tab bar < 768 waits for 3–5 pilot-owner phone tests (D12).

## Owner verification steps
At the end: (1) before/after shots `apps/web/.shots/index.html` (re-run `pnpm --filter @cs/web shots` with `SHOTS_LABEL`); (2) decide `design-lint` in CI (D17); (3) sign copy: drill-in back link "Back to {client name}" / "Back to {agency name}" (fallbacks "Back to Overview" / "Back to Portfolio"); Changes peek panel "Previous change" / "Next change" / "Close details", bulk bar "Selected suggestions"; Field sr-only "(required)", SaveBar visible "Unsaved changes" (aria-hidden), toast region label "Notifications (F8)" (radix default); (4) primary hover/active now derived per agency and **lighter** on the default blue (#56AFE9/#64B6EB; DS docs said darker #2F93D6/#2581C2, which fails 4.5:1 with the ink label): approve, then update 05/08/`design-tokens.json`/`rm-tokens.css`/frame 11; (5) note 16c structure changes (additive, D1 judged OK): former Card titles are now `h2`s (competitors, competitor detail, evidence, settings, AI connections), competitor detail shows Pages before Collection status, platform KPI badge tones moved to the chip palette.

## 16a numbers
Lint baseline (Task 1) 450: shadow-card 63, radius 77, off-scale 10, extrabold 16, uppercase 9, focus-ring 36, hex 122, amber 9, shadow-sm.. 12, Badge 4, text-px 92. After 16a 236 (shadow-card 1 = token definition, rounded-[14px] 0, focus-ring 0, Badge 0). Shots: 33 routes × 1440/390; axe before 30 serious / 0 critical.

## Brief
Kickoff brief (scope, reuse map, binding decisions, backlog, Q1–Q9): `git show 02882a26:docs/work/phase-16.md`. Answers → spec § 2.
