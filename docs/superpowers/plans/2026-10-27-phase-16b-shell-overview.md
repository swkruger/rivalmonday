# Phase 16b — shell, PageHeader and Overview slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every signed-in page on design system v1's frame + one white sheet, restyle the sidebar (D-04) and `PageHeader` (C6–C8), move settings sub-navs into a drill-in sidebar, and migrate the client Overview (KPI strip, summary Band, hairline grid, chart tokens) — playbook PRs 5–6 — without changing what any page does.
**Architecture:** Shell in `apps/web/src/components/shell/*` (server `AppShell`/`Sidebar`/`TopBar`, client `SidebarNav`/`MobileNav`); pure nav logic in `shell/nav-items.ts`; two small additive `@cs/ui` changes (`Kpi` slots, `HairlineGrid`); Overview in `app/(app)/c/[clientId]/page.tsx` + shared views; charts in `components/charts/*`.
**Tech Stack:** TypeScript, React 19, Next.js App Router, Tailwind v4, `radix-ui`, `lucide-react`, Vitest + Testing Library, Playwright + `@axe-core/playwright`.
**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (§ 2 D10–D19, § 3 row 16b). Recipes: `docs/design-system/09-ai-implementation-playbook.md` §§ 5.1–5.4, 6.1, 6.2 (client Overview + shared rows), 7 (C6–C8, C12) — **binding; tasks cite them instead of repeating class strings.** Frames: `07-visual-storyboard.md` 2 (shell), 3 (sidebar states, drill-in, headers), 8 (Overview). Brief/decisions: `docs/work/phase-16.md`.

