# 09 · AI implementation playbook

*Step-by-step instructions for an AI coding agent (or a developer) implementing design system v1 in the Rival Monday codebase. It is concrete where [08](08-implementation-guide.md) is general: real file paths, before/after class strings, codemod rules, detection commands and a per-file migration map. Written 2026-10-23 against `main` @ `10ce242d`; **re-verify every "before" string and count with the commands in § 8 before starting**, because the code moves.*

> **Status: binding.** The owner adopted the design as the mandate on 2026-10-23, and OD-1…OD-5 are resolved as recommended ([04](04-design-decisions.md)). **New or changed UI must follow it now.** The full migration of existing screens runs as its own phase (`/rm-kickoff design-system`) using § 9. Marks like **[OD-n]** show which resolved decision a rule comes from.

---

## 0. How to use this playbook

**Read, in this order:** this file → [05](05-design-system-specification.md) §§ 2–5 (tokens) → [06](06-component-catalog.md) (the component you're touching) → the storyboard frame for the page type ([07](07-visual-storyboard.md)). Do not read 01–03 unless you need evidence for a judgement call.

**Plus the repo's own rules (they win on conflict):** `CLAUDE.md`, `packages/ui/CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/gotchas-cross-cutting.md`, and core spec §2.7 (PageHeader, `›` breadcrumbs).

**Ground rules for agents**
1. **Tokens, not values.** Never write a hex, px radius, shadow or arbitrary font size in a component (`text-[26px]`, `rounded-[14px]`, `#64748B`). If a needed token doesn't exist, add it to `packages/ui/src/styles.css` in the same PR and say so in the PR body.
2. **One concern per PR.** Use the PR sequence in § 9. Don't mix token changes with page migrations.
3. **Don't change behaviour.** This is a visual migration: no data, routing, copy or a11y regressions. Existing tests must pass unchanged, except tests that assert old class names. Update those to assert the new *intent* (role, `data-slot`, `data-variant`), not class strings.
4. **Preserve white-label.** Only `--primary`/`--secondary` (+ derived soft tokens) vary per agency (`themeVars()`). Nothing you add may read the agency colour except through those variables.
5. **When unsure whether something is a card,** apply the decision tree in § 6.1. Don't keep a card "to be safe".
6. **Check visually.** After each page PR, run the app (`/run` skill or `pnpm --filter @cs/web dev`) and compare against the matching storyboard PNG at 1440px and 390px.

## 1. Non-negotiables (from the decision log)

| Rule | Ref |
|---|---|
| Content lives in **one white sheet** inside a #F6F9FC frame (top bar + sidebar) | D-02 |
| Containers in order of preference: **Section → Band → Frame → Card**; cards only for independent objects; never nested | D-01 |
| **No shadow on static surfaces**; only `shadow-overlay` (menus, popovers, tooltip, toast, save/bulk bar) and `shadow-dialog` (dialog, sheet) | D-06 |
| Radii **4 / 6 / 8 / 12 / full**: controls 6 (`rounded-sm`), containers & overlays 8 (`rounded-md`), badges 4 (`rounded-xs`) | D-18 |
| ≤ 1 primary button per view; red fill only inside a confirm dialog | D-09 |
| Status: dot+text (lifecycle) · rect badge + glyph (attention) · **pill** filter chip · neutral tag · tier mark | D-10 |
| Text sizes 12/13/14/16/18/24/30 only; weights 400/500/600; 800 = wordmark only **[OD-2]** | D-16 |
| Focus = 2px solid `#2A6BAC` outline + 2px offset everywhere | D-17 |
| Orange only for Friday, priority markers, star ratings | D-17 |
| Charts: you `--chart-you`, ≤ 2 highlighted rivals, others `--chart-context`, legend + table view | D-13 |
| Breadcrumb separators stay `›` (core spec §2.7) | D-07 |

## 2. Current state (what you will find)

Measured on `main` @ `10ce242d` (`apps/web/src`, non-test `.tsx`):

| Thing | Where | Count | Becomes |
|---|---|---|---|
| Hand-rolled card `rounded-[14px] bg-surface p-6 shadow-card` (and p-4 variants) | across pages | **~70** | Frame (step 1), then Section/Band/Frame/Card per page (step 4) |
| `shadow-card` anywhere | 58 files | — | removed |
| `rounded-[14px]` anywhere | — | **85** | `rounded-md` (8px) |
| Grey panel `rounded-lg bg-muted-surface p-3` (+ variants) | — | **~65** | Band: `rounded-md bg-muted-surface p-3` |
| `rounded-lg` anywhere | — | **107** | containers → `rounded-md`; nav items/controls → `rounded-sm` |
| shadcn `<Card>` | 29 files / 49 uses | — | see § 6.2 map |
| `<Button variant="outline">` / `secondary` / `destructive` / `ghost` | 101 / 10 / 11 / 6 | — | secondary / **re-map** / confirm-only / ghost |
| `<Badge variant=…>` (`outline` 13, `secondary` 10) + `StatusChip` (1) | 21 files | — | `StatusBadge` / `DotStatus` / `Tag` / `FilterChip` |
| `PageHeader` | 66 pages | — | restyle in one place (`components/page-header.tsx`) |
| `text-[26px]` / `font-extrabold` / `#64748B` | 34 hits | — | tokens |
| Uppercase tracked labels (`uppercase tracking-[0.08em]`) | 6 files | — | sentence-case group label |
| `SaveBar` | **0 uses** | — | adopt on multi-field forms (D-15) |
| `Tabs` look | `tabs-classes.ts` (segmented pill track) | 1 `TabsLinkList` use | underline tabs + new `Segmented` |

Shell files: `apps/web/src/components/shell/{app-shell,sidebar,sidebar-nav,top-bar,mobile-nav,context-switcher,avatar-menu}.tsx`; settings nav `components/settings-nav.tsx`; KPI `components/stat-card.tsx`; charts `components/charts/*.tsx`; primitives `packages/ui/src/components/*.tsx`; tokens `packages/ui/src/styles.css`, `packages/ui/src/theme.ts`.

## 3. Token changes (`packages/ui/src/styles.css`)

### 3.1 `:root` (add / change)

```css
/* change */
--muted-ink: #5B6B80;                 /* was #64748B — fails 4.5:1 on #EEF2F6 */
/* add */
--ink-secondary: #334155;
--line-subtle: #EDF1F5;
--line-control: #CBD5E1;
--line-strong: #8796AB;               /* input/checkbox boundary, 3.01:1 */
--focus: #2A6BAC;                     /* NOT var(--secondary): stays fixed even when an agency changes secondary [see § 3.4] */
--primary-hover: #56AFE9;              /* 16a: = themeVars(#47A8E7); derived per agency (8 % away from the label colour, label >= 4.5:1) */
--primary-active: #64B6EB;             /* 16a: 16 % step, same rule */
--link: var(--primary-soft-text);
--danger-hover: #B91C1C;
--danger-text: #B91C1C;
--success-text: #166534;
--warning: #D97706;
--warning-surface: #FFF7E6;
--warning-text: #92400E;
--chart-rival-1: #E05A2B;
--chart-rival-2: #14936A;
--chart-context: #A3B1C2;
--chart-peer-band: #EEF2F6;
--chart-grid: #EDF1F5;
--chart-axis: #5B6B80;
--shadow-overlay-value: 0 1px 2px rgba(11,37,64,.06), 0 6px 20px rgba(11,37,64,.12);
--shadow-dialog-value: 0 2px 6px rgba(11,37,64,.08), 0 16px 40px rgba(11,37,64,.18);
--radius: 0.5rem;                     /* was 0.75rem */
```
`--you` already maps to `--secondary` (chart "you"). Keep it.

### 3.2 `@theme inline` (add / change)

```css
--color-ink-secondary: var(--ink-secondary);
--color-line-subtle: var(--line-subtle);
--color-line-control: var(--line-control);
--color-line-strong: var(--line-strong);
--color-input: var(--line-strong);            /* was var(--line) */
--color-ring: var(--focus);                   /* was var(--primary) */
--color-primary-hover: var(--primary-hover);
--color-primary-active: var(--primary-active);
--color-link: var(--link);
--color-danger-hover: var(--danger-hover);
--color-danger-text: var(--danger-text);
--color-success-text: var(--success-text);
--color-warning: var(--warning);
--color-warning-surface: var(--warning-surface);
--color-warning-text: var(--warning-text);
--color-chart-rival-1: var(--chart-rival-1); --color-chart-rival-2: var(--chart-rival-2);
--color-chart-context: var(--chart-context); --color-chart-peer-band: var(--chart-peer-band);
--color-chart-grid: var(--chart-grid); --color-chart-axis: var(--chart-axis);
/* radius: fixed values replace the calc() chain */
--radius-xs: 4px;  --radius-sm: 6px;  --radius-md: 8px;  --radius-lg: 12px;  --radius-xl: 12px;
/* shadows */
--shadow-overlay: var(--shadow-overlay-value);
--shadow-dialog: var(--shadow-dialog-value);
/* keep --shadow-card until § 9 PR 4 has removed every use, then delete it */
```
Optionally also set `--chip-warning-bg: #FFF7E6` so warning badges match warning alerts.

### 3.3 Radius trap (read before changing `--radius`)

Today `rounded-md` = 10px and `rounded-lg` = 12px, and **buttons, inputs and selects use `rounded-md`**. With the new scale `rounded-md` = 8px, which is the *container* radius. Therefore, in the **same PR** that changes the scale (§ 9 PR 1), switch every control primitive in `packages/ui` to `rounded-sm` (6px): button, input, select trigger, textarea, dropdown/select items (already `rounded-sm`, so they become 6px), and the tabs trigger. Then `rounded-lg` (12px) is no longer used by containers. The codemod in § 7 moves them to `rounded-md`.

### 3.4 `theme.ts`

- Add `'--primary-foreground'` to `themeVars()`: `contrast('#FFFFFF', primary) >= 4.5 ? '#FFFFFF' : '#0B2540'` **[OD-1]**. The default #47A8E7 therefore gets ink #0B2540. Map `--color-primary-foreground: var(--primary-foreground)` in `@theme` (default `#FFFFFF` in `:root`).
- Do **not** derive `--focus` from the agency colour. It stays #2A6BAC so focus always passes 3:1. *Optional:* if the agency secondary passes 3:1 on white, use it for focus. Unit-test both branches.
- Add a test in `theme.test.ts`: for a set of sample agency colours (#47A8E7, #FFD400, #111111, #2A6BAC, #E11D48), `--primary-foreground` has contrast ≥ 4.5 against `--primary`.

### 3.5 Contrast test from the token file

Add `packages/ui/src/tokens.contrast.test.ts`. Read the approved pairs from [05 § 2 "Approved foreground/background pairs"](05-design-system-specification.md) as a literal table in the test, not by parsing the doc, and assert each ratio ≥ its threshold (text 4.5, UI 3.0). Reuse the existing contrast helper used by `status-chip`'s `CHIP_COLOURS` test if there is one; otherwise write a 6-line WCAG luminance function in the test.

## 4. Primitive recipes (`packages/ui/src/components`)

Keep component names, exports and `data-slot` attributes so existing tests keep working. Replace only class strings unless a row says *new*. Every recipe uses Tailwind v4 utilities backed by § 3 tokens.

### 4.1 `button.tsx`

| Part | Before (abridged) | After |
|---|---|---|
| base | `gap-2 rounded-md text-sm font-medium … focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50` | `gap-1.5 rounded-sm text-[13px] font-medium … transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45` *(keep the svg rules)* |
| `default` (primary) | `bg-primary text-primary-foreground hover:bg-primary/90` | `bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active` |
| `outline` (= system *secondary*) | `border bg-background shadow-xs hover:bg-accent …` | `border border-line-control bg-surface text-ink hover:bg-canvas [&_svg:not([class*='text-'])]:text-muted-ink` |
| `secondary` (brand-blue fill today, 10 uses) | `bg-secondary text-secondary-foreground …` | **Deprecate.** Same classes as `outline`, plus a `// @deprecated use variant="outline"` comment. Migrate the 10 call sites in § 9 PR 3, then delete the variant. |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | `text-ink-secondary hover:bg-muted-surface hover:text-ink` |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90 …` | `bg-destructive font-semibold text-white hover:bg-danger-hover`. **Only inside confirm dialogs**: audit the 11 uses, and page-level triggers become `destructive-outline` |
| *new* `destructive-outline` | — | `border border-line-control bg-surface text-danger-text hover:bg-chip-danger-bg` |
| `link` | `text-primary underline-offset-4 hover:underline` | `h-auto px-0 text-link underline-offset-4 hover:underline` |
| sizes | default `h-9 px-4`, sm `h-8 px-3`, lg `h-10 px-6`, xs `h-6`, icon `size-9`, icon-sm `size-8`, icon-lg `size-10`, icon-xs `size-6` | default `h-9 px-3 has-[>svg]:px-2.5`, **sm `h-7 px-2.5 text-xs gap-1`**, **lg `h-11 px-4 text-sm`**, icon `size-9`, icon-sm `size-7`, icon-lg `size-11`; remove `xs`/`icon-xs` (0 uses) |
| loading | — | Support `aria-busy="true"`: add `aria-busy:pointer-events-none`. Callers render a 14px spinner in place of the icon and keep the label |

*Note:* `sm` shrinks from 32px to 28px (51 call sites). Check toolbars and table rows visually; that is the intended density (D-09).

### 4.2 Status family (`badge.tsx`, `status-chip.tsx`, new files)

- **`StatusChip` → becomes the attention badge.** Change the base to `inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-xs font-medium whitespace-nowrap`. Add a **required** `icon` prop (lucide component, rendered `size-3 aria-hidden`). Map tone `warning` to `bg-warning-surface text-warning-text shadow-[inset_0_0_0_1px_rgb(217_119_6/0.25)]`.
- *new* `dot-status.tsx`: `DotStatus({ tone, children })` → `<span class="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary"><span aria-hidden class="size-2 rounded-full bg-…"/>…`. Tones: success `bg-success`, warning `bg-warning`, danger `bg-danger`, info `bg-secondary`, neutral `bg-muted-ink`, off `border-[1.5px] border-line-strong`.
- *new* `filter-chip.tsx`: a `button`, `inline-flex h-7 items-center gap-1 rounded-full border border-line-control bg-surface px-2.5 text-xs font-medium text-ink-secondary`. Props `applied` (→ `border-transparent bg-primary-soft text-primary-soft-text` + ✕ button with `aria-label="Remove filter <field>"`), `dashed` (→ `border-dashed text-muted-ink`), `pressed` (→ `bg-ink text-white`, `aria-pressed`).
- *new* `tag.tsx`: `inline-flex h-5 items-center rounded-xs bg-muted-surface px-1.5 text-xs text-ink-secondary`.
- *new* `tier-mark.tsx`: `TierMark({ tier: 'top'|'watch'|'minor' })`. A 10px `rounded-[2px]` square (filled `bg-secondary` / half via `bg-[linear-gradient(90deg,var(--secondary)_50%,var(--line-control)_50%)]` / `bg-line-control`) + 12px/600 label (minor: 500 + `text-muted-ink`). Labels from `@cs/core` tier names.
- **`Badge`** (shadcn) stays for back-compat but is **not used in new code**. Migrate its 23 uses: `outline` → `Tag` (category) or `DotStatus` (state); `secondary` → `StatusChip` (attention) or `Tag`. Decide per call site with § 6.1 C.

### 4.3 Tabs (`tabs-classes.ts`, `tabs.tsx`, `tabs-link.tsx`, new `segmented.tsx`)

Underline tabs become the default look for both `Tabs` and `TabsLink`:
```ts
export const tabsListClass = "inline-flex h-10 w-full items-end gap-6 border-b border-line text-muted-ink"
export const tabsTriggerClass = "relative inline-flex h-10 items-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-muted-ink transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
export const tabsTriggerActiveClass = "data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-t-sm data-[state=active]:after:bg-ink"
export const tabsLinkActiveClass = /* same with aria-[current=page]: prefixes */
```
*new* `segmented.tsx` (`role="radiogroup"`, radix ToggleGroup single): track `inline-flex gap-0.5 rounded-sm bg-muted-surface p-0.5`; item `h-6 rounded-xs border border-transparent px-2.5 text-xs font-medium text-ink-secondary`; on `data-[state=on]:border-line data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-ink`. Every current use of `Tabs` that switches a range or view of the *same* data (rather than navigating between sections) moves to `Segmented`. Search `<TabsList` / `<Tabs ` and judge each.

Counts in a tab: `<span class="inline-grid h-[18px] min-w-[18px] place-items-center rounded-xs bg-muted-surface px-1 text-[11px] font-semibold tabular-nums text-ink-secondary">`.

### 4.4 Form controls

| File | After (key classes) |
|---|---|
| `input.tsx` | `h-9 w-full rounded-sm border border-input bg-surface px-3 text-sm text-ink placeholder:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:bg-canvas disabled:border-line-control disabled:text-muted-ink` (drop `shadow-xs`, `bg-transparent`, `ring-[3px]`) |
| `select.tsx` trigger | same border/focus/invalid as input; `rounded-sm h-9` (`data-[size=sm]:h-7`); chevron `text-muted-ink` (not `opacity-50`) |
| `select.tsx` content | `rounded-md border border-line bg-surface p-1 shadow-overlay` |
| `select.tsx` / `dropdown-menu.tsx` items | `h-8 rounded-sm px-2 text-[13px] focus:bg-muted-surface` (destructive item keeps `text-destructive`, focus `bg-chip-danger-bg`) |
| `label.tsx` | `text-[13px] font-medium leading-[18px] text-ink` |
| `switch.tsx` | track `h-[18px] w-8`, `data-[state=checked]:bg-secondary data-[state=unchecked]:bg-line-strong`, focus = outline ring; thumb `size-3.5` |
| *new* `field.tsx` | `Field({ label, required, optional, help, error, children })`: label → control → help **or** error (`text-xs text-danger-text` + `CircleAlert size-3.5`), gap 6px; wires `aria-describedby` / `aria-invalid`; required = `<span aria-hidden class="text-danger-text">*</span>` + "(required)" in `sr-only` |
| checkbox (if a primitive is added) | `size-4 rounded-xs border border-line-strong data-[state=checked]:bg-secondary data-[state=checked]:border-secondary` |

### 4.5 Containers (new) and `card.tsx`

```tsx
// section.tsx (new)
<section className="flex flex-col gap-4">                 {/* sibling gap: parent uses gap-10 */}
  <div className="flex items-end gap-3">                    {/* SectionHead */}
    <div><h2 className="text-base font-semibold">…</h2><p className="mt-0.5 text-[13px] text-muted-ink">…</p></div>
    <div className="ml-auto flex items-center gap-2">{actions}</div>
  </div>
  …
</section>
// band.tsx (new):   <div className="rounded-md bg-canvas px-5 py-4">   (tone="muted" → bg-muted-surface p-4)
// frame = Card (restyled, below)
```
`card.tsx` becomes the **frame**: `Card` → `flex flex-col rounded-md border border-line bg-card text-card-foreground` (no `shadow-card`, no `gap-6 py-6`). `CardHeader` → `flex items-center gap-2 border-b border-line px-4 py-3` (title `text-sm font-semibold`). `CardContent` → `p-4`. `CardFooter` → `flex items-center gap-3 border-t border-line bg-canvas px-4 py-3 text-[13px] text-muted-ink`. Add `variant="interactive"` → `transition-colors hover:border-line-control hover:bg-canvas` + `focus-within:outline-2 …`, and `selected` → `border-2 border-secondary bg-primary-soft`. **Spacing changes for every `<Card>`.** That is intended. Check each page in § 9 PR 4.

### 4.6 Overlays

| File | After |
|---|---|
| `dialog.tsx` overlay | `bg-[rgb(11_37_64/0.32)]` (was `bg-black/50`) |
| `dialog.tsx` content | `rounded-md border-0 bg-surface p-0 shadow-dialog sm:max-w-[480px]`, body `p-6 pb-5`, title `text-base font-semibold`, description `text-sm text-ink-secondary`, footer `flex justify-end gap-2 px-6 pb-5 pt-3` (desktop order Cancel → action) |
| `confirm-dialog.tsx` | Confirm button `variant="destructive"` only when `tone="danger"`; typed confirmation keeps the action disabled until it matches (it may already; verify) |
| `dropdown-menu.tsx` content / `popover.tsx` content | `rounded-md border border-line bg-surface shadow-overlay` (+ `p-1` menus, `p-4` popovers); menu label `text-xs font-medium text-muted-ink`; separator `bg-line` |
| `tooltip.tsx` | `rounded-xs bg-ink px-2 py-1 text-xs text-white shadow-overlay`; **remove the Arrow** (D-24) |
| `sheet.tsx` | overlay as dialog; content `shadow-dialog`; mobile bottom variant (new `side="bottom"`): `inset-x-0 bottom-0 rounded-t-lg max-h-[85vh]` |
| `command.tsx` | palette `w-[600px] rounded-md border border-line shadow-overlay`; input row `h-11`; add a footer hint row; last group "Ask {assistant} about '…'" (needs `app` wiring, § 5.5) |
| `save-bar.tsx` | `sticky bottom-4 z-30 mx-auto flex w-full max-w-[640px] items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-[13px] font-medium shadow-overlay`, "Unsaved changes" left, Discard `variant="ghost" size="sm"`, Save `size="sm"` |
| *new* `toast` | if no toast exists, add one on radix Toast: `rounded-md bg-ink px-4 py-2 text-[13px] text-white shadow-overlay`, `role=status`, bottom-right, 4s / 6s with Undo |
| *new* `alert.tsx` | `flex gap-2.5 rounded-sm px-4 py-3 text-[13px]`; tones info `bg-primary-soft`, warning `bg-warning-surface shadow-[inset_3px_0_0_var(--warning)]`, danger `bg-chip-danger-bg`, neutral `bg-muted-surface`; icon `size-4` coloured per tone |

### 4.7 Table (`table.tsx`)

| Part | After |
|---|---|
| `Table` | `w-full text-[13px] leading-[18px]` |
| `TableHeader` | `[&_tr]:border-b [&_tr]:border-line` |
| `TableHead` | `h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-ink first:pl-0 last:pr-0 aria-[sort]:text-ink` |
| `TableRow` | `border-b border-line-subtle transition-colors hover:bg-canvas data-[state=selected]:bg-primary-soft` |
| `TableCell` | `h-10 px-3 align-middle whitespace-nowrap text-ink-secondary first:pl-0 last:pr-0` |
| *new* prop `numeric` on head/cell | `text-right tabular-nums` |
| *new* `TableFrame` | wraps a table inside a mixed page: `overflow-hidden rounded-md border border-line` + header row `bg-canvas`; restores `first:pl-4 last:pr-4` |
| `density="compact"` on `Table` | cells `h-8` |

### 4.8 Friday parts (`friday-badge.tsx` + new)

- `FridayBadge` stays (brand pill). Add `size="label"` → `h-5 px-2 text-[11px]`.
- *new* `citation-pill.tsx`: an `<a>`/`<button>` → `inline-flex h-5 items-center gap-1 rounded-xs bg-muted-surface px-1.5 align-[1px] text-xs font-medium text-ink-secondary hover:bg-line`, icon `size-[11px]`, accessible name "Evidence: {source}, {date}". It **must** open the existing evidence view; reuse `components/evidence-chips.tsx` logic if it already maps evidence ids → URLs.
- *new* `sources-list.tsx`: rule above, rows `icon · title · date (ml-auto text-muted-ink)`, 12px.

## 5. App recipes (`apps/web/src`)

### 5.1 Shell (§ 9 PR 5)

| File | Change |
|---|---|
| `components/shell/app-shell.tsx` | Outer: `grid min-h-screen grid-cols-[240px_1fr] grid-rows-[48px_1fr] bg-canvas` (lg+); the `<main>` becomes the **sheet**: `m-0 mr-2 mb-2 overflow-hidden rounded-md border border-line bg-surface lg:…` with inner `mx-auto w-full max-w-[1560px] px-4 pt-6 pb-10 lg:px-8 flex flex-col gap-10`. Banners stay above the sheet. Below `lg`: sheet `m-0 rounded-none border-0`. |
| `components/shell/top-bar.tsx` | `h-12` (was `h-[68px]`), **no `border-b`, `bg-canvas`** (part of the frame). Left: agency logo + name (move from the sidebar) and the context switcher as slash breadcrumbs (`components/shell/context-switcher.tsx` rendered inline, trigger `h-7 rounded-sm px-2 text-[13px] font-medium hover:bg-muted-surface`). Centre: search trigger opening the command palette (`h-8 max-w-[420px] rounded-sm border border-line bg-surface text-[13px] text-muted-ink` + kbd "Ctrl K"). Right: **Ask {assistant}** pill (`FridayBadge`-styled button, client context only, links to the Ask page), help, `InboxBell`, `AvatarMenu`. |
| `components/shell/sidebar.tsx` | `w-[240px] bg-canvas` with **no `border-r`**, `px-3 py-2`, sticky under the top bar; logo block removed (moved to top bar); add collapse-to-rail (56px) toggle at the bottom (persist in a cookie, like `tz-cookie`). |
| `components/shell/sidebar-nav.tsx` | Item: `flex h-8 items-center gap-2.5 rounded-sm px-2 text-[13px] font-medium text-ink-secondary hover:bg-muted-surface`; current: `bg-primary-soft font-semibold text-primary-soft-text` (**remove the `before:` 3px accent bar**, D-04). Count: `ml-auto text-xs font-medium text-muted-ink` (**not** the amber pill; amber is Friday-only). `item.pill` stays amber **only** for the assistant entry. Section label: `px-2 pb-1 text-xs font-medium text-muted-ink` (**sentence case, no `uppercase tracking-[0.08em]`**). Icons `size-4 strokeWidth={1.75}`. |
| `components/settings-nav.tsx` | Becomes the **drill-in** variant rendered *in the sidebar column* on settings routes: "‹ Back to {context}" link (`text-[13px] font-medium text-muted-ink`) + grouped items with the same item classes as sidebar-nav; the md+ in-page column goes away. Mobile keeps the horizontal scroller but restyled as filter chips. Routes unchanged (`/agency/settings/*`, `/c/<id>/settings/*`). |
| `components/shell/mobile-nav.tsx` | < 1024: hamburger drawer (existing `Sheet side="left"`). < 768 bottom tab bar is **[OD-5]**: build it only if approved, as `components/shell/bottom-tabs.tsx`. |

### 5.2 PageHeader (`components/page-header.tsx`; 66 pages, change once)

- `h1`: `text-2xl font-semibold tracking-[-0.01em] leading-8` (was `text-[26px] font-extrabold tracking-tight`) **[OD-2]**.
- description: `mt-1 text-sm text-muted-ink max-w-[70ch]`.
- Add props `meta?: React.ReactNode` (rendered `mt-1.5 flex items-center gap-3 text-xs text-muted-ink`; use for "Updated 2 hours ago" with a green 6px dot) and `variant?: 'standard' | 'compact' | 'detail'` (compact: `text-lg` title, `items-center`, tabs slot inline). Add `tabs?: React.ReactNode` rendered under the title row (standard) or inline (compact).
- `step` eyebrow: `text-xs font-medium text-muted-ink` (no `font-semibold` caps).
- Keep the `›` breadcrumb (core spec §2.7). The breadcrumb list becomes `text-[13px]`.
- Guard rail: add a dev-only check (or a test helper) that counts `[data-variant="default"]` buttons inside `actions` and warns if > 1.

### 5.3 KPI (`components/stat-card.tsx` → `kpi-strip.tsx`)

Replace the per-KPI card (`rounded-[14px] bg-surface p-6 shadow-card`, value `text-[34px] font-extrabold text-secondary`) with:
```tsx
<KpiStrip>  {/* grid auto-cols-fr grid-flow-col rounded-md border border-line; <768: grid-cols-2 */}
  <Kpi label="Google rating" value="4.7" delta={{ dir: 'up', text: '0.1', good: true }} caption="Market median 4.5" />
</KpiStrip>
```
Cell `px-5 py-4 [&+&]:border-l border-line`; label `text-[13px] text-muted-ink`; value `mt-1 text-2xl font-semibold tabular-nums tracking-[-0.01em] text-ink` (**ink, not secondary [OD-2]**); delta pill `inline-flex h-5 items-center gap-0.5 rounded-xs px-1.5 text-xs font-semibold tabular-nums` (`good` → success tones, bad → danger tones, flat → neutral) with an arrow icon and an accessible name ("Up 0.1 since last week"). Keep `StatCard`'s `pill.srLabel` semantics. "Good" depends on the metric: a lower map rank is good.

### 5.4 Charts (`components/charts/*.tsx`)

| File | Change |
|---|---|
| `line-chart.tsx` | `SERIES_COLORS` → `['var(--you)', 'var(--chart-rival-1)', 'var(--chart-rival-2)']`; `OTHER_COLOR` → `'var(--chart-context)'`; gridline `#E2E8F0` → `var(--chart-grid)`; axis text `#64748B` → `var(--chart-axis)`, `fontSize={12}`. Cap highlighted series at you + 2 rivals; fold the rest into context grey and keep the legend and table view. |
| `rank-trend.tsx` | `MUTED` → `var(--chart-axis)`, `GRID` → `var(--chart-grid)`, `MARKER` → `var(--chart-context)` |
| `change-grid.tsx`, `geo-grid.tsx`, `topic-heatmap.tsx` | **Keep their validated ramps** (diverging/sequential, validated 2026-10-17). Only replace `#64748B` → `var(--chart-axis)` and `#E2E8F0` → `var(--chart-grid)`. Do not touch the ramp hexes without re-running the dataviz validator. |
| containers around charts | remove card wrappers; on dashboards use the hairline grid (§ 6.1 B) |
| SVG `fill`/`stroke` with CSS vars | works in inline SVG. If a chart is ever rasterised (email), resolve the vars server-side first. |

### 5.5 Friday (Ask) and briefs

- Ask page: thread column `max-w-[680px]`; user message `self-end max-w-[85%] rounded-lg bg-muted-surface px-3 py-2 text-sm`; assistant message flat, `text-base leading-[26px]` on the full page (`text-sm leading-[22px]` in the docked panel) with a `FridayBadge size="label"` header row; claims render `CitationPill`; `SourcesList` under each answer; suggestions as `↳` rows (`border-t border-line py-2.5 text-[13px] text-ink-secondary`); composer `rounded-md border border-input p-3` with a scope chip and a `size-7 rounded-sm bg-primary` send button.
- Docked panel (D-14) is new UI. Build it after the Overview slice, as `components/ask/friday-panel.tsx`: a third grid column at ≥ 1280, a `Sheet side="right"` below that.
- Brief reading view: `mx-auto max-w-[680px]`, title `text-[30px] font-semibold leading-9 tracking-[-0.02em]`, sections `border-t border-line py-6 first:border-0`, H2 `text-lg font-semibold`, body `text-base leading-[26px]`, "Why it matters" = Band `bg-muted-surface rounded-md px-4 py-3 text-sm leading-[22px]`.

## 6. Migration rules

### 6.1 Decision tree (apply to every container you touch)

```
A. Is it a table with a toolbar or header that sits among other content?        → Frame (Card restyled) + TableFrame
   Is the table the whole point of the page (Competitors, Changes, Ads, Reviews)? → flush <Table> in a Section, no Frame
B. Is it a group of charts/metrics?                                              → KpiStrip / hairline grid
     (hairline grid: grid with `border-t border-line`, cells `border-b border-line [&+&]:border-l py-5 pr-6 [&+&]:pl-6`)
C. Is it a status, category or count label?                                      → DotStatus / StatusChip(+icon) / Tag / count
D. Is it a summary, tip, "why it matters", nested reply, onboarding hint?        → Band (bg-canvas, or bg-muted-surface for grey panels)
E. Is it a group of settings rows, a live preview, a danger-zone list, a tabbed panel? → Frame
F. Can the user select / remove / open it independently of its siblings
   (suggested competitor, integration, plan option, saved view)?                  → Card variant="interactive" (selected → selected)
G. Anything else (a heading + text + controls)                                    → Section. Remove the wrapper.
Never: a Card/Frame inside a Card/Frame. A Band may sit inside a Frame body only for a nested reply/preview.
```

### 6.2 Per-file map (`<Card>` and `shadow-card`)

*Generated by reading every usage on `main` @ `10ce242d`. Verdicts are recommendations; re-check them against § 6.1 when you open each file.*

**Band tone rule (16e/16f):** a flash or notice Band = `tone="muted"` (grey `bg-muted-surface`); a sub-panel, footer or checklist Band = `tone="canvas"` (`bg-canvas`).

Scope: every shadcn `<Card>` and every `shadow-card` element in `apps/web/src` + `packages/ui/src` (tests excluded); shared class constants (`cardCls`, `card`) expanded to their uses. Excluded: `components/shell/context-switcher.tsx:152,238` (a local `Card` function, not shadcn). **Control** = the active state of a segmented toggle (drop the shadow, use the `Segmented` on-state), not a container.

**Totals:** Section 77 · Frame 42 (incl. 8 KPI-strip groupings) · Remove wrapper 13 · Card 9 · Band 7 · Control 5 → **153 app usages**, plus `card.tsx` (redefine) and `--shadow-card` (retire).

#### Agency pages
| File | What it renders | Current | Verdict | Reason |
|---|---|---|---|---|
| app/(app)/agency/page.tsx:90, :94, :98, :102 | Dashboard KPIs (Clients, Alerts waiting, Briefs to approve, High pressure) | 4 × div/Link shadow-card | **One KPI strip (Frame)** | D-12; link cells stay links |
| app/(app)/agency/page.tsx:127 | Clients table | Card | Frame | Table among sections |
| components/agency/onboarding-checklist.tsx:28 | "Getting started" checklist | Card | Band | Progress strip |
| app/(app)/agency/leads/lead-card.tsx:113 | One lead (claim/assign) | Card | Card | Individually actionable |
| app/(app)/agency/alerts/alert-controls.tsx:90 | Alert awaiting action | article shadow-card | Card | Actionable queue item |
| app/(app)/agency/approvals/[briefId]/review-controls.tsx:294 | Auto-send + Approve bar | div shadow-card | Band | Action bar |
| app/(app)/agency/clients/new/lookup-step.tsx:69, :134 | Search form; confirm form | form shadow-card | Section | Forms on sheet |
| app/(app)/agency/clients/new/lookup-step.tsx:100 | Selectable place result | button shadow-card | Card (interactive/selected) | Selectable object |
| app/(app)/agency/prospects/[clientId]/page.tsx:73, :83, :92, :106 | Steps 1–4 | div shadow-card | Section (`ruled`) | Numbered steps |
| app/(app)/agency/prospects/[clientId]/page.tsx:99 | Landscape chart | div shadow-card | Section | Chart wrapper |

#### Agency settings
| File | What it renders | Current | Verdict | Reason |
|---|---|---|---|---|
| agency/settings/usage/page.tsx:50, :54 | Near cap / Over cap | div shadow-card | One KPI strip | D-12 |
| agency/settings/platform-access/page.tsx:45 | Notifications switch | Card | Section (or grouped rows Frame) | Single setting |
| agency/settings/platform-access/page.tsx:56 | Support sessions table | Card | Frame | Table among sections |
| agency/settings/team/page.tsx:63, :107 | Members; pending invitations | Card | Frame | D-11 team tables |
| agency/settings/slack-teams/page.tsx:38 | Webhooks list + form | Card | Section | Settings group |
| agency/settings/billing/page.tsx:100, :139 | Plan summary; discount form | Card | Section | |
| agency/settings/billing/page.tsx:150 | Invoices table | Card | Frame | |
| agency/settings/billing/client-billing/section.tsx:24 | Client billing (Connect) | Card | Section | |
| components/agency/intake-link-card.tsx:60 | Intake link + embed | Card | Section | |
| components/agency/branding-editor.tsx:74 | Branding form | form shadow-card | Section | |
| components/agency/branding-editor.tsx:137 | Live preview (sticky) | div shadow-card | Frame | Preview frame (D-15) |

#### Client pages
| File | What it renders | Current | Verdict | Reason |
|---|---|---|---|---|
| c/[clientId]/page.tsx:40 `cardCls` (uses :119 :128 :151 :164 :181 :195 :219 :225) | Overview widgets | shadow-card ×8 | Section ×8 | D-26; charts into hairline grid |
| components/client-home-basic.tsx:47, :61, :69 | Basic home widgets | Card | Section | |
| c/[clientId]/ask/ask-screen.tsx:77 | Thread list aside | aside shadow-card | Section (divider) | |
| c/[clientId]/ask/ask-screen.tsx:123 | "Ask is private" note | p shadow-card | Band | Tip |
| c/[clientId]/ads/page.tsx:62 | Active ads chart | div shadow-card | Section | |
| c/[clientId]/ads/page.tsx:75 | Filter form | form shadow-card | Remove wrapper | Toolbar on sheet |
| c/[clientId]/ads/ad-card.tsx:13 | Captured ad in a grid | article shadow-card | Frame | Static preview (Card if ads become selectable) |
| c/[clientId]/briefs/page.tsx:125, :128 | "Nothing more"; briefs list | p/ul shadow-card | Remove wrapper | List is the page |
| c/[clientId]/changes/page.tsx:28, :109 | Empty helper; changes table | Card | Remove wrapper | D-11 flush |
| c/[clientId]/changes/viewer.tsx:146 | Change viewer shell | Card | Frame (→ peek panel, D-21) | Holds :103 and :219 |
| c/[clientId]/changes/viewer.tsx:103 | "Why this scored N" | Card | Band | Explanation |
| c/[clientId]/changes/viewer.tsx:219 | Tabbed compare body | Card | Remove wrapper | No nesting inside :146 |
| c/[clientId]/changes/viewer.tsx:209 · changes/feed.tsx:41 · moves/page.tsx:47 | Active toggle states | shadow-card | Control | Use `Segmented` |
| c/[clientId]/moves/page.tsx:152 | Master list pane | Card (p-2) | Frame | List pane |
| c/[clientId]/moves/page.tsx:168 | Selected move detail | Card | Section | |
| c/[clientId]/moves/page.tsx:190 | No-selection empty | Card | Remove wrapper | EmptyState alone |
| c/[clientId]/competitors/page.tsx:67 | Competitors table | Card | Remove wrapper | D-11 flush (Frame 7) |
| c/[clientId]/competitors/competitor-controls.tsx:275 | "Suggested competitors" | Card | Section | Items at :192 become interactive Cards |
| c/[clientId]/competitors/[competitorId]/page.tsx:41 | `Kpi` tile helper | Card | KPI strip | D-12 |
| c/[clientId]/competitors/[competitorId]/page.tsx:182, :204 | Timeline; collection status | Card | Section (status → aside rows, D-21) | |
| c/[clientId]/competitors/[competitorId]/page.tsx:238 | Pages table | Card | Frame | |
| c/[clientId]/competitors/[competitorId]/sections.tsx:11 | `Section` helper | section shadow-card | Section | Drop the shadow/radius |
| c/[clientId]/evidence/[evidenceId]/page.tsx:112 | Screenshot/text preview | Card | Frame | Drop inner img border (:122) |
| c/[clientId]/evidence/[evidenceId]/page.tsx:137, :158 | Capture details; related changes | Card | Section | |
| c/[clientId]/pitch-snapshot/page.tsx:56 | Landscape chart | div shadow-card | Section | |
| c/[clientId]/pricing/price-card.tsx:21 | One competitor's price list | section shadow-card | Section (Frame if side-by-side peers blur) | |
| c/[clientId]/rankings/page.tsx:146 | Filter form | form shadow-card | Remove wrapper | Toolbar |
| c/[clientId]/rankings/page.tsx:190, :205, :218, :249 | Rank chart, geo-grid, share of voice, compare | section shadow-card | Section | Charts; map image may take a Frame |
| c/[clientId]/reviews/page.tsx:91, :101, :108, :117 | Heatmap, mix, trend, reviews list | section shadow-card | Section | |

#### Client settings
| File | What it renders | Current | Verdict |
|---|---|---|---|
| c/[clientId]/settings/delivery/page.tsx:56 | Recipients table | Card | Frame |
| c/[clientId]/settings/delivery/delivery-controls.tsx:38 (+ rows :54) | Delivery options | form shadow-card | Frame of grouped rows (inner bordered rows → dividers) |
| c/[clientId]/settings/alerts/page.tsx:50 | How scoring works | Card | Band |
| c/[clientId]/settings/alerts/alert-rules-form.tsx:27 | Threshold form | form shadow-card | Section |
| c/[clientId]/settings/profile/client-features-form.tsx:29 (+ rows :38, :50) | Feature toggles | form shadow-card | Frame of grouped rows |
| c/[clientId]/settings/billing/page.tsx:90 | Plan with agency | Card | Section |
| app/(app)/settings/notifications/page.tsx:55 | Per-contact prefs tables | Card (loop) | Frame (title → section head) |

#### Onboarding and public
| File | What it renders | Current | Verdict |
|---|---|---|---|
| (app)/onboarding/steps/profile.tsx:49, team.tsx:36, plan.tsx:35 | Agency wizard steps | shadow-card | Section (plan summary may be a Band) |
| c/[clientId]/setup/page.tsx:81 | Setup finished summary | section shadow-card | Band |
| c/[clientId]/setup/steps/{business:104, search:30, pick:31, invite:48, billing:43} | Client setup steps | shadow-card | Section (pick items → interactive Cards) |
| app/start/shell.tsx:29 | `/start` panel | section shadow-card | Section on a white page (no shell) |
| components/auth-card.tsx:16 | Sign-in/join panel | Card | Remove card → centred 400px column on white (D-22) |

#### Platform / operator
| File | What it renders | Current | Verdict |
|---|---|---|---|
| (platform)/platform/_components/overview-charts.tsx:8 (`cardCls`) | Chart wrappers | shadow-card | Section |
| platform/page.tsx:63 | Recent activity feed | `cardCls` | Section |
| platform/agencies/[id]/page.tsx:120, :161 | Team dl; billing panel | `cardCls` | Section |
| platform/agencies/[id]/page.tsx:132, :165 | Clients; support sessions tables | `cardCls` | Frame |
| platform/agencies/agency-table.tsx:48 | Agencies table | div shadow-card | Remove wrapper (flush) |
| platform/_components/range-toggle.tsx:21 · billing/signups-panel.tsx:40 | Active toggle pills | shadow-card | Control |
| platform/health/page.tsx:14 (`card`, uses :37 :44 :51 :58) | Worker/Queues/Vendors/Sources tables | shadow-card | Frame ×4 |
| platform/costs/page.tsx:22 (`card`, uses :47 :62 :69) | Cost tables | shadow-card | Frame ×3 |
| platform/costs/page.tsx:54 | Monthly spend chart | `card` | Section |
| platform/costs/_components/summary-cards.tsx:7 | Cost KPI tile | div shadow-card | KPI strip |
| platform/billing/page.tsx:26 (`card`, uses :93 :97 :101 :105 :110) | Sign-up/Plans/Codes/Connect/Invite editors | shadow-card | Section ×5 (inner tables Frame) |
| platform/billing/page.tsx:81 | Agencies by state | div shadow-card | KPI strip |
| platform/knowledge/page.tsx:71 | Filter form | form shadow-card | Remove wrapper |
| platform/knowledge/import-panel.tsx:68 · editor.tsx:66, :103 | Import; edit form; source panel | shadow-card | Section |
| platform/knowledge/editor.tsx:51 | Article preview | div shadow-card | Frame |
| platform/reviews/review-queue.tsx:25 · themes/theme-queue.tsx:26 | Review item; topic proposal | shadow-card (loop) | Card |
| platform/themes/theme-queue.tsx:56 | Recently decided table | section shadow-card | Frame |
| platform/verticals/catalog-queue.tsx:48 (`card`, uses :156, :298) | Vertical/area catalogue items | shadow-card | Card ×2 |
| platform/leads/page.tsx:71, :115 | Lead pool; assignments tables | Card | Frame |

#### Shared components
| File | What it renders | Current | Verdict |
|---|---|---|---|
| components/stat-card.tsx:19 (used on client overview :111, reviews :82–85, platform, agency detail, views/scorecard.tsx:18) | StatCard | div shadow-card | → `Kpi` cell inside one `KpiStrip` per group |
| components/ask/ask-card.tsx:26 | Ask widget on overview | section shadow-card | Section (→ Friday summary Band on Overview, D-26) |
| components/ask/ask-chat.tsx:195 | Transcript + composer | section shadow-card | Frame (or Section + composer Band) |
| components/ai-connections.tsx:95, :203, :324 | Connector URL; tokens; connected apps | Card | Section (token table → Frame) |
| components/recommendation-board.tsx:118 | Recommendation item (start/done/reopen) | article shadow-card | Card |
| components/recommendation-board.tsx:188 | "N dismissed" disclosure | details shadow-card | Section |
| components/views/alert-view.tsx:14 · report-view.tsx:19 | Alert detail; report body | Card | Remove wrapper (Reading archetype L5) |
| components/views/brief-view.tsx:52 | Brief document | Card | Section (L5); on the Overview use a summary Band instead (D-26) |
| components/services-area-summary.tsx:13 | Services/area dl | dl shadow-card | Section |
| components/client-profile-form.tsx:38 · new-business-type.tsx:117 | Forms | shadow-card | Section |
| components/runbook/item-card.tsx:254 | Runbook play/rule (actions) | div shadow-card | Card |
| components/runbook/knob-card.tsx:56, :81 | Setting knobs | div shadow-card | Frame (grouped rows) |
| components/runbook/runbook-editor.tsx:90 | "Uses agency runbook" notice | div shadow-card | Band |

#### Judgement calls (re-check when you open them)
`alert-controls.tsx:90` / `lead-card.tsx:113` (queue items: Card, or dense list rows with a "⋯" menu) · `ad-card.tsx:13` (Frame vs Card) · `price-card.tsx:21` (Section vs Frame for side-by-side peers) · `changes/viewer.tsx` (depends on adopting the 440px peek panel) · `moves/page.tsx:152` (Frame vs flush + divider) · `ask-chat.tsx:195` · `knob-card.tsx` (each has its own switch → could be Card) · `brief-view.tsx:52` reused on the Overview · `onboarding/steps/plan.tsx:35`.

#### Other hand-rolled containers (no `shadow-card`), most common first
1. `rounded-lg bg-muted-surface p-3 text-ink` (~45×) = **Band**: radius → `rounded-md`, padding stays `p-3` for inline notes (use `px-5 py-4` for page-level summaries). E.g. `competitor-controls.tsx:28,135,146,159`, `delivery-controls.tsx:45,107`, `rankings/page.tsx:143,265`, `runbook-editor.tsx:99,101`, `review-queue.tsx:22`, `ai-connections.tsx:44`.
2. `flex items-start gap-3 rounded-lg border border-line p-3`: bordered option rows inside containers. Suggestion items (`competitor-controls.tsx:192`) → interactive Card; settings rows (`delivery-controls.tsx:54`, `client-features-form.tsx:38,50`) → divided rows in one Frame.
3. `divide-y rounded-lg border bg-card` (`platform/ask/page.tsx:51`, `platform/knowledge/page.tsx:85`) → Frame list (`rounded-md border-line`).
4. `rounded-lg border bg-card p-4` / `rounded-lg border p-4` (`platform/ask/[threadId]/page.tsx:60`, `knowledge/editor.tsx:90,126`) → Frame.
5. Previews `overflow-hidden rounded-xl border border-line` (`branding-editor.tsx:140,168`), snapshot `rounded-lg border` (`changes/viewer.tsx:52`), image `rounded-lg border` (`evidence/[evidenceId]/page.tsx:122`) → `rounded-md`.
6. `rounded-lg border border-line bg-muted-surface p-4` (`ai-connections.tsx:128`) mixes types → Band (drop the border).
7. Chat bubble `rounded-2xl rounded-bl-md border …` (`ask-chat.tsx:104`) → user bubble `rounded-lg bg-muted-surface` / Friday flat (D-14). `ask/confirm-card.tsx:42` `rounded-xl` → Frame `rounded-md`.
8. Shared EmptyState `rounded-lg border border-dashed p-6` (`help/empty-state.tsx:27`) → no border, centred (`.rm-empty`), kept inside the table/frame it belongs to.
9. Sub-panels `rounded-lg bg-muted-surface p-4` (`catalog-queue.tsx:219,258,322`, `revenue-card.tsx:13`, `start/intake-form.tsx:34`) → Band `rounded-md`.
10. Segmented tracks `rounded-lg bg-muted-surface p-1` (`changes/feed.tsx:101`, `changes/viewer.tsx:198`, `moves/page.tsx:143`) + their active pills (Control rows above) → `Segmented`.
11. In `packages/ui`: `dialog.tsx:64` (`rounded-lg shadow-lg` → `rounded-md shadow-dialog`), `tabs-classes.ts:12,15` (`shadow-sm` → underline tabs, § 4.3).

#### Dependencies on in-flight work
- **15c-2** (BACKLOG: page adoption of the 15c-1 shared pieces: `StatusChip`, `lib/labels`, `ConfirmDialog`…) touches many of the same files. Either land 15c-2 first and then restyle `StatusChip` centrally (§ 4.2), or fold its adoption list into PR 7/8 of § 9. Don't run both on the same files in parallel worktrees.

## 7. Codemods (safe mechanical steps)

Run them per PR, review the diff, and never run them blind across files you don't migrate in that PR.

| # | Find (ripgrep, PCRE2) | Replace | Scope / note |
|---|---|---|---|
| C1 | `rounded-\[14px\] bg-surface (p-[46](?: sm:p-6)?) shadow-card` | `rounded-md border border-line bg-surface $1` | PR 4: **every** page, makes cards visible on the white sheet. Pages are revisited in PR 6+ |
| C2 | `rounded-\[14px\]` (remaining) | `rounded-md` | PR 4 |
| C3 | `rounded-lg bg-muted-surface` | `rounded-md bg-muted-surface` | PR 4 (Band) |
| C4 | `rounded-lg border border-line` | `rounded-md border border-line` | PR 4 (Frame) |
| C5 | `rounded-lg px-\d(?:\.5)? py-[\d.]+ (?:text-sm )?(?:transition-colors )?hover:bg-muted-surface` | review: nav-like item → `rounded-sm` | manual |
| C6 | `text-\[26px\] font-extrabold tracking-tight` | `text-2xl font-semibold tracking-[-0.01em]` | PR 5 [OD-2] |
| C7 | `font-extrabold` (non-wordmark) | `font-semibold` | PR 5 [OD-2]; keep in `wordmark.tsx` |
| C8 | `uppercase tracking-\[0\.08em\]` | *(delete)* + `text-xs font-medium` | PR 5 |
| C9 | `ring-\[3px\] (?:focus-visible:)?ring-ring/50` | `outline-2 outline-offset-2 outline-ring` (with `focus-visible:` prefix) | PR 2 |
| C10 | `'#64748B'` / `"#64748B"` in `.tsx` | `'var(--chart-axis)'` in SVG, `text-muted-ink` in classes | PR 2 |
| C11 | `variant="secondary"` (Button) | `variant="outline"` | PR 3 |
| C12 | `text-\[34px\] font-extrabold text-secondary` | KpiStrip (manual) | PR 6 |

Example (Git Bash, one file at a time):
```bash
rg -l -P 'rounded-\[14px\] bg-surface (p-[46](?: sm:p-6)?) shadow-card' apps/web/src --glob '!*.test.tsx' \
  | xargs sed -i -E 's/rounded-\[14px\] bg-surface (p-[46]( sm:p-6)?) shadow-card/rounded-md border border-line bg-surface \1/g'
```

## 8. Detection commands (run before and after every PR)

```bash
# 0 is the target for each line after the full migration (allowlists noted)
rg -c 'shadow-card'                         apps/web/src packages/ui/src --glob '!*.test.*'
rg -c 'rounded-\[14px\]|rounded-2xl|rounded-xl' apps/web/src packages/ui/src --glob '!*.test.*'
rg -c 'text-\[(2[5-9]|3\d)px\]'             apps/web/src --glob '!*.test.*'          # off-scale sizes
rg -c 'font-extrabold'                      apps/web/src packages/ui/src --glob '!*.test.*' --glob '!**/wordmark.tsx'
rg -c 'uppercase tracking'                  apps/web/src --glob '!*.test.*'
rg -c 'ring-ring/50|ring-\[3px\]'           apps/web/src packages/ui/src --glob '!*.test.*'
rg -n '#[0-9A-Fa-f]{6}\b' apps/web/src --glob '*.tsx' --glob '!*.test.*' --glob '!**/charts/{change-grid,geo-grid,topic-heatmap}.tsx'
rg -n 'bg-amber' apps/web/src --glob '!*.test.*'      # only Friday/assistant, priority and stars may remain
rg -n 'shadow-(sm|md|lg|xl)\b' apps/web/src packages/ui/src --glob '!*.test.*'   # → shadow-overlay/dialog or none
rg -n '<Badge' apps/web/src --glob '!*.test.*'        # → StatusChip/DotStatus/Tag
```
`scripts/design-lint.sh` runs these checks (plus arbitrary `text-[Npx]`). It is now blocking: strict by default (exit 1 if the total is above 0), and `--report` prints the counts and exits 0. Intentional exceptions live in the `ALLOW_<LABEL>` arrays at the top of the script, excluded only from the check they hit; every entry needs a `# reason` line above it. Adding an entry without a reason is a review blocker. It is not in CI or turbo; adding it is the owner's call (D17).

**Per-page checks:** `pnpm --filter @cs/web e2e:affected` (existing) plus an axe run on the page with no serious or critical violations. Visually compare at 1440 and 390 against the storyboard frame named in § 9.

## 9. PR sequence (feed this to `/rm-kickoff` → writing-plans)

Each row is one sub-phase (or task group) with its own review. **Order matters:** PR 4 must land before PR 5, or white cards vanish on the white sheet.

| PR | Goal | Files | Done when | Visual reference |
|---|---|---|---|---|
| 1 | **Tokens** (§ 3), radius trap fix (§ 3.3), contrast test (§ 3.5), `theme.ts` foreground (§ 3.4), `design-lint.sh` (report only) | `packages/ui/src/styles.css`, `theme.ts`, `theme.test.ts`, new `tokens.contrast.test.ts`, button/input/select `rounded-sm` | `pnpm --filter @cs/ui test` green; app renders unchanged except the muted grey, focus ring and input borders | Frame 11 |
| 2 | **Primitives restyle** (§ 4.1, 4.3–4.7) + C9, C10 | `packages/ui/src/components/*` | ui tests green (update class-asserting tests to intent); `test:affected` green | Frames 4, 11 |
| 3 | **New primitives**: `DotStatus`, `FilterChip`, `Tag`, `TierMark`, `Segmented`, `Field`, `Alert`, `Toast` (if missing), `Section`, `Band`, `KpiStrip`, `CitationPill`, `SourcesList`, `TableFrame`; deprecate Button `secondary` (C11) | `packages/ui/src/components/*`, `index.ts` exports | each has a unit test (roles, aria, tone mapping); C11 sweep done | Frames 4, 5, 11 |
| 4 | **Container safety sweep**: C1–C4 across the app; `Card` restyled as Frame | all pages | no `shadow-card` left; e2e affected green; pages still readable on canvas | Frame 5 |
| 5 | **Shell + PageHeader**: § 5.1, § 5.2, C6–C8 | `components/shell/*`, `settings-nav.tsx`, `page-header.tsx` | the sheet renders on every route; sidebar active state per D-04; drill-in settings nav; e2e affected green | Frames 2, 3 |
| 6 | **Overview validation slice**: KpiStrip (C12), Friday summary Band, hairline chart grid, chart tokens (§ 5.4), feed rows, framed scorecard | client Overview page + charts | owner review at 100% zoom and on a phone (**stop here for feedback**) | Frame 8 |
| 7 | **Workspace pages** (Competitors, Changes, Ads, Reviews, Alerts, agency Clients): flush tables, toolbar grammar, filter chips, bulk bar, empty and filtered-empty states | those pages | § 6.2 verdicts applied; acceptance checklist ([08 § 8](08-implementation-guide.md#8-acceptance-criteria-per-page-before-merge)) | Frame 7 |
| 8 | **Detail + settings**: competitor detail (aside 320px), all settings pages to Form archetype (Field, SaveBar, grouped rows, danger zone, branding preview + contrast guard) | detail and settings routes | checklist passes | Frames 6, 9 |
| 9 | **Friday + briefs**: Ask page restyle, CitationPill wiring, SourcesList, docked panel, brief reading view | `components/ask/*`, brief pages | checklist passes | Frame 12 |
| 10 | **Responsive** [OD-5]: drawer < 1024, bottom tabs < 768, bottom sheets | shell + touched components | tested on real devices | Frame 10 |
| 11 | **Lock-in**: make `design-lint.sh` blocking, delete `--shadow-card`, Badge legacy variants, Button `secondary` | — | all detection counts at 0 | — |

## 10. Rules block in `packages/ui/CLAUDE.md`

The block below lives in `packages/ui/CLAUDE.md`, so it loads automatically whenever an agent works in the UI package. Keep the two in sync.

```md
## Design system v1 (binding — owner mandate 2026-10-23; docs/design-system/)
New or changed UI follows it now; existing screens migrate via docs/design-system/09-ai-implementation-playbook.md.
- Until playbook PRs 1–3 land (tokens + primitives), use the nearest existing primitive and never add new `shadow-card`, `rounded-[14px]`, card-in-card or `font-extrabold`; if a page needs a missing primitive, build it per § 4 of the playbook first.
- Tokens only: no hex, `rounded-[…]`, `text-[…px]` or shadow literals in components; add tokens to styles.css.
- Radii: controls `rounded-sm` (6), containers/overlays `rounded-md` (8), badges/tags `rounded-xs` (4); pills only for filter chips, Friday, switch, avatars.
- Shadows: none on static surfaces; `shadow-overlay` for menus/popovers/tooltips/toasts/bars, `shadow-dialog` for dialogs/sheets.
- Containers: Section > Band > Frame (`Card`) > interactive Card; never nest; cards only for independent objects.
- Status: DotStatus (lifecycle), StatusChip + icon (attention), FilterChip (pill), Tag, TierMark — never colour alone.
- Focus: `focus-visible:outline-2 outline-offset-2 outline-ring` (#2A6BAC). Weights 400/500/600 (800 wordmark only). Primary-button label ink.
```
