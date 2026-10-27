# Phase 16a — design system foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land design system v1's tokens, restyled + new `@cs/ui` primitives and the app-wide container safety sweep (playbook PRs 1–4), plus a screenshot/axe harness and a report-only design lint, without changing any behaviour.
**Architecture:** Tokens in `packages/ui/src/styles.css` (Tailwind 4 `@theme inline`) and `theme.ts`; primitives in `packages/ui/src/components/*`, exported from `packages/ui/src/index.ts`; codemods C1–C4 across `apps/web/src`. A separate Playwright config captures before/after shots.
**Tech Stack:** TypeScript, React 19, Next.js App Router, Tailwind v4, `radix-ui` 1.6 (monolith package), `lucide-react`, Vitest + Testing Library, Playwright 1.63, `@axe-core/playwright` (new dev dep).
**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (§ 2 D10–D19, § 4). Recipes: `docs/design-system/09-ai-implementation-playbook.md` §§ 3, 4, 6.1, 7, 8 — **binding; tasks cite them instead of repeating class strings.** Component behaviour: `docs/design-system/06-component-catalog.md`.

## Global Constraints
- **No behaviour change** (D1): no route, data, copy, a11y-name or E2E-path change. Only new copy: Field's sr-only "(required)".
- **Tokens, not values** (09 § 0 rule 1): no hex, `rounded-[…]`, `text-[…px]`, shadow literals in components. Playbook recipes' `text-[13px]` → `text-13`, `text-[11px]` → `text-11` (spec § 4.1). Allowed literals: layout widths/heights, the chart files listed in 09 § 8.
- **White-label:** only `--primary`/`--secondary` (+ derived soft tokens, `--primary-foreground`, `--secondary-foreground`) vary per agency. `--focus` is fixed `#2A6BAC`.
- Keep component names, exports and `data-slot` attributes. Tests that assert class strings move to role / `data-slot` / `data-variant` / `data-tone` (D16) **in the task whose change breaks them**.
- Read `packages/ui/CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/gotchas-cross-cutting.md` before coding. LF only. Commits end `Co-Authored-By: <own model> <noreply@anthropic.com>`.
- Implementers run focused tests only (`pnpm --filter @cs/ui exec vitest run <pattern>`, `pnpm --filter @cs/web exec vitest run <pattern>`); `test:affected` / `e2e:affected` / shots run once at the final review. Test DB: this worktree's `.env` (`cs_phase_16_test`); never two runs on it at once; shots and E2E share port 3100 — never together.
- No migrations.

## Decisions
Spec D10–D19 and § 4.1 deltas. Plan-local: (P1) StatusChip default glyphs: warning `TriangleAlert`, danger `CircleAlert`, success `CircleCheck`, info `Info`, neutral none. (P2) `TierChip` stays as a web wrapper rendering `TierMark` (call sites untouched). (P3) `ActionDialog` stays a thin web wrapper over a controlled `ConfirmDialog`. (P4) Codemod outputs that create card-in-card get the inner wrapper reduced to a plain `div` (no border); each case is listed in the work file.

## File structure
- `packages/ui/src/styles.css`, `theme.ts`, `theme.test.ts`, new `tokens.contrast.test.ts`
- `packages/ui/src/components/`: restyle `button, input, select, label, switch, tabs-classes, tabs, tabs-link, dialog, sheet, dropdown-menu, popover, tooltip, command, save-bar, confirm-dialog, table, card, status-chip, friday-badge`; delete `badge.tsx`; new `field, segmented, toast, dot-status, filter-chip, tag, tier-mark, alert, section, band, kpi-strip, citation-pill, sources-list` (+ `*.test.tsx` each); `index.ts`
- `apps/web/`: `playwright.shots.config.ts`, `e2e-shots/{routes.ts,shots.spec.ts}`, `scripts/shots-index.ts`, `package.json` (`shots`, dev dep); `src/components/shell/shell-providers.tsx` (Toaster); `src/components/rival/tier-chip.tsx`; `src/app/(platform)/platform/agencies/[id]/action-dialog.tsx`; `src/app/(platform)/platform/billing/{plan-move-parts.tsx → ../_components/plan-move-parts.tsx, parse.ts, plan-editor.tsx}`; `src/components/onboarding/*`; codemod targets across `src/`
- Root: `scripts/design-lint.sh`, `package.json` (`design:lint`)

