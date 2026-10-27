# phase-16 — design system v1 on every page except onboarding

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-16   **Base:** main @ 0c28be0e
**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (D10–D19). **Plans:** one per sub-phase, written just before it runs. Inputs `docs/design-system/` (09 § 9). Prior brief + page inventory (87 pages → frame/archetype): `git show 1c2d0f0e:docs/work/phase-16.md`.

## Status (overwrite)
2026-10-27: **16a–16d done** on this branch (plans `docs/superpowers/plans/2026-10-27-phase-16{a-foundations,b-shell-overview,c-client-pages,d-friday-briefs}.md`). 16d: web-only read tool `get_evidence_refs` (+ isolation fixture, demo coverage); `server/evidence-refs.ts` (`evidenceRefsFor`, never throws, profile tz); every evidence chip is a `CitationPill` (`asChild` keeps next/link; name `Evidence n: source, date`, fallback `Evidence n`); brief/alert/report reading views (680 px, items `h2`, why-it-matters Band, Table trend); Ask page (flat answers, user bubble, SourcesList, ↳ starters, composer with scope Tag + icon send `Ask`, thread list behind a divider); **docked Friday panel** (D-14: trigger in `PageHeader` on client pages, 400 px column ≥ 1280 / right Sheet below, state in the client layout, panel chat keeps its own thread id, proposed writes link to the full thread); 16d minors (HelpTip fixed focus, rationale ink, `nativeInputClass`). Checks: test:affected green after the fix wave (no-console + demo coverage fixed), E2E affected 146/146, shots 94/94 gates on (16d routes gated: ask, brief, alert, report, owner brief/alert). design-lint 177 → 165.

## Next (overwrite)
1. **16e plan** (agency, account, platform, public; spec § 3 row 16e; mockups per D13 first for unframed groups) → SDD → final review → fix wave. Then 16f. Owner review only at the end (D10). Fold the 16e backlog lines below.
2. End-of-phase rulings list: SDD ledgers in `.superpowers/sdd/` (gitignored) — collect every `Ruling:` line from 16a–16d `progress.md`.
3. Process: commit by explicit paths, never amend, no Playwright inside tasks, one test run per test DB at a time — now enforced by the main checkout's Claude Code hooks (`scripts/hooks/`, uncommitted on main; this worktree's `.claude/settings.json` predates them).

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
- 16e (from 16d): approvals + recommendations pass evidence refs to `EvidenceChips` (named pills); `answer.test` class assertions → slots (D16); `help-tip.tsx` `text-[10px]` needs a token; Sheet width `w-full sm:max-w-[400px]` for the panel on phones (16f full-screen route).
- BACKLOG (16d): Friday panel feedback icons, follow-ups after answers, conversation title, toast (Frame 12); composer draft survives panel close/resize; panel's stale proposed-write link after confirming on the full page; layout dock reads repeat on every Ask-page refresh (request-cache starters/profile); `refsAction` in page mode duplicates `router.refresh` (gate to panel).
- 16e: review-controls pressed state now primary fill (was `secondary`); remaining native controls `rounded-md bg-transparent` (scope-fields, review-queue, knowledge/editor, ask-card, assign-form); agency-coloured `focus-visible:ring-primary` (help-index, help-tip, page-guide) → fixed focus; runbook editor (`components/runbook/*`, P10); client billing as definition rows + Delivery form as a Section (16c deviations); agency/platform pages' `gap-10` spacing per page; platform/sign-up colour-contrast + scroll-region axe hits (ungated today).
- BACKLOG (16c): applied-filter chips with ✕; bulk bar Select all/clear; client danger zone; Competitors stacked mobile rows (16f); `rounded-[5px]` literal on Moves rows; thin tests (AI page sections, Rankings compare form, history-period nav).
- 16f: fold onboarding Field into `@cs/ui` Field; delete `--shadow-card`; `design-lint --strict` (first: stop silencing git-grep errors, count untracked files, allowlist playbook literals `border-[1.5px]`/`rounded-[2px]`/gradient/`size-[11px]`/`leading-[18px]`/`tracking-[-0.01em]`); StatusChip `icon` required; onboarding `min-h-screen` + banner spacer scroll; banner height in 3 places → one constant; remaining onboarding `#8796AB`/`text-[11px]`.
- 13a: checked Switch uses `bg-secondary` + white thumb (~1.4:1 on #FFD400).
- Card-in-card reduced to plain wrappers (P4): `agency/leads/lead-card.tsx:135` (quote rule), `components/ai-connections.tsx:128` (Band), `changes/viewer.tsx` (frame kept as media well), `competitor-controls.tsx:193,361` (divided list). Not traced across component files.
- BACKLOG § Design system: OD-5 bottom tab bar < 768 waits for 3–5 pilot-owner phone tests (D12).

## Owner verification steps
At the end: (1) before/after shots `apps/web/.shots/index.html` (re-run `pnpm --filter @cs/web shots` with `SHOTS_LABEL`); (2) decide `design-lint` in CI (D17); (3) sign copy: drill-in back link "Back to {client name}" / "Back to {agency name}" (fallbacks "Back to Overview" / "Back to Portfolio"); Changes peek panel "Previous change" / "Next change" / "Close details", bulk bar "Selected suggestions"; Field sr-only "(required)", SaveBar visible "Unsaved changes" (aria-hidden), toast region label "Notifications (F8)" (radix default); (4) primary hover/active now derived per agency and **lighter** on the default blue (#56AFE9/#64B6EB; DS docs said darker #2F93D6/#2581C2, which fails 4.5:1 with the ink label): approve, then update 05/08/`design-tokens.json`/`rm-tokens.css`/frame 11; (5) 16d: sign copy P8 — panel close `Close {name}`, link `Open full conversation`, panel line `Open the full conversation to confirm this change.`, scope chip = client name; report counts lost their trailing colon (`Briefs sent` etc.); by hand: open the Friday panel on client A, switch to client B with the context switcher → panel closed; resize across 1280 px with the panel open → same conversation; pills now name the competitor + date on brief/alert/Ask (dates in the client's zone like other client pages); (6) note 16c structure changes (additive, D1 judged OK): former Card titles are now `h2`s (competitors, competitor detail, evidence, settings, AI connections), competitor detail shows Pages before Collection status, platform KPI badge tones moved to the chip palette.

## 16a numbers
Lint baseline (Task 1) 450: shadow-card 63, radius 77, off-scale 10, extrabold 16, uppercase 9, focus-ring 36, hex 122, amber 9, shadow-sm.. 12, Badge 4, text-px 92. After 16a 236 (shadow-card 1 = token definition, rounded-[14px] 0, focus-ring 0, Badge 0). Shots: 33 routes × 1440/390; axe before 30 serious / 0 critical.

## Brief
Kickoff brief (scope, reuse map, binding decisions, backlog, Q1–Q9): `git show 02882a26:docs/work/phase-16.md`. Answers → spec § 2.
