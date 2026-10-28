# Phase 16f — responsive + lock-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 16: phones work at 390 px (drawer, bottom sheets, no horizontal page scroll), the 16c–16e deferred design minors are done, and design-lint is at 0 and blocking (playbook § 9 PRs 10–11).

**Architecture:** One new `@cs/ui` hook (`useMediaQuery`) and one new primitive (`ResponsivePopover`: Popover ≥ 768, bottom `Sheet` < 768), plus a shared `Frame`. The shots harness gains a 390 px horizontal-overflow gate, which drives the 390 sweep. The lint script becomes strict by default with a reasoned file allowlist. Everything else is token and structure clean-up in files 16a–16e left behind.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, `@cs/ui` (shadcn/radix), Vitest + Testing Library, Playwright (+ `@axe-core/playwright` shots harness), Git Bash (`scripts/design-lint.sh`).

**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (§ 2 D10–D19, § 3 row 16f, § 4.5 lint, § 4.6 harness). Recipes: `docs/design-system/09-ai-implementation-playbook.md` § 8 (detection), § 9 PRs 10–11; responsive table `08-implementation-guide.md` § 4 (lines 84–92) and D-23 in `04-design-decisions.md`; bottom sheet `06-component-catalog.md` (`.rm-sheet-m`); Frame 10 in `07-visual-storyboard.md`. Branch state/backlog: `docs/work/phase-16.md` (16f lines).

## Global Constraints
- D1 look only: no route, permission or copy change. Exceptions decided below: P3 (phone Friday trigger navigates instead of opening a sheet), P5 (Competitors rows stack on phones). Headings keep text **and level** where E2E reads them (list in the 16e plan, Global Constraints line 1).
- Tokens only (`packages/ui/CLAUDE.md`): no hex, `rounded-lg|xl|2xl|[…]`, `text-[…px]`, `shadow-*` literals, `uppercase tracking`, `font-bold|extrabold` in touched lines; `text-13`/`text-11` for 13/11 px (10 px → `text-11`); radii 4/6/8/12/full = `rounded-xs|sm|md|lg|full`. `text-muted-foreground` → `text-muted-ink` in touched files. Layout widths (`max-w-[400px]` etc.) allowed.
- Focus `focus-visible:outline-2 outline-offset-2 outline-ring`. Status = `StatusChip`/`DotStatus`/`Tag` (never colour only). ≤ 1 primary button per view. Amber fill (`bg-amber`) only for Friday/assistant, priority and stars (playbook § 8).
- Media-query components render the **same markup on the server and the first client paint** (state `null` until `matchMedia` has run, like `list-detail-sheet.tsx`); no hydration warnings.
- Tests (D16): class assertions → role / `data-slot` / `data-variant` / `data-tone`; E2E role-based. A moved/new component needs its `apps/web/scripts/e2e-affected-rules.ts` rule checked.
- Implementers run focused tests only (`pnpm --filter @cs/web exec vitest run <pattern>`, `pnpm --filter @cs/ui exec vitest run <pattern>`). **Exception (ruling carried from 16e):** Tasks 1 and 8 may run the shots harness (`pnpm --filter @cs/web shots`, port 3100) — never alongside another Playwright/test run. `test:affected`, `e2e:affected` and the final shots run happen once, in Task 10. Commit by explicit paths (`git commit -- <paths>`), never amend. No migrations (next free `0096`).
- Commit trailer `Co-Authored-By: <your model> <noreply@anthropic.com>`; LF only.