## Dependencies on in-flight work
None (`git branch --no-merged main` empty at 0c28be0e). 13a runs after Phase 16 (D18).

## Review Focus
1. **Extreme agency colours** (`#FFD400`, `#111111`, `#E11D48` as primary or secondary): primary/secondary button text stays ≥ 4.5:1 and the focus outline stays visible → Task 3 tests.
2. **Focus outline clipped** by `overflow-hidden` parents (TableFrame, Card, dialogs) after `ring` → `outline-offset-2`: keyboard focus must stay visible → Task 9 TableFrame test asserts focusable cells' container uses `overflow-clip` with padding or `focus-visible:outline-offset-[-2px]` on inner controls; reviewer tabs through a dialog and a table frame in the shots run.
3. **Read-only mode** (support session / hold) renders controls disabled: disabled controls must stay distinguishable and not look enabled after `opacity-45` → Task 4 test asserts `disabled` Button has `data-disabled`/`disabled` and the class set includes `disabled:opacity-45`; shots include one support-session page.
4. **Field with a child that already has `id` / `aria-describedby`** (existing forms): Field must merge, not overwrite → Task 5 test.
5. **Dialogs at 390 px** with long bodies (ConfirmDialog with children, ActionDialog refusal): content scrolls inside the dialog, footer reachable → Task 7 test asserts content has `max-h-[calc(100dvh-2rem)]` + `overflow-y-auto` body; shots at 390.

---

### Task 0: Pre-flight
- [ ] `git rebase main`; `pnpm install`; re-run every 09 § 8 command and the spec § 4.1 counts (`<Card`, `shadow-card`, `rounded-[14px]`, StatusChip call sites, `variant="secondary"`, `<Badge`). If any count or a file named in this plan moved, fix the plan inline and note it in `docs/work/phase-16.md` § Status. Commit `docs(phase-16): 16a pre-flight` if changed.

### Task 1: Screenshot + axe harness and design lint (no visual change)
**Goal:** capture `before` shots and a lint baseline before anything changes.
**Files:** create `apps/web/playwright.shots.config.ts`, `apps/web/e2e-shots/routes.ts`, `apps/web/e2e-shots/shots.spec.ts`, `apps/web/scripts/shots-index.ts` (+ `shots-index.test.ts`), `scripts/design-lint.sh`; modify `apps/web/package.json`, root `package.json`.
**Interfaces (produces):**
```ts
// routes.ts
export type ShotAs = 'admin' | 'agency' | 'owner' | 'support' | 'signed-out';
export type ShotRoute = { label: string; path: string | ((fx: ShotFixtures) => string); as: ShotAs; gate?: boolean };
export type ShotFixtures = { clientId: string; competitorId: string; evidenceId: string; briefId: string; agencyId: string; setupClientId: string };
export const SHOT_ROUTES: ShotRoute[];
export const SHOT_VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }] as const;
// apps/web/scripts/shots-index.ts
export function writeIndexPage(rootDir: string): void; // pairs <label>-<w>.png across label folders (before/after/…) into rootDir/index.html
```
**Behaviour:**
- Config mirrors `playwright.config.ts` exactly (imports `E2E_SERVER_ENV`, same `globalSetup`, `webServer`, port) but `testDir: './e2e-shots'`, `timeout: 180_000`. `e2e`/`e2e:affected` never match `e2e-shots/` (verify `scripts/e2e-affected.ts` globs).
- Routes per spec § 4.6 + D19 (≈ 30; include one `support` route). Fixtures come from the existing seed fixture files (`*_FIXTURE_FILE` in `playwright.config.ts`) and `e2e/helpers.ts` `signIn` / `e2e/admin-session.ts`; pick seeded personas from `e2e/seed.ts`.
- Per route × viewport: `page.goto`, wait `networkidle`, full-page PNG to `apps/web/.shots/${shotsLabel(process.env.SHOTS_LABEL)}/${label}-${width}.png`; `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()`; append `{ label, width, serious, critical, ids }` to `axe.json` in the same folder. Assert 0 serious+critical only when `gate: true` (none in 16a). `afterAll` → `writeIndexPage(apps/web/.shots)`.
- `apps/web/package.json`: `"shots": "playwright test -c playwright.shots.config.ts"`, dev dep `@axe-core/playwright` (current 4.x).
- `scripts/design-lint.sh` (Git Bash, `rg`): one labelled count per 09 § 8 line plus `text-\[[0-9]+px\]` (apps/web/src + packages/ui/src, tests excluded, the § 8 chart allowlist), prints `label: N` and `total: N`; exit 0 unless `--strict` and total > 0. Root `"design:lint": "bash scripts/design-lint.sh"`.
**Tests (first):** `apps/web/scripts/shots-index.test.ts` (web vitest includes `scripts/**/*.test.ts`), on a tmp dir: two label folders with `a-1440.png` → html contains both `<img>` srcs in one row; a route missing in one folder renders "missing".
**Done when:** `pnpm design:lint` prints counts (record them in the work file as the baseline); `SHOTS_LABEL=before pnpm --filter @cs/web shots` completes (~60 PNGs + `axe.json`); commit (shots are gitignored under `apps/web/.shots/`).

