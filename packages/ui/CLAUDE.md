# @cs/ui — working notes
Shared shadcn-based React components, theme tokens and styles for the web app.

## Gotchas
- **shadcn's `--accent` is the muted hover/focus surface, not brand amber:** `DropdownMenuItem`/`SelectItem`/outline-`Button` use `accent` for hover and focus, so mapping it to amber would turn every hover amber. `--color-accent` is the muted surface (`#EEF2F6`); brand amber has its own `--color-amber`/`--color-amber-text` tokens (wordmark, Friday badge, brief accents).
- Import branding constants from `@cs/email/branding`, never `@cs/email` (root pulls `node:fs`/`node:crypto` into the browser bundle).
- Per-agency button foreground: components use `--color-primary-foreground`, wired to the runtime `--primary-foreground` (default ink; `themeVars` overrides it from `readableTextOn`). Don't set the colour inline.

## Design system v1 (binding — owner mandate 2026-10-23; docs/design-system/)
New or changed UI follows it now; existing screens migrate via docs/design-system/09-ai-implementation-playbook.md.
- Until playbook PRs 1–3 land (tokens + primitives), use the nearest existing primitive and never add new `shadow-card`, `rounded-[14px]`, card-in-card or `font-extrabold`; if a page needs a missing primitive, build it per § 4 of the playbook first.
- Tokens only: no hex, `rounded-[…]`, `text-[…px]` or shadow literals in components; add tokens to styles.css.
- Radii: controls `rounded-sm` (6), containers/overlays `rounded-md` (8), badges/tags `rounded-xs` (4); pills only for filter chips, Friday, switch, avatars.
- Shadows: none on static surfaces; `shadow-overlay` for menus/popovers/tooltips/toasts/bars, `shadow-dialog` for dialogs/sheets.
- Containers: Section > Band > Frame (`Card`) > interactive Card; never nest; cards only for independent objects.
- Status: DotStatus (lifecycle), StatusChip + icon (attention), FilterChip (pill), Tag, TierMark — never colour alone.
- Focus: `focus-visible:outline-2 outline-offset-2 outline-ring` (#2A6BAC). Weights 400/500/600 (800 wordmark only). Primary-button label ink.

## Phase 16 gotchas
- `cn()` uses `extendTailwindMerge` so custom `text-13`/`text-11` and `shadow-overlay`/`shadow-dialog`/`shadow-card` aren't misread as colours; any new custom theme key used through `cn` needs adding there (`lib/cn.ts`) or it gets silently dropped.
- `Section`: help tips go in `titleAside` (outside the heading — inside changes the heading's accessible name); `labelled` (opt-in) makes it a named region — use it only where a named `<section>` existed (D1), never by default.
- `HairlineGrid` owns the divider rules per `cols` (nth-child); don't put `[&+&]` rules on cells — they break on multi-row grids.
- `segmentedTrackClass`/`segmentedItemClass` give links (`aria-current`) and tabs (`aria-selected`) the Segmented look without changing roles; don't put the track in an `overflow-x-auto` box (clips the outline — use `flex-wrap`).
- Theme: `--primary-hover/-active` are derived per agency in `themeVars` (mix away from the label colour); `--focus` is fixed and never emitted by `themeVars`.