## Decisions (Claude's calls under D10 — recorded for the owner's end review)
Spec D10–D19 and 16a–16e plan decisions stand. Plan-local:
- **P1 Phone scope (D12).** Built: drawer < 1024 (exists), bottom sheets (P2), 390 sweep, page padding 16 / 24 / 32 (< 768 / 768–1023 / ≥ 1024). **Not built** (BACKLOG with OD-5, wait for pilot phone tests): bottom tab bar, full-bleed sections with 8 px canvas bands, 44 px controls, popover-to-sheet for dropdown menus.
- **P2 Bottom sheets.** `ResponsivePopover` replaces `Popover` in `HelpTip` only. The context switcher's drawer copy stays a popover inside the drawer (06 catalog: no nested sheets); its sidebar copy is ≥ 1024 only. `DropdownMenu` row menus stay (radix collision handling works at 390). Dialogs stay centred.
- **P3 Friday on phones.** Below 768 the `FridayDockTrigger` renders a link `Ask {assistant}` to `/c/<clientId>/ask` (the full Ask page — the backlog's "full-screen route"); 768–1279 keeps the right `Sheet`, now `w-full sm:max-w-[400px]`; ≥ 1280 unchanged.
- **P4 Tables on phones** scroll inside their own container (`Table`'s `overflow-x-auto`); the page never scrolls sideways. Exception P5.
- **P5 Competitors stacked rows < 768** (Frame 10, 16c backlog): the same rows render as stacked list rows (name + tier on line 1, the row's existing secondary cells on line 2, same links/actions), via CSS (`max-md:` utilities on the existing `Table` markup or a second `md:hidden` list — implementer's choice; one DOM copy of interactive controls per viewport, the hidden one `hidden`, not just invisible).
- **P6 Lint lock-in.** `scripts/design-lint.sh` exits 1 on any hit by default; `--report` keeps report-only. Allowlist = file globs with a one-line reason each (no inline markers). Allowed: `apps/web/src/dev-panel/**` (dev only, never built for prod); onboarding preview miniatures **only for values that depict an external artefact or the agency's own data** (map tiles, email mock, brand swatches); `bg-amber` in Friday files (`friday-badge.tsx`, `friday-dock-trigger.tsx`, `nav-link.tsx` Ask pill, evidence page "Ask" link) and the priority bar (`c/[clientId]/page.tsx` `BAR`). Everything else is tokenised. **CI:** not added; owner decides at the end (D17).
- **P7 StatusChip icon.** Non-neutral tones always show a glyph: the prop type forbids `icon={null}` unless `tone="neutral"`. Defaults per tone stay.
- **P8 Colours.** Support banner → the warning recipe used by `CostWarningStrip` (tint, left bar, `TriangleAlert`, ink text; keeps `aria-label="Support session"`, fixed position and heights). Costs monthly chart manual series → a non-amber, non-danger colour validated with the `dataviz` skill against the other series (record the ratio in the commit message).
- **P9 `Frame`** = `@cs/ui` `<Frame>` (`data-slot="frame"`, `rounded-md border border-line bg-surface`, optional `flush` = no padding). Replaces the hand-rolled frames named in the backlog; class-asserting tests switch to `[data-slot="frame"]`.

## File structure
- Create: `packages/ui/src/hooks/use-media-query.ts` (+ test), `packages/ui/src/components/responsive-popover.tsx` (+ test), `packages/ui/src/components/frame.tsx` (+ test); export all from `packages/ui/src/index.ts`.
- Modify (main ones): `apps/web/e2e-shots/shots.spec.ts`, `scripts/design-lint.sh`, `packages/ui/src/styles.css`, `packages/ui/src/components/{sheet,status-chip}.tsx`, `apps/web/src/components/{help/help-tip,ask/friday-dock,ask/friday-dock-trigger,shell/app-shell,shell/support-banner,shell/shell-providers,stat-strip}.tsx`, onboarding under `apps/web/src/app/(onboarding)/**` and `apps/web/src/components/onboarding/**`, the 16e minors' files (Task 7), `packages/ui/CLAUDE.md`, `docs/design-system/09-ai-implementation-playbook.md` § 6.2/§ 8.

## Dependencies on in-flight work
None (only `phase-16` in flight). 13a runs after Phase 16 (D18). Re-check `git branch --no-merged main` at Task 0.

## Review Focus
1. **Hydration with media queries** — `HelpTip`, `FridayDockTrigger` and `ResponsivePopover` render identical server/first-paint markup; switching across 768 / 1280 while open keeps state sane (no double overlays, focus not lost) → Tasks 2, 3 tests (`renders the popover markup before matchMedia resolves`, `closes the sheet when crossing to ≥ 768`).
2. **Bottom sheet a11y** — named (`SheetTitle`), focus trapped, Esc closes and returns focus to the trigger, content scrolls within `max-h-[85vh]` → Task 2 tests.
3. **Overflow gate false positives/negatives** — fixed support banner, sticky SaveBar and wide tables inside their own scroll container must not trip it; a real page-level overflow must → Task 1 harness check measures `documentElement.scrollWidth - clientWidth > 1` after `networkidle`; Task 8 fixes.
4. **Lint strict** — a `git grep` error now fails the script instead of counting 0; untracked new files are counted; allowlisted globs actually match → Task 1 (`--report` prints the same labels; a deliberately bad pattern exits 2).
5. **Onboarding fields** — folding the onboarding `Field` into `@cs/ui` `Field` keeps every `getByLabel` name, error `aria-describedby` and required marker → Task 4 tests.

---

### Task 0: Pre-flight
- [ ] Rebase on `main` if it moved; `git branch --no-merged main`. Re-measure `bash scripts/design-lint.sh` (expect 118) and list per-label counts in the ledger. Read the after-16e 390 shots index (`apps/web/.shots/index.html`) for obvious overflow; ledger the list. No plan change unless something here contradicts a task.

### Task 1: Overflow gate + lint tooling
**Goal:** the harness fails on horizontal page scroll at 390; the lint script reports reliably (not yet strict).
**Files:** modify `apps/web/e2e-shots/shots.spec.ts`, `scripts/design-lint.sh`, root `package.json` (`design:lint`).
**Interfaces:** `AxeRow` gains `overflowX: number` (px, `scrollWidth - clientWidth`, measured at every width). Gate: a gated route at width 390 with `overflowX > 1` pushes `"<label> @ 390: overflow <n>px"` to `gateFailures`. Lint: `count` fails the script with exit 2 and the git-grep message when `git grep` exits ≥ 2; adds `--untracked`; new flag `--report` (exit 0 always); without flags behaviour stays report-only until Task 9 (keep `--strict`).
**Behaviour:** run the harness once (`SHOTS_LABEL=after-16e`, delete that label's `axe.json` first); ledger the routes with `overflowX > 1` at 390 — that list is Task 8's input. Gate failures are expected now; do not fix pages in this task.
**Done when:** `bash scripts/design-lint.sh` prints the same labels and total 118; `bash scripts/design-lint.sh --report` exit 0; the harness run completes and the report file lists overflow routes.

### Task 2: `useMediaQuery`, `ResponsivePopover`, bottom sheet, HelpTip
**Goal:** a reusable phone bottom sheet and HelpTip on it below 768.
**Files:** create `packages/ui/src/hooks/use-media-query.ts`, `packages/ui/src/components/responsive-popover.tsx` (+ tests); modify `packages/ui/src/components/sheet.tsx` (bottom: grab handle `aria-hidden` bar, `rounded-t-lg`, `shadow-dialog`, `max-h-[85vh] overflow-y-auto`), `packages/ui/src/index.ts`, `apps/web/src/components/help/help-tip.tsx` (+ `help.test.tsx`), `apps/web/src/components/list-detail-sheet.tsx` (use the hook instead of its own matchMedia).
**Interfaces:**
```ts
export function useMediaQuery(query: string): boolean | null // null until matchMedia ran (SSR + first paint)
export function ResponsivePopover(props: {
  open: boolean; onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;           // rendered via PopoverTrigger asChild / SheetTrigger asChild
  title: string;                      // SheetTitle text below 768 (sr-only is not allowed: visible title)
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end'; contentClassName?: string;
}): React.JSX.Element                 // ≥ 768 or null → Popover; < 768 → Sheet side="bottom"
```
**Behaviour:** `null` renders the Popover branch (server markup). Crossing 768 while open closes it. HelpTip keeps hover-open on fine pointers (popover branch only), its trigger name and content; its sheet title = the HelpTip's term/heading text; `text-[10px]` → `text-11`.
**Tests (TDD):** `use-media-query.test.ts`: returns null before effect, then the match; updates on `change`. `responsive-popover.test.tsx`: `renders the popover markup before matchMedia resolves`; below 768 opens a `dialog` named by `title`; Esc closes and focus returns to the trigger; `closes the sheet when crossing to ≥ 768`. `help.test.tsx`: at < 768 the tip opens as a dialog with the same text.
**Done when:** focused ui + web tests above pass; `tsc` clean.

### Task 3: Shell on phones and tablets
**Goal:** paddings per P1, Friday per P3, sheet widths.
**Files:** modify `apps/web/src/components/shell/app-shell.tsx` (`sheet-inner` `px-4 md:px-6 lg:px-8`), `apps/web/src/components/ask/friday-dock-trigger.tsx`, `apps/web/src/components/ask/friday-dock.tsx` (`SheetContent` `w-full sm:max-w-[400px]`), `apps/web/src/components/ask/friday-dock-context.tsx` if it needs `clientId`; tests `friday-dock.test.tsx`.
**Interfaces:** `FridayDockTrigger` < 768: `<Link href={`/c/${clientId}/ask`} data-slot="friday-trigger">Ask {assistantName}</Link>` with the same pill classes; ≥ 768 or `null`: today's button. Uses `useMediaQuery('(min-width: 768px)')`.
**Tests (TDD):** `friday-dock.test.tsx`: `phone trigger is a link to the Ask page`; `tablet trigger opens the sheet (aria-expanded)`; `renders the button before matchMedia resolves`.
**Done when:** focused tests pass; `e2e-affected-rules.ts` still maps `components/ask/*` to the ask specs.

### Task 4: Onboarding tokens and Field
**Goal:** onboarding at 0 lint hits outside the P6 allowlist; one Field.
**Files:** `apps/web/src/app/(onboarding)/**`, `apps/web/src/components/onboarding/**` (lint hits listed by `bash scripts/design-lint.sh` per file — Task 0 ledger), `apps/web/src/components/onboarding/field.tsx` (delete after fold), `apps/web/src/components/shell/{app-shell,shell-providers,support-banner}.tsx` (banner height constant).
**Interfaces:** `export const BANNER_HEIGHT = { base: 'h-14', sm: 'sm:h-9', offset: 'pt-14 sm:pt-9' } as const` in `apps/web/src/components/shell/banner-height.ts`, used by all three files. Onboarding fields use `@cs/ui` `Field` (props as in `packages/ui/src/components/field.tsx`); if the onboarding Field has a prop `Field` lacks, add it to `@cs/ui` `Field` with a test rather than keeping two.
**Behaviour:** `#8796AB` → `text-muted-ink`/`border-line` by role; `text-[11px]` → `text-11`; `uppercase tracking-…` eyebrow labels → `text-11 font-medium text-muted-ink` (no uppercase); `rounded-xl|2xl` → `rounded-lg`. Preview miniatures: UI chrome → tokens; values that draw the agency's colours or a mock map/email stay and go on the P6 allowlist in Task 9 (list them in the report). Onboarding `min-h-screen` + banner spacer: the page must not scroll by the banner's height when a support session is on (use `min-h-[calc(100dvh-…)]` from the constant or `min-h-dvh` with the spacer inside the flow — implementer's choice, test it).
**Tests (TDD):** existing onboarding tests keep their `getByLabel` names; add `onboarding-shell.test.tsx` `fills the viewport without extra scroll when the support banner shows` (asserts the spacer + min-height classes come from the constant); field error is linked by `aria-describedby`.
**Done when:** focused onboarding/shell tests pass; lint shows 0 for onboarding paths except files listed for the allowlist.

### Task 5: App-wide literal leftovers
**Goal:** remaining non-onboarding lint hits fixed.
**Files:** `components/shell/support-banner.tsx` (P8), `app/(platform)/platform/costs/_components/monthly-chart.tsx` (P8), `c/[clientId]/competitors/[competitorId]/timeline.tsx`, `c/[clientId]/moves/move-card.tsx` (+ its `rounded-[5px]`), `(onboarding)/…/done-step.tsx` dot (if not done in Task 4), `components/shell/inbox-bell.tsx`, `components/ask/thread-list.tsx`, `components/client/owner-welcome.tsx`, `components/charts/map-zoom.tsx` (`shadow-md` → `shadow-overlay`), `components/agency/{branding-editor,intake-link-card}.tsx` (hex that are default-colour **data** stay and go on the allowlist; styling hex → tokens). All paths under `apps/web/src/`.
**Behaviour:** amber decorations that are status (timeline icon, move "active", done dot) → warning tokens (`bg-warning-surface text-warning-text`, `bg-warning` dot) with the existing text; support banner per P8 keeps `aria-label`, fixed position, heights from Task 4's constant.
**Tests (TDD):** support banner test asserts `data-tone="warning"` and the label; monthly chart test asserts the manual series uses the new token/var (not `--amber`); class assertions only via `data-*`.
**Done when:** focused tests pass; `bash scripts/design-lint.sh` lists only P6-allowlist candidates.

### Task 6: `Frame` primitive + class-assertion tests
**Goal:** P9 and the D16 test leftovers.
**Files:** create `packages/ui/src/components/frame.tsx` (+ test, export); replace hand-rolled `rounded-md border border-line` frames in: inbox list (`app/(app)/inbox/page.tsx`), runbook knobs (`components/runbook/knob-card.tsx`/list), branding preview (`components/agency/branding-editor.tsx`), platform ask list/thread, platform knowledge list, `/start` `Panel` (`app/start/intake-form.tsx`); tests `help.test.tsx`, `runbook-editor.test.tsx`, `ask/answer.test.tsx` → `[data-slot=…]`.
**Interfaces:** `export function Frame({ flush, className, ...props }: React.ComponentProps<'div'> & { flush?: boolean })` — `data-slot="frame"`, `rounded-md border border-line bg-surface`, `p-4` unless `flush`.
**Tests (TDD):** `frame.test.tsx`: `data-slot="frame"`, `flush` drops padding (assert via `data-flush`), passes `role`/`aria-label` through.
**Done when:** focused ui + web tests pass; no `rounded-md border border-line` frame left in the listed files.

### Task 7: 16e structure minors
**Goal:** the 16e final review defers not covered by Tasks 5–6.
**Files / changes:**
- `components/stat-strip.tsx`: prop `headingLevel?: 2 | 3` (default 2); platform billing "Agencies by state" strips use 3 under their Section `h2`.
- Section vs panel headings: panels inside a Section (`help-index`, `runbook-editor`, `review-queue`, `/start` panels) use `text-base font-semibold` like `Section`.
- Runbook/knob `role="alert"` errors → `ErrorNote` (`components/form-error.tsx`), same text.
- `/start` (`app/start/intake-form.tsx`): required asterisk → the `@cs/ui` `Field` required marker; selected place → `Card` selected recipe (playbook § 4.5).
- `platform/billing/connect-panel.tsx` totals `dl` → `StatStrip` (same titles/values).
- `agency/leads/page.tsx:100` underline tabs → `TabsLinkList`/`TabsLink` (same hrefs, labels, `aria-current`).
- `platform/costs/page.tsx` title `&amp;` → `&`.
- `platform/agencies/[id]/page.tsx`: 3 charts in `HairlineGrid cols={2}` → last chart spans 2 columns (`col-span-2`) or `cols={3}` from `xl` — pick by the 1440 shot.
- `platform/agencies/[id]` hold banner indentation (`hold-banner.tsx`).
- `agency/approvals/[briefId]/page.tsx`, `c/[clientId]/recommendations/page.tsx`: `evidenceRefsFor` joins the `Promise.all` (needs ids from the same fetch: chain with `.then` inside the array).
- `docs/design-system/09-ai-implementation-playbook.md` § 6.2: add the Band tone rule (flash/notice = `muted`, sub-panel/footer/checklist = `canvas`).
**Tests (TDD):** `stat-strip.test.tsx` `headingLevel 3 renders h3 titles`; leads page test: tabs are links with `aria-current="page"`; connect-panel test reads values by `[data-slot="kpi"]`; approvals/recommendations tests unchanged and green.
**Done when:** focused tests pass; `tsc` clean.

### Task 8: 390 sweep
**Goal:** no gated route overflows at 390; Competitors stacked rows (P5).
**Files:** the routes Task 1 listed (ledger), `app/(app)/c/[clientId]/competitors/page.tsx` + its table component, `packages/ui/src/components/table.tsx` only if a cell rule is needed (`whitespace-normal` opt-in prop `wrap` on `TableCell`, not a default change).
**Behaviour:** fix each overflow at its source (min-width, nowrap rows, fixed widths, long unbroken strings → `break-words`/`min-w-0`); wide tables scroll in their container. Competitors < 768 per P5. Re-run the harness for the routes touched (`-g "<label> @ 390"`; full run once at the end of the task).
**Tests (TDD):** competitors page test: below `md` the stacked list exists with the same links (query by role inside the `md:hidden` list); `TableCell wrap` test in `table.test.tsx` if added.
**Done when:** a full shots run reports 0 overflow on gated routes (report file lists before/after per route).

### Task 9: Lock-in
**Goal:** lint 0 and strict; retire `--shadow-card`; StatusChip glyph rule.
**Files:** `packages/ui/src/styles.css` (delete `--shadow-card`), `apps/web/src/lib/design-gates.test.ts` (keep), `packages/ui/src/components/status-chip.tsx` (+ test), `scripts/design-lint.sh`, `packages/ui/CLAUDE.md`, `docs/design-system/09-ai-implementation-playbook.md` § 8.
**Interfaces:**
```ts
type StatusChipProps =
  | ({ tone: 'neutral'; icon?: LucideIcon | null } & Base)
  | ({ tone: Exclude<Tone, 'neutral'>; icon?: LucideIcon } & Base)
```
Lint: default = strict (exit 1 if total > 0), `--report` exit 0; allowlist block at the top of the script (`ALLOW_<LABEL>` arrays of `:(exclude,glob)` pathspecs, each preceded by `# reason`) per P6 and the Task 4/5 reports.
**Tests (TDD):** `status-chip.test.tsx`: non-neutral default glyph present (`svg[aria-hidden]`), `// @ts-expect-error` on `tone="danger" icon={null}`; `tokens` test or `design-gates.test.ts` asserts `--shadow-card` absent from `styles.css`.
**Done when:** `bash scripts/design-lint.sh` prints total 0 and exits 0; an untracked temp file `apps/web/src/zz-lint-probe.tsx` containing `#123456` makes it exit 1 (then delete the file); ui tests pass; `packages/ui/CLAUDE.md` rules block and 09 § 8 describe strict mode + allowlist.

### Task 10: Final verification, shots and work file
- [ ] Set `gate: true` on every route in `e2e-shots/routes.ts` (all pages are migrated).
- [ ] `pnpm test:affected --base main`, then `pnpm --filter @cs/web e2e:affected --base main`, then `SHOTS_LABEL=after-16f pnpm --filter @cs/web shots` (sequential). 0 serious/critical axe and 0 overflow at 390 on all routes.
- [ ] Final whole-branch review of 16f commits (most capable model) against Frame 10, 08 § 8 and this plan; one fix wave.
- [ ] Work file: Status (16f done = Phase 16 done; lint 0 strict; shots count), Next = owner verification + `/rm-merge`; owner questions: (a) design-lint in CI (D17), (b) P3/P5 phone behaviour, (c) P6 allowlist; BACKLOG lines: bottom tab bar, canvas bands, 44 px controls, dropdowns as sheets (P1). Commit `docs(phase-16): 16f done`.