### Task 2: Tokens + radius trap + contrast test (PR 1)
**Files:** modify `packages/ui/src/styles.css`, `button.tsx`, `input.tsx`, `select.tsx`, `tabs-classes.ts` (radius only), any textarea; create `packages/ui/src/tokens.contrast.test.ts`.
**Interfaces (produces):** every token in 09 § 3.1/3.2, plus in `@theme inline`: `--text-13: 0.8125rem; --text-13--line-height: 1.125rem; --text-11: 0.6875rem; --text-11--line-height: 0.875rem;` → classes `text-13`, `text-11`. `--chip-warning-bg: #FFF7E6`. `:root --secondary-foreground: #FFFFFF` + `--color-secondary-foreground: var(--secondary-foreground)` (replaces the literal). `--shadow-card` stays until Task 11.
**Behaviour:** radius chain → fixed values (09 § 3.2); controls → `rounded-sm` in the same commit (09 § 3.3). `--muted-ink` → `#5B6B80`, `--color-input` → `--line-strong`, `--color-ring` → `--focus`.
**Tests (first):** `tokens.contrast.test.ts` — literal table of 05 § 2 "Approved foreground/background pairs", each `contrastRatio(fg, bg) >= threshold` (import `contrastRatio` from `../theme`); plus `styles.css` parse check: the file contains `--radius-md: 8px`, `--muted-ink: #5B6B80`, `--focus: #2A6BAC` (read with `fs`).
**Done when:** `pnpm --filter @cs/ui exec vitest run` green; `pnpm --filter @cs/web build` succeeds (Tailwind resolves `text-13`); commit `feat(ui): design tokens v1 (16a PR1)`.

### Task 3: `theme.ts` foregrounds and fixed focus
**Files:** modify `packages/ui/src/theme.ts`, `theme.test.ts`.
**Interfaces:** `themeVars(b)` additionally returns `'--secondary-foreground': readableTextOn(secondary)`; it never returns `--focus`.
**Tests (first):** for each of `#47A8E7 #FFD400 #111111 #2A6BAC #E11D48` as primary **and** as secondary: `contrastRatio(vars['--primary-foreground'], primary) >= 4.5`, same for secondary; `'--focus' in themeVars(...) === false`; default `#47A8E7` → `--primary-foreground === '#0B2540'`.
**Done when:** ui tests green; commit.

### Task 4: Button restyle (PR 2) + C9 in `packages/ui`
**Files:** `button.tsx`, `ui-primitives.test.tsx`, `apps/web/src/app/(platform)/platform/agencies/page.tsx:93`.
**Interfaces:** variants `default | outline | ghost | destructive | destructive-outline | link`; sizes `default | sm | lg | icon | icon-sm | icon-lg`. Removed: `secondary`, `xs`, `icon-xs`. Root renders `data-variant` and `data-size`.
**Behaviour:** classes per 09 § 4.1 (with `text-13`); `aria-busy:pointer-events-none`. The one `variant="secondary"` call site → `outline`. C9 across `packages/ui/src`. Destructive-fill call sites in web are **not** audited here (16c–16e).
**Tests (first):** each variant renders `data-variant`; `size="sm"` → `data-size="sm"`; disabled button has `disabled` and its class list includes `disabled:opacity-45`; TS: `// @ts-expect-error` on `variant="secondary"`. Rewrite any class-string assertions in `ui-primitives.test.tsx` to `data-variant`.
**Done when:** `pnpm --filter @cs/ui exec vitest run` + `pnpm --filter @cs/web exec tsc --noEmit` green; commit.

