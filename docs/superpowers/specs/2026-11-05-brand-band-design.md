# brand-band — agency-tinted title band and ink buttons

**Date:** 2026-11-05 · **Owner decision:** "option 2" (derive from agency branding, no new setting; comprehensive branding goes to 13a).
**Amends:** app-style spec (`2026-11-04-app-style-design.md`) D-28 / D-30 / D-32 colour only; layout and usage rules unchanged.

## Why
app-style painted the client title band, the `ink` button tier and Friday's user bubble with the fixed `--ink` (#0B2540) for every agency. In a white-label product those surfaces should carry the agency's colour without ever losing legibility.

## Decisions
- **B1 — one derived token.** `themeVars` emits `--brand-ink` and `--brand-ink-hover` per agency. `:root` defaults are today's `#0B2540` / `#2D435B`, so Rival Monday (platform zone, defaults, `/bot`) looks exactly as now.
- **B2 — derivation rule** (`brandInk(primary, secondary)` in `@cs/ui` `theme.ts`):
  1. Candidates in order: agency `secondary`, then agency `primary`. A candidate equal (case-insensitive) to the Rival Monday default for its slot (#2A6BAC / #47A8E7) is skipped.
  2. For a candidate, try `mixHex(candidate, '#000000', k / 100)` for k = 0..50 (1 % steps) and take the first that passes the **floor**: white ≥ 7:1, `--on-ink-muted` #B7C7DA ≥ 4.5:1, `--on-ink-link` #7FC3F0 ≥ 4.5:1.
  3. First candidate that passes wins; if none passes within 50 %, return `#0B2540`.
  Why 50 %: light/warm brands (yellow #FFD400, amber #F5A524, grey) need 54–65 % and turn muddy olive/brown; they fall back to the agency primary or to ink. Sample results: teal #0F766E → #0b554f, violet #7C3AED → #5c2baf, red #C0262D → #921d22, green #16A34A → #0c5627, rust #E05A2B → #803319.
- **B3 — hover.** `brandInkHover(base)`: `#2D435B` when base is `#0B2540`; otherwise `mixHex(base, '#FFFFFF', 0.14)`, stepping back 1 % at a time while white text would drop below 4.5:1.
- **B4 — ring.** `--primary-band-ring` = primary when `contrastRatio(primary, brandInk) ≥ 3`, else #B7C7DA (was: against fixed ink).
- **B5 — what follows the brand:** `.rm-ink-band` background, `Button variant="ink"` (bg + hover), Friday `userBubbleClass`. **What stays neutral ink:** all `text-ink`, toasts, tooltips, `BulkBar`, pressed `FilterChip`, tab underlines, chart ink. These are system chrome / text, not brand surfaces.
- **B6 — no new setting, no migration, no copy.** The branding editor preview gets the new vars but does not yet show a band, `ink` button or user bubble (13a addendum item 2); an explicit header-colour override and the wider branding work are recorded in the 13a spec addendum.

## Interfaces
- `@cs/ui` `theme.ts`: `export function brandInk(primary: string, secondary: string): string`, `export function brandInkHover(base: string): string` (inputs validated `#rrggbb`; outputs lower-case `#rrggbb` except the two literal defaults); `themeVars` adds `'--brand-ink'`, `'--brand-ink-hover'`.
- `styles.css`: `:root { --brand-ink: #0B2540; --brand-ink-hover: #2D435B; }`, `@theme` `--color-brand-ink`, `--color-brand-ink-hover` (classes `bg-brand-ink`, `hover:bg-brand-ink-hover`).
- Design-system docs: token rows (05, `design-tokens.json`, `rm-tokens.css`), D-28/D-30/D-32 one-line amendments (04), catalog rows (06), playbook classes (09).

## Tests
Property test over a fixed list of brand colours plus 200 seeded random hexes: every `brandInk` output passes the floor and every hover keeps white ≥ 4.5:1; RM defaults → exact `#0B2540` / `#2D435B`; yellow secondary + default primary → `#0B2540`; yellow secondary + teal primary → teal-derived; `themeVars` emits both vars; ring falls back when primary is too close to the band.