## Global Constraints
- **No behaviour change (D1):** no route, data, copy, a11y-name or E2E-path change. Content stays; only containers, type, spacing and colour move. Only new copy: the drill-in back link (decided below, owner sign-off line in the work file).
- **Tokens, not values** (09 § 0 rule 1); playbook `text-[13px]` → `text-13`, `text-[11px]` → `text-11`. Allowed literals: layout widths/heights, `tracking-[-0.01em]`, chart ramps in `change-grid`/`geo-grid`/`topic-heatmap`.
- **White-label:** nothing new reads the agency colour except through `--primary`/`--secondary` (+ derived) and `--you`.
- **D3:** the context switcher stays in the left sidebar (overrides Frame 2's top-bar switcher). **15a D8 / D12:** drawer below `lg` stays; no bottom tabs, no collapse-to-rail.
- Every `PageHeader` page keeps its `helpKey`; breadcrumbs keep `›` (core spec §2.7). No route `loading.tsx` (use `Suspense`).
- The sidebar stays the shell's only `<aside>` (`role=complementary`; E2E `page.locator('aside')` and unit tests depend on it).
- **Tests (D16):** class-string assertions move to role / `aria-current` / `data-slot` / `data-variant` / `data-tone` **in the task whose change breaks them**; E2E stays role-based. Exception: a guard against a real bug may assert one class (named per task).
- **Lint (D17):** `pnpm design:lint` is report-only; record counts, never gate on them.
- Read `apps/web/CLAUDE.md`, `packages/ui/CLAUDE.md`, `docs/gotchas-cross-cutting.md` before coding. LF only. Commits end `Co-Authored-By: <own model> <noreply@anthropic.com>`.
- Implementers run focused tests only (`pnpm --filter @cs/web exec vitest run <pattern>`, `pnpm --filter @cs/ui exec vitest run <pattern>`); `test:affected`, `e2e:affected` and shots run once, in Task 9. Test DB = this worktree's `.env`; E2E and shots share port 3100 — never concurrently.
- No migrations (next free 0096 unchanged). `StatCard` keeps working for its users outside the Overview (agency dashboard → 16e, reviews → 16c, platform → 16e).

## Decisions
Spec D10–D19. Plan-local (Claude's calls):
- **P1 Shell structure.** Two columns as today: sidebar column (logo + switcher + nav, canvas, no border) and a right column (top bar, banners, sheet). The logo stays in the sidebar beside the switcher (D3 keeps the switcher there; splitting identity across columns would read oddly). Top bar keeps today's contents (drawer button, `ContextName` < lg, bell, avatar): Frame 2's search trigger and top-bar Ask pill are new UI outside D11 → BACKLOG (Ask already leads the client menu, Ctrl K already opens the switcher).
- **P2 Sheet has no `overflow-hidden`.** `SaveBar` is `sticky bottom-4` and page sticky headers need the viewport as scroll root; the sheet uses `min-w-0` and no overflow utility.
- **P3 Drill-in settings nav lives in `SidebarNav`.** On `/agency/settings[/…]` and `/c/<id>/settings[/…]` the sidebar swaps its menu for "‹ Back to {name}" + the same `settingsNavFor` sections the layouts use (same flags ⇒ same tabs). The layouts keep `SettingsNav`, now `lg:hidden` and restyled as a chip scroller (09 § 5.1). Both navs keep `aria-label="Settings"`; only one is visible at any width.
- **P4 Back-link copy (decided, owner signs):** client area `Back to {client name}` → `/c/<id>`; agency area `Back to {agency name}` → `/agency`. Fallbacks when the name is unknown: `Back to Overview` / `Back to Portfolio` (the menus' root labels).
- **P5 PageHeader variants:** `standard | compact` now; `detail` (avatar slot) lands with its only user, competitor detail, in 16c.
- **P6 KPI content unchanged.** Overview KPI pills are text, not numeric deltas ("3 high", "↓ 1 cut"), so they render as a tone badge in a new `Kpi` `badge` slot, hints in a `caption` slot; `KpiDelta` stays for numeric deltas (16c+). Tile titles stay `h2` (headings are a11y names).
- **P7 Overview order unchanged** (KPIs, brief | Ask + pressure + alerts, moves | recommendations, ad chart, past briefs | reports). Frame 8's summary-first order would move content; containers change only: cards → Sections, pairs → hairline grid, brief summary → Band, Ask → Band.
- **P8 ≤ 2 highlighted rivals** (D-13): with ≤ 2 non-you series the given order keeps colours stable (platform charts); with more, the two with the highest latest value take `--chart-rival-1/2`, the rest + "Other" take `--chart-context`. Legend and table keep every series.
- **P9 `Scorecard` migrates here** (it renders inside the Overview's brief); the brief detail page inherits it. Other `BriefView` restyling is 16d.

## File structure
- `packages/ui/src/`: `theme.ts`, `theme.test.ts`; `components/kpi-strip.tsx` (+ test), new `components/hairline-grid.tsx` (+ test), `index.ts`
- `apps/web/src/components/`: `page-header.tsx` (+ test); `shell/{app-shell,sidebar,sidebar-nav,top-bar,mobile-nav,nav-items}.tsx|ts` (+ tests); new `shell/settings-drill-in.tsx` (+ test); `settings-nav.tsx` (+ new test); new `stat-strip.tsx` (+ test); `views/{scorecard,brief-view}.tsx`; `ask/ask-card.tsx`; `client-home-basic.tsx`; `charts/{line-chart,rank-trend,change-grid,geo-grid,topic-heatmap}.tsx` (+ tests)
- `apps/web/src/app/(app)/`: `agency/settings/layout.tsx`, `c/[clientId]/settings/layout.tsx`, `c/[clientId]/page.tsx` (+ tests); C7/C8 one-liners in the files `git grep` lists
- `apps/web/e2e-shots/{routes.ts,shots.spec.ts}`; `scripts/design-lint.sh`; `docs/design-system/09-ai-implementation-playbook.md` (§ 5.4/§ 8 file-name typo only); `docs/work/phase-16.md`

## Dependencies on in-flight work
None (`git branch --no-merged main` = `phase-16` only). 16a is on this branch (re-check `packages/ui/src/index.ts` exports at pre-flight). 13a runs after Phase 16 (D18).

## Review Focus
1. **Sidebar active state on nested and settings routes** — exactly one `aria-current="page"` link: `/c/<id>/briefs/<x>` → Briefs & reports, `/c/<id>/competitors/<x>` → Competitors, `/agency/settings` (index, redirecting) → first tab, `/c/<id>/settings/billing` for an owner → Billing → Tasks 3, 4 tests.
2. **Drill-in back path and visibility** — back link targets the current context (supported agency in a support session; a client role's own client); a guest on a client settings URL keeps the normal menu (no tabs ⇒ no drill-in); drill-in tabs equal the layout's tabs for the same viewer; tapping Back in the drawer closes it → Task 4 tests.
3. **PageHeader at 390 px** with a long unbroken title, a 4-crumb breadcrumb and two actions: one `h1`, title wraps (no page-wide horizontal scroll), crumbs truncate, actions wrap below the title; `›` kept → Task 2 tests + 390 shots.
4. **Banners with the new sheet** — fixed support banner (h-14 / sm:h-9) never covers the top bar or sticky sidebar; hold/billing/spend/guest banners sit above the sheet; read-only provider unchanged; `SaveBar` still sticks (sheet has no `overflow-hidden`, P2) → Task 5 tests + `support-agency` shot.
5. **Overview with no data / basic plan / client roles** — no brief, no competitors, no ads (`—` values with their hints), owner first visit, `ClientHomeBasic` (no `dashboard`), Ask absent in support sessions and for guests; KPI link cells keep focus outline; 0 serious/critical axe → Task 8 tests + gated shots.

---

### Task 0: Pre-flight
- [ ] `git status` clean; `git fetch`; if `main` moved, `git rebase main` and `pnpm install`. Re-measure with `git grep -c` (rg is not on PATH): C6 `text-\[26px\] font-extrabold tracking-tight`, C7 `font-extrabold` (excl. `wordmark.tsx`), C8 `uppercase tracking-\[0\.08em\]`, `<StatCard`, `<PageHeader` files (64), `pnpm design:lint` total (236 after 16a). Confirm `@cs/ui` exports `Section, Band, KpiStrip, Kpi, TableFrame, Input, FridayBadge`. If a count or a file named here moved, fix the plan inline + note it in the work file § Status; commit `docs(phase-16): 16b pre-flight` only if changed.

### Task 1: 16a carry-overs — hover shade fallback, shot routes
**Goal:** mid-tone brand colours get a visible hover/active; the three setup shots show three different screens.
**Files:** modify `packages/ui/src/theme.ts`, `theme.test.ts`, `apps/web/e2e-shots/routes.ts`, `apps/web/e2e-shots/shots.spec.ts`.
**Interfaces:**
```ts
// theme.ts — the fallback when no step reaches 4.5:1 (label already fails on the base, e.g. #D9534F):
function stateShade(primary: string, fg: string, t: number): string {
  const toward = fg === '#0B2540' ? '#FFFFFF' : RIVAL_MONDAY_TOKENS.ink;
  for (let step = Math.round(t * 100); step > 0; step--) {
    const c = mixHex(primary, toward, step / 100);
    if (contrastRatio(fg, c) >= 4.5) return c;
  }
  return mixHex(primary, toward, t); // mixing away from the label only raises contrast: never worse than the base
}
// routes.ts
export type ShotFixtures = { …existing; setupOwnerClientId: string; askClientId: string };
export type ShotRoute = { …existing; heading?: RegExp };   // asserted visible (level 1) before the screenshot
```
**Behaviour:**
- Setup routes, no seed change: `setup-profile` → `/c/${setupClientId}/setup?step=profile` (profile is before `finish`'s first open step, so `resolveStep` honours it), `setup-competitors` → `/c/${setupClientId}/setup` (first open = competitors), `setup-invite` → `/c/${setupOwnerClientId}/setup?step=invite` (`owner` fixture: competitors `waiting_owner`, invite pending ⇒ invite is at/before its first open step). Each gets a `heading` (read the step components for the real h1 text). `setupOwnerClientId` = `SETUP_FIXTURE_FILE` `owner.id`; `askClientId` = `select id from client where name = 'Ask Demo Heating'`.
- If `setup-invite` still resolves elsewhere (heading check fails), drop that route and record "invite step unreachable from seed" in the work file's backlog (do not change the seed).
- Agency onboarding stays out of the shot list (not reachable from seed; already in the work file).
**Tests (first):** `theme.test.ts`: add `#D9534F` to the samples of a new case "mid-tone: hover ≠ base, active ≠ hover, `contrastRatio(fg, hover) >= contrastRatio(fg, base)`"; existing ≥ 4.5 cases keep their samples (#D9534F is not added to them). `:root` defaults test unchanged (#47A8E7 still #56afe9/#64b6eb).
**Done when:** `pnpm --filter @cs/ui exec vitest run theme` green; `pnpm --filter @cs/web typecheck`; commit `fix(ui): hover shade for mid-tone brands; shots: distinct setup routes (16b)`.

### Task 2: PageHeader v1 + C6–C8
**Goal:** one header recipe for all 64 pages (09 § 5.2), plus the app-wide weight/caps codemods.
**Files:** modify `apps/web/src/components/page-header.tsx`, `page-header.test.tsx`; C7/C8 targets from `git grep` (Task 0 list; `wordmark.tsx` excluded).
**Interfaces:**
```ts
export interface PageHeaderProps {
  …existing (title, description, breadcrumb, actions, helpKey, guide, step);
  /** Freshness line under the description ("Updated 2 hours ago"). */
  meta?: React.ReactNode;
  /** Underline tabs: under the title row (standard) or inline right of the title (compact). */
  tabs?: React.ReactNode;
  variant?: 'standard' | 'compact';   // default 'standard'
}
// root <header data-slot="page-header" data-variant={variant}>; h1 data-slot="page-title"
```
**Behaviour:**
- Classes per 09 § 5.2 (h1 `text-2xl font-semibold tracking-[-0.01em] leading-8`, plus `break-words` so a long unbroken title wraps; description `mt-1 text-sm text-muted-ink max-w-[70ch]`; meta `mt-1.5 flex items-center gap-3 text-xs text-muted-ink`; step eyebrow `text-xs font-medium text-muted-ink`; compact = `text-lg` title, `items-center`, tabs inline). Breadcrumb list gets `text-13` via `className` (don't change `@cs/ui` Breadcrumb default).
- Guide button placement, crumb truncation and `title` attributes unchanged.
- C7 `font-extrabold` → `font-semibold` and C8 `uppercase tracking-[0.08em]` → delete + `text-xs font-medium` everywhere they occur (one commit per codemod, diff reviewed; `sidebar-nav.tsx`/`settings-nav.tsx` hits are rewritten in Tasks 3–4 anyway — skip them here). Other `uppercase tracking-*` variants: list in the work file, don't touch.
- Primary-action guard (09 § 5.2): export `countPrimaryActions(root: HTMLElement): number` from new `apps/web/src/components/page-header-guard.ts` (plain DOM helper, test-only use) (counts `[data-slot="page-header"] [data-variant="default"]` buttons/links); used in Task 8.
**Tests (first):** rewrite the class assertions on `h1` to `data-slot="page-title"` + one-h1; new: `meta` renders under the description; `tabs` render after the title row (standard) and inside it (compact) — assert DOM order via `compareDocumentPosition`; `data-variant` reflects the prop; 390 guard (Review Focus 3): a 120-char unbroken title keeps one h1 whose class list includes `break-words` (guard exception), and four crumbs keep `›` separators (`aria-hidden`) with the last `aria-current="page"`.
**Done when:** `pnpm --filter @cs/web exec vitest run page-header` green; `git grep -c "font-extrabold" -- apps/web/src ':!**/wordmark.tsx'` = 0 outside `stat-card.tsx`-family literals you deliberately left (list them); commit `feat(web): PageHeader v1 + C6–C8 (16b)`.

### Task 3: Sidebar and nav item grammar (D-04)
**Goal:** sidebar becomes part of the canvas frame; items, counts and labels per 09 § 5.1.
**Files:** modify `components/shell/sidebar.tsx`, `sidebar-nav.tsx`, `sidebar-nav.test.tsx`, `mobile-nav.tsx` (logo block spacing only).
**Interfaces:** `NavLink` root renders `data-slot="nav-item"`; count `<span data-slot="nav-count" aria-label="{n} new">`. Props unchanged in this task.
**Behaviour:**
- `Sidebar`: `w-[240px] bg-canvas px-3 py-2`, **no `border-r`**, still sticky with the support-banner offset (`top-9 h-[calc(100vh-2.25rem)]` when `offsetTop`), still `hidden lg:flex`, still `<aside>`. Logo block `flex h-12 items-center px-2` (aligns with the 48 px top bar); footer `text-11 text-muted-ink`.
- Item/current/count/section-label/icon classes exactly 09 § 5.1 `sidebar-nav.tsx` row: no `before:` accent bar; current `bg-primary-soft font-semibold text-primary-soft-text`; count `ml-auto text-xs font-medium text-muted-ink` (no amber; keep `aria-label`); assistant `pill` stays amber (`rounded-full bg-amber … font-semibold`); section labels sentence case; icons `size-4 strokeWidth={1.75}`. Foot section keeps `mt-auto border-t border-line pt-4`.
**Tests (first):** rewrite the helper `active()` to find `[aria-current="page"]` (not `bg-primary-soft`); replace `toContain('uppercase')` with "label is not a link and precedes the group's links"; count test asserts `data-slot="nav-count"` + accessible name, and `not.toContain('bg-amber')` (guard: amber is Friday-only); pill still has `bg-amber` (existing). Review Focus 1 cases (already present for briefs/competitors/approvals — keep, and add "exactly one `aria-current` on `/c/<id>/settings/delivery`" until Task 4 changes it).
**Done when:** `pnpm --filter @cs/web exec vitest run sidebar-nav mobile-nav app-shell` green; commit `feat(web): sidebar on the canvas frame, D-04 nav grammar (16b)`.

### Task 4: Drill-in settings nav
**Goal:** settings routes show their tabs in the sidebar column with a back link (D11, Frame 3); below `lg` the in-page chip scroller stays.
**Files:** create `components/shell/settings-drill-in.tsx` (+ `settings-drill-in.test.tsx`), `components/settings-nav.test.tsx`; modify `shell/nav-items.ts` (+ test), `shell/sidebar-nav.tsx` (+ test), `shell/sidebar.tsx`, `shell/mobile-nav.tsx`, `components/settings-nav.tsx`, `app/(app)/agency/settings/layout.tsx`, `app/(app)/c/[clientId]/settings/layout.tsx` (+ their tests if a class/structure assertion breaks).
**Interfaces:**
```ts
// nav-items.ts (pure, client-safe)
export type SettingsArea = { area: 'agency' } | { area: 'client'; clientId: string };
/** `/agency/settings` or below → agency; `/c/<uuid>/settings` or below → client; anything else null. Query/hash ignored. */
export function settingsAreaOf(pathname: string): SettingsArea | null;
/** activeHref, else the first tab (the bare index only redirects). Shared by SettingsNav and the drill-in. */
export function currentSettingsHref(sections: NavSection[], pathname: string): string | null;
// settings-drill-in.tsx ('use client')
export function SettingsDrillIn(props: { sections: NavSection[]; current: string | null; back: { href: string; label: string } }): JSX.Element;
// sidebar-nav.tsx — new optional prop (Sidebar and MobileNav pass it from `switcher`)
backNames?: { agency: string; clients: NavClient[] };   // agency = switcher.agencyName; clients = switcher.clients (id, name)
```
**Behaviour:**
- `SidebarNav` (zone ≠ platform): `area = settingsAreaOf(active)`; sections = agency → `settingsNavFor('agency', flags)`; client → `flags.isUser || flags.isAgency ? settingsNavFor('client', flags, area.clientId) : []` (mirrors `clientSettingsSections`; `flags.clientBilling` is the shell's same rule). Non-empty ⇒ `SettingsDrillIn` replaces `navFor`; empty ⇒ normal menu. Cookie effect still runs.
- Back link (P4): `Back to ${name}` + `ChevronLeft` (`aria-hidden`), `flex h-8 items-center gap-1.5 rounded-sm px-2 text-13 font-medium text-muted-ink hover:bg-muted-surface`; name from `backNames` (client by id / agency); fallbacks `Back to Overview` / `Back to Portfolio`.
- `SettingsDrillIn` = `<nav aria-label="Settings">`: back link, then groups (`role="group"` + label only for labelled sections), Task 3 item classes, `aria-current="page"` on `current`. The drawer renders it too; "any link tap closes" covers Back.
- `SettingsNav` (layouts): `lg:hidden`, one scrolling row of chip links (`h-7 shrink-0 rounded-full border border-line px-3 text-13 font-medium text-ink-secondary`; current `border-transparent bg-primary-soft text-primary-soft-text`), no group headings, uses `currentSettingsHref`. Layout wrappers → `flex flex-col gap-5`. Client layout still returns bare children without tabs.
**Tests (first):**
- `nav-items.test.ts`: `settingsAreaOf` on `/agency/settings`, `/agency/settings/team?x=1`, `/c/<uuid>/settings`, `/c/<uuid>/settings/billing#a` (areas) and `/agency/settingsx`, `/c/<uuid>/settingsx`, `/settings/notifications` (null); `currentSettingsHref` index → first tab.
- `sidebar-nav.test.tsx`: `/agency/settings/team` → nav "Settings", Team current, link "Back to Acme Agency" → `/agency`, no "Portfolio"; `/c/<id>/settings/profile` (staff) → tabs = `settingsNavFor('client', flags, id)` labels, `Back to <client name>` → `/c/<id>`; owner + `clientBilling` on `…/settings/billing` → Billing current; guest flags → normal menu, no "Settings" nav; support (`isUser: false, isAgency: true`) → drill-in with the supported agency's name; unknown client → `Back to Overview`; exactly one `aria-current` each time.
- `settings-nav.test.tsx`: the "Settings" nav has `lg:hidden` (guard: two visible "Settings" navs break E2E strict mode); index path selects the first tab.
- `mobile-nav.test.tsx`: on a settings path the drawer shows the drill-in and tapping Back closes it.
**Done when:** `pnpm --filter @cs/web exec vitest run nav-items sidebar-nav settings mobile-nav` green; commit `feat(web): drill-in settings nav in the sidebar (16b)`.

### Task 5: Shell frame, sheet and top bar
**Goal:** every signed-in route renders inside one white sheet in the canvas frame (D-02, Frame 2).
**Files:** modify `components/shell/app-shell.tsx`, `top-bar.tsx`, `mobile-nav.tsx` (trigger), banner files only if a literal clashes (`billing-banner`, `spend-banner`, `client-billing-banner`, `guest-banner`: `font-bold` → `font-semibold`, white buttons `rounded-sm`), `app-shell.test.tsx`.
**Interfaces:** `<main data-slot="sheet">` with an inner `<div data-slot="sheet-inner">`. No prop changes.
**Behaviour:**
- Layout (lg+): root `flex min-h-screen bg-canvas` (+ `BANNER_OFFSET` in a session, unchanged); right column `flex min-w-0 flex-1 flex-col`; `TopBar`, guest banner, client-billing banner and `ShellNotices` stay above the sheet (unchanged order); sheet = 09 § 5.1 `app-shell.tsx` row **minus `overflow-hidden` (P2)**: `flex-1 min-w-0 bg-surface lg:mr-2 lg:mb-2 lg:rounded-md lg:border lg:border-line`; inner `mx-auto flex w-full max-w-[1560px] flex-col gap-10 px-4 pt-6 pb-10 lg:px-8`. Below `lg`: no margin, radius or border.
- `TopBar`: `h-12`, `bg-canvas`, **no `border-b`**; contents and order unchanged (P1). Drawer trigger `size-8 rounded-sm` (09 § 5.1 mobile row), `aria-label="Open menu"` unchanged.
- Read-only provider, theme style, support banner (fixed, `z-50`) and spacer unchanged. `gap-10` is the playbook value; if a page's stacked blocks look detached in shots, fix it in that page's sub-phase, not here.
**Tests (first):** in `app-shell.test.tsx`: a single `main[data-slot="sheet"]` holds the children; sheet class list has no `overflow-hidden` (guard, P2/Review Focus 4); exactly one `complementary` landmark; in a support session the banner (`role=region`/existing query) renders and the sidebar receives `offsetTop` (sticky offset class `top-9` present on the aside — guard); hold + guest + client-billing banners render **before** the sheet in document order (`compareDocumentPosition`).
**Done when:** `pnpm --filter @cs/web exec vitest run app-shell support-banner billing-banner spend-banner` green; `pnpm --filter @cs/web build` succeeds; commit `feat(web): canvas frame + white sheet shell (16b)`.

### Task 6: KPI and hairline primitives, StatStrip, framed Scorecard
**Goal:** the pieces the Overview needs, content-preserving (P6, P9).
**Files:** modify `packages/ui/src/components/kpi-strip.tsx` (+ test), `index.ts`; create `packages/ui/src/components/hairline-grid.tsx` (+ test), `apps/web/src/components/stat-strip.tsx` (+ test); modify `apps/web/src/components/views/scorecard.tsx`.
**Interfaces:**
```ts
// @cs/ui kpi-strip.tsx — additive
export interface KpiProps { …existing; badge?: React.ReactNode; caption?: React.ReactNode }
//   value row: flex flex-wrap items-baseline gap-2 → value, then badge; caption: mt-1 text-xs text-muted-ink (after delta)
// @cs/ui hairline-grid.tsx — 09 § 6.1 B
export function HairlineGrid(props: React.ComponentProps<'div'> & { cols?: 2 | 3 }): JSX.Element; // data-slot="hairline-grid"; border-t border-line; lg:grid-cols-{cols}
export function HairlineCell(props: React.ComponentProps<'div'>): JSX.Element;                    // data-slot="hairline-cell"; border-b border-line py-5; lg: [&+&]:border-l [&+&]:pl-6 pr-6
// web stat-strip.tsx
export interface StatItem { title: string; value: string; pill?: StatPill | null; hint?: string; help?: React.ReactNode; href?: string }
export function StatStrip({ items, label }: { items: StatItem[]; label?: string }): JSX.Element;
export function StatBadge({ pill }: { pill: StatPill }): JSX.Element;
```
**Behaviour:**
- `StatStrip` → `KpiStrip` (`aria-label={label}` when given) of `Kpi linkAs={Link}`; label = `<span className="flex items-center gap-1.5"><h2 className="text-13 font-normal text-muted-ink">{title}</h2>{help}</span>`; `badge` = `StatBadge`, `caption` = hint; `href` cells stay links (`hover:bg-canvas`, inset focus outline from 16a).
- `StatBadge`: `inline-flex h-5 items-center gap-0.5 rounded-xs px-1.5 text-xs font-semibold tabular-nums`, `data-tone={pill.tone}`; up → `bg-chip-success-bg text-chip-success-text`, down → danger chip, warn → warning chip, info → neutral chip; glyph `aria-hidden`, `srLabel` in `sr-only` — same text as `StatCard`'s pill.
- `Scorecard`: tiles → `StatStrip` (titles stay `h2`); table → `TableFrame` + `Table density="compact"` with `numeric` cells, `self` row `bg-primary-soft font-semibold`; caption, headers, `TierChip` unchanged. `StatCard` itself is not edited.
**Tests (first):** ui: `Kpi` renders `badge` after the value and `caption` last; `HairlineGrid`/`HairlineCell` `data-slot`s and `cols` → `data-cols`. web `stat-strip.test.tsx`: four items → one `[data-slot=kpi-strip]` with four `h2`s named by title; `help` button keeps its accessible name (help.test names: "Changes this week"); `href` item is a link to it; `StatBadge` `data-tone` per tone, glyph hidden and `srLabel` spoken ("Up 4 since …"); missing pill → no badge. Scorecard: existing brief-view/scorecard tests green with role-based queries (`table` caption "Scorecard: you against the rivals we watch").
**Done when:** `pnpm --filter @cs/ui exec vitest run kpi hairline` + `pnpm --filter @cs/web exec vitest run stat-strip scorecard brief-view` green; commit `feat(ui,web): Kpi badge/caption, HairlineGrid, StatStrip, framed scorecard (16b)`.

### Task 7: Chart tokens (09 § 5.4) and the rivals rule
**Goal:** charts use chart tokens; you + ≤ 2 highlighted rivals; validated ramps untouched.
**Files:** modify `components/charts/{line-chart,rank-trend,change-grid,geo-grid,topic-heatmap}.tsx` + their tests; `scripts/design-lint.sh` (allowlist `theme-heatmap.tsx` → `topic-heatmap.tsx`); `docs/design-system/09-ai-implementation-playbook.md` (same typo in § 5.4 and § 8).
**Interfaces:**
```ts
// line-chart.tsx — replaces SERIES_COLORS / OTHER_COLOR
export const YOU_COLOR = 'var(--you)';
export const RIVAL_COLORS = ['var(--chart-rival-1)', 'var(--chart-rival-2)'] as const;
export const CONTEXT_COLOR = 'var(--chart-context)';
/** P8: ≤ 2 rivals keep their order (stable colours); more → the two highest latest values are highlighted. */
export function seriesColor(s: ChartSeries, all: ChartSeries[]): string {
  if (s.you) return YOU_COLOR;
  if (s.key === 'other') return CONTEXT_COLOR;
  const rivals = all.filter((x) => !x.you && x.key !== 'other');
  const ranked = rivals.length <= 2 ? rivals : [...rivals].sort((a, b) => last(b.points) - last(a.points) || a.name.localeCompare(b.name, 'en'));
  const i = ranked.slice(0, 2).findIndex((x) => x.key === s.key);
  return i >= 0 ? RIVAL_COLORS[i]! : CONTEXT_COLOR;
}
```
**Behaviour:**
- `line-chart`: gridline `var(--chart-grid)`, axis text `var(--chart-axis)` `fontSize={12}`, marker ring `var(--surface)`; context series drawn first (beneath) at `strokeWidth` 1.5, highlighted 2; legend + table view keep every series and order. `foldSeries` unchanged.
- `rank-trend`: `MUTED` → `var(--chart-axis)`, `GRID` → `var(--chart-grid)`, `MARKER` → `var(--chart-context)`.
- `change-grid`, `geo-grid`, `topic-heatmap` (spec: heatmap tokens are 16b): `INK` → `var(--ink)`, `WHITE` → `var(--surface)`, `LINE`/`#E2E8F0` → `var(--chart-grid)`, `#64748B` → `var(--chart-axis)`, `#CBD5E1` → `var(--line-control)`, geo-grid quiet stroke `#94A3B8` → `var(--chart-context)`. **Ramp hexes stay** (sentiment, UP/DOWN/SAME, rank fills, `NEUTRAL #f0efec`).
- **Validate (dataviz skill, implementer runs it):** load the `dataviz` skill and run its palette validator (`validate_palette.js --mode light`, surface `#FFFFFF`) on you `#2A6BAC` + `#E05A2B` + `#14936A` + context `#A3B1C2`, and on each unchanged ramp against the new grid/surface; paste the output into the commit body. A failure → stop and report (do not change token hexes in this task).
**Tests (first):** `line-chart.test.tsx`: 1 rival → `RIVAL_COLORS[0]`; you + 2 rivals → you token + both rival tokens in given order; you + 4 rivals → the two highest latest values get rival tokens, the others `CONTEXT_COLOR`, ties by name; "Other" → `CONTEXT_COLOR`; legend/table still list all series; existing "no #2A6BAC/#47A8E7 literal" test stays. `topic-heatmap.test.tsx`: update expected text/stroke to tokens, ramp fills unchanged. Rank-trend/geo/change-grid: any hex assertion → token.
**Done when:** `pnpm --filter @cs/web exec vitest run charts` green; `pnpm design:lint` hex count drops (record); commit `feat(web): chart tokens, you + 2 rivals (16b)`.

### Task 8: Overview slice (Frame 8)
**Goal:** the client Overview and the basic home on the sheet: KPI strip, Sections, hairline pairs, brief summary Band, Ask Band.
**Files:** modify `app/(app)/c/[clientId]/page.tsx` (+ `page.test.tsx`, `help-pilot.test.tsx` if a query breaks), `components/client-home-basic.tsx`, `components/views/brief-view.tsx`, `components/ask/ask-card.tsx`; `e2e-shots/routes.ts`.
**Interfaces:**
```ts
// brief-view.tsx — additive
BriefView({ …existing, surface?: 'card' | 'overview' })   // default 'card' (brief page unchanged until 16d)
// routes.ts
{ label: 'client-overview', …, gate: true }, { label: 'client-overview-ask', path: (fx) => `/c/${fx.askClientId}`, as: 'agency', gate: true }
```
**Behaviour (09 § 6.2 client-pages + shared rows):**
- Overview: KPI grid → `<StatStrip label="This week" items={kpiCards(...)} />` with the existing `KPI_TIPS` (C12). `cardCls` sections → `Section` (title `h2` as today, `HelpTip` beside the title in the `title` node, "All →"/"12 weeks"/"N open" in `actions`). Pairs (moves | recommendations, past briefs | quarterly reports) → `HairlineGrid cols={2}` with one `HairlineCell` each. Brief | aside columns stay a `lg:grid-cols-[2fr_1fr]` grid with `gap-10`. Ad chart → `Section`. Starting-point notice → `Band tone="muted"`; no-brief `EmptyState` → `Section` without wrapper. Recommendation rows → divided list (`divide-y divide-line`, rows `py-2`) with the same title + `RecStatus`; "N open" → count style `text-xs font-medium text-muted-ink` (same text). Pressure rows unchanged (bars, `role=img` names).
- `BriefView surface="overview"`: root `Section` (h2 = the current CardTitle text; chips + "Download PDF" + "Brief archive →" in `actions`); `brief.summary` inside `Band tone="canvas"` (the Friday summary band, D-26; citation pills are 16d); items, scorecard, trend table unchanged below. `surface="card"` renders exactly today's markup.
- `AskCard`: keeps `<section aria-label="Ask {name}">`, body in `Band tone="canvas"`; input → `@cs/ui` `Input` (same `name`, `aria-label`, `placeholder`, `maxLength`, `required`); `Button` and `StarterChips` unchanged. Still null in support sessions, for guests and without the `ask` channel.
- `ClientHomeBasic`: three `Card`s → `Section`s (titles as `h2`), Ask band in the aside; copy unchanged.
- No `Card`, `rounded-[…]`, `text-[…px]` or hex left in the four files (excluding `BriefView`'s card surface, 16d).
**Tests (first):** `page.test.tsx` (Review Focus 5): one `[data-slot=kpi-strip]` with four `h2` titles; empty overview (`changes7d: 0`, `activeAds: null`, `rating.self: null`) shows "—" values and their hints; no brief + no starting point → empty-state section and no `[data-slot=band]` summary; with a delivered brief, `BriefView` receives `surface="overview"`; `countPrimaryActions(container) <= 1`; existing pressure / first-visit / "In progress" / "Review it" tests stay green. `brief-view` test: overview surface → `section[data-slot=section]` + h2 week + summary inside `[data-slot=band]`; card surface → `[data-slot=card]` (unchanged). `ask-card` test: null when `ctx.support`, for `contact:` users and without ask; otherwise the textbox keeps its name and the form posts to `/c/<id>/ask` with `q`. `help-pilot.test.tsx` basic home still finds "Weekly briefs" and the guide button.
**Done when:** `pnpm --filter @cs/web exec vitest run "c/\[clientId\]/page" overview client-home ask-card brief-view help-pilot` green; commit `feat(web): Overview slice on the sheet (16b)`.

### Task 9: Final review prep
- [ ] `pnpm design:lint` → record after-16b counts next to the 16a numbers in `docs/work/phase-16.md`.
- [ ] `pnpm test:affected --base main`, then `pnpm --filter @cs/web e2e:affected --base main` (not concurrently). E2E paths most at risk: settings flows clicking `navigation "Settings"` (`navigation`, `ai-connections`, `billing`, `client-billing`, `workspace` specs) — exactly one visible per width; fix code, not tests, unless a test asserted a class.
- [ ] `SHOTS_LABEL=after pnpm --filter @cs/web shots` (after E2E finishes) → `apps/web/.shots/index.html`. Reviewer compares 1440 + 390 against Frames 2, 3, 8: sheet on every route, sidebar states, drill-in on `agency-settings-*` / `client-settings-profile`, Overview; `axe.json`: `client-overview` and `client-overview-ask` 0 serious/critical (gated), and no shell-origin violation ids on any route (compare with `before`).
- [ ] Work file: Status "16b done; 16c plan next"; owner sign-off line for P4 copy ("Back to {name}" / fallbacks); BACKLOG lines: top-bar search trigger + Ask pill (Frame 2), sidebar collapse-to-rail, PageHeader `detail` (16c); any unreachable shot route. Commit `docs(phase-16): 16b done`.