### Task 5: Form controls + `Field`
**Files:** `input.tsx`, `select.tsx`, `label.tsx`, `switch.tsx`, create `field.tsx` + `field.test.tsx`, `index.ts`.
**Interfaces:** `Field({ label: ReactNode; required?: boolean; optional?: boolean; help?: ReactNode; error?: ReactNode; children: ReactElement; className?: string })`.
**Behaviour:** classes per 09 § 4.4. Field: `useId()` for control id unless the child has `id` (keep it); help id / error id appended to the child's existing `aria-describedby` (space-joined, deduped); `aria-invalid` only when `error`; error replaces help; required marker `<span aria-hidden className="text-danger-text">*</span>` + `<span className="sr-only">(required)</span>`; optional → `(optional)` muted text. Error icon `CircleAlert size-3.5`.
**Tests (first):** label is associated (`getByLabelText`); child with `id="x" aria-describedby="y"` keeps `id="x"` and ends with `aria-describedby="y <helpId>"`; `error` sets `aria-invalid="true"` and hides help; required renders sr-only "(required)".
**Done when:** ui tests green; commit.

### Task 6: Tabs + `Segmented`
**Files:** `tabs-classes.ts`, `tabs.tsx`, `tabs-link.tsx`, their tests; create `segmented.tsx` + test; `index.ts`.
**Interfaces:** `Segmented({ value: string; onValueChange: (v: string) => void; items: { value: string; label: ReactNode; disabled?: boolean }[]; 'aria-label': string; className?: string })` on radix `ToggleGroup` type single; ignores deselect (empty value).
**Behaviour:** classes per 09 § 4.3 (`text-13`, counts `text-11`). Migrating `Tabs` uses to `Segmented` is **not** in 16a (16c–16e).
**Tests (first):** Segmented renders `role="radiogroup"` with accessible name; clicking an item calls `onValueChange`; clicking the active item does not call it with `''`; tabs tests assert `aria-selected` / `aria-current="page"` instead of classes.
**Done when:** ui tests green; commit.

### Task 7: Overlays + `Toast`
**Files:** `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `command.tsx` (+ test), `save-bar.tsx`; create `toast.tsx` + test; `index.ts`; `apps/web/src/components/shell/shell-providers.tsx`.
**Interfaces:**
```ts
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element; // renders radix Toast.Provider + Viewport (bottom-right)
export function useToast(): { show(opts: { message: string; action?: { label: string; onClick: () => void } }): void };
// Sheet: side?: 'top'|'right'|'bottom'|'left' — 'bottom' per 09 § 4.6
```
**Behaviour:** per 09 § 4.6 (tooltip Arrow removed; command footer hint row and "Ask {assistant}" group are **not** added — no new copy, D1). Dialog content: `max-h-[calc(100dvh-2rem)]`, body `overflow-y-auto`. Toast duration 4000 ms, 6000 ms with action; `role="status"`. `ShellProviders` wraps children in `ToastProvider`; no call sites.
**Tests (first):** toast: `show({message:'Saved'})` renders `role=status` text "Saved"; with action renders a button that calls `onClick`; auto-dismiss after 4000 ms (fake timers). Dialog: content element has `overflow-y-auto` body and `data-slot="dialog-content"`. Command test still passes.
**Done when:** ui tests + `pnpm --filter @cs/web exec vitest run shell` green; commit.

### Task 8: `ConfirmDialog` extension + `ActionDialog` wrapper
**Files:** `packages/ui/src/components/confirm-dialog.tsx` (+ new `confirm-dialog.test.tsx` if none), `apps/web/src/app/(platform)/platform/agencies/[id]/action-dialog.tsx`.
**Interfaces:** existing props plus `open?: boolean; onOpenChange?: (open: boolean) => void; error?: ReactNode; children?: ReactNode; trigger?: ReactNode` (optional only when `open` is set — enforce with a discriminated union type). Error renders in a `role="alert"` region above the footer. Confirm button `variant="destructive"` only when `tone="danger"`.
**Behaviour:** `ActionDialog` keeps all web-only behaviour (spec § 4.3: `FormResult`, `refusal`, close-only fallback, `canSubmit`, `onDone`, `ErrorNote` focus, autofocus rule, `confirm-text` stripping) and renders a controlled `ConfirmDialog` for chrome; `ErrorNote` is passed as `error`.
**Tests (first):** controlled `open` without trigger renders; `error` → `getByRole('alert')`; typed confirmation keeps the action disabled until it matches; `tone="danger"` → confirm button `data-variant="destructive"`, otherwise `default`. Existing platform agency tests and `e2e/platform*.spec.ts` paths unchanged (reviewer reads, does not run).
**Done when:** ui tests + `pnpm --filter @cs/web exec vitest run agencies` green; commit.

### Task 9: Containers, table, Card = Frame
**Files:** `card.tsx`, `table.tsx`; create `section.tsx`, `band.tsx`, `kpi-strip.tsx` (+ tests); `index.ts`.
**Interfaces:**
```ts
Section({ title?: ReactNode; description?: ReactNode; actions?: ReactNode; as?: 'h2'|'h3'; ruled?: boolean; className?; children })
Band({ tone?: 'canvas'|'muted'; className?; children })
KpiStrip({ children; className? }) ; Kpi({ label: ReactNode; value: ReactNode; delta?: KpiDelta; href?: string })
type KpiDelta = { value: number; unit?: string; goodWhen: 'up'|'down'|'neutral'; comparison: string }
TableFrame({ children; className? }) ; Table density?: 'compact' ; TableHead/TableCell numeric?: boolean
Card variant?: 'default'|'interactive' ; selected?: boolean   // data-variant, data-selected
```
**Behaviour:** classes per 09 § 4.5, § 4.7, § 5.3 (hairline grid from § 6.1 B). `ruled` → `border-t border-line pt-6`. Kpi delta: arrow (`ArrowUp`/`ArrowDown`, none at 0), signed value + unit, `comparison` caption; tone good (`text-success-text`) when direction matches `goodWhen`, bad (`text-danger-text`) when opposite, neutral `text-muted-ink`; `aria-label` "Up 0.1 from last week" = `${Up|Down|No change} ${abs}${unit ?? ''} ${comparison}`. `href` → whole cell is a link. TableFrame: `overflow-clip` (not `overflow-hidden`) so child focus outlines aren't cut.
**Tests (first):** Section renders `<section>` with h2 (h3 with `as`); Kpi `{value:-2, goodWhen:'down', comparison:'from last week'}` → label "Down 2 from last week", `data-tone="good"`; value 0 → "No change"; Kpi with href is a link containing label+value; TableFrame root class has `overflow-clip`; `numeric` cell has `text-right tabular-nums`; Card `variant="interactive" selected` → `data-variant="interactive" data-selected="true"`.
**Done when:** ui tests green; commit.

### Task 10: Status family, Friday parts; delete Badge; hex sweep
**Files:** `status-chip.tsx` (+test), `friday-badge.tsx`; delete `badge.tsx` + export; create `dot-status.tsx`, `filter-chip.tsx`, `tag.tsx`, `tier-mark.tsx`, `citation-pill.tsx`, `sources-list.tsx` (+ tests); `index.ts`; web `components/rival/tier-chip.tsx`, `components/rival/signal-pills.tsx`, `app/(app)/c/[clientId]/competitors/competitor-controls.tsx` (hex), their tests.
**Interfaces:** as spec § 4.3 (`DotStatus`, `FilterChip`, `Tag`, `TierMark`, `CitationPill`, `SourcesList`, `StatusChip icon?`), `FridayBadge size?: 'default'|'label'`. `TierMark` labels: `TIER_LABELS` from `@cs/core` (`packages/core/src/domain.ts`).
**Behaviour:** per 09 § 4.2, § 4.8; StatusChip default glyph per P1, `icon={null}` suppresses. `TierChip` renders `TierMark` (P2). Hex → tokens per spec § 4.2 (`#CBD5E1`→`line-control`, `#E2E8F0`→`line`, `#F1F5F9`→`canvas`, `#4A5D73`→`ink-secondary`); chart files untouched (16b).
**Tests (first):** each new primitive: role/name (`FilterChip applied field="Rating" onRemove` → button "Remove filter Rating" calls `onRemove`; `pressed` → `aria-pressed="true"`), `data-tone` mapping; StatusChip `tone="warning"` renders an svg `aria-hidden`, `tone="neutral"` none; CitationPill name "Evidence: Google, 3 Oct"; web tier-chip / signal-pills tests assert text + `data-tier` instead of hex classes.
**Done when:** ui + `pnpm --filter @cs/web exec vitest run rival competitor-controls` green; `rg '<Badge' apps/web/src` → 0; commit.

### Task 11: Container sweep C1–C4 + leftovers (PR 4)
**Files:** all of `apps/web/src` hit by 09 § 7 C1–C4; leftover `shadow-card` sites; `packages/ui/src/styles.css` (delete `--shadow-card` only if 0 uses remain — else 16f); move `platform/billing/plan-move-parts.tsx` → `platform/_components/plan-move-parts.tsx` (update imports); `platform/billing/{parse.ts,plan-editor.tsx}` use `PLAN_FEATURES` from `@cs/core`.
**Behaviour:** one commit per codemod (C1, C2, C3, C4), command in the commit body. Then leftovers C1 misses (09 § 6.2 rows marked Control/Remove wrapper, e.g. active toggle pills, `agency-table`, briefs list, Ask aside, `ad-card`, `ask-chat`): replace `shadow-card` with `border border-line` (container) or drop it (control/active pill: `bg-surface border border-line`). No § 6.2 verdicts beyond that (16b–16e). Card-in-card created by the Card restyle → P4. Class-asserting web tests in the files touched (`ad-card`, `briefs/page`, `price-card`, `c/[clientId]/page`, `stat-card`, costs, knowledge, …) → intent assertions.
**Tests:** existing tests green after intent rewrites; new `apps/web/src/lib/design-gates.test.ts`: `rg`-free Node scan of `apps/web/src/**/*.tsx` (non-test) asserting 0 matches for `shadow-card` and `rounded-\[14px\]` (follow `apps/web/src/lib/page-gates.test.ts` + `GATE_EXEMPT` in `page-gates.ts`).
**Done when:** `pnpm --filter @cs/web exec vitest run` on the touched test files + `design-gates` green; `pnpm design:lint` shows `shadow-card` 0 (except the styles.css definition if kept), `rounded-[14px]` 0; commit per step.

### Task 12: Literal sweep + onboarding tokens + banner overlap
**Files:** `apps/web/src/components/onboarding/*` (`onboarding-shell.tsx`, `field.tsx`, siblings) + `onboarding-shell.test.tsx`; C10 sites (`'#64748B'`/`"#64748B"` in `.tsx`, chart files excepted); `(onboarding)/layout.tsx` / banner component for the overlap.
**Behaviour:** spec § 4.1 onboarding mapping (`text-[30px]`→`text-3xl`, `text-[13px]`→`text-13`, `text-[15px]`→`text-base`). Replace local `onboarding/field.tsx` with `@cs/ui` `Field` only where the rendered DOM text/roles are identical; otherwise keep it and add a line to the work file "16f: fold onboarding Field". Support/spend banners inside `(onboarding)`: render in normal flow above the onboarding top row (no overlap) — the banner offsets the shell instead of overlaying it.
**Tests (first):** `onboarding-shell.test.tsx` asserts title is an `h1` with the text and that a support banner rendered via `ShellProviders` precedes the top row in DOM order; remove class-string assertions.
**Done when:** `pnpm --filter @cs/web exec vitest run onboarding` green; `rg 'text-\[(13|15|30)px\]' apps/web/src/components/onboarding` → 0; commit.

### Task 13: Final review prep
- [ ] `pnpm design:lint` → record after-counts next to Task 1 baseline in `docs/work/phase-16.md`.
- [ ] `SHOTS_LABEL=after pnpm --filter @cs/web shots` → `apps/web/.shots/index.html` pairs before/after; reviewer compares against frames 4, 5, 11 (09 § 9 rows 1–4): cards visible on canvas, no lost controls, focus outlines visible.
- [ ] `pnpm test:affected --base main`; `pnpm --filter @cs/web e2e:affected --base main` (not concurrently with shots).
- [ ] Work file: Status "16a done; 16b plan next", P4 card-in-card list, any 16f carry-overs, new BACKLOG lines (OD-5 bottom tabs, D12). Commit `docs(phase-16): 16a done`.
