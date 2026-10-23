# @cs/ui — working notes
Shared shadcn-based React components, theme tokens and styles for the web app.

## Gotchas
- **shadcn's `--accent` is the muted hover/focus surface, not brand amber:** `DropdownMenuItem`/`SelectItem`/outline-`Button` use `accent` for hover and focus, so mapping it to amber would turn every hover amber. `--color-accent` is the muted surface (`#EEF2F6`); brand amber has its own `--color-amber`/`--color-amber-text` tokens (wordmark, Friday badge, brief accents).
- Import branding constants from `@cs/email/branding`, never `@cs/email` (root pulls `node:fs`/`node:crypto` into the browser bundle).

## Design system v1 (binding — owner mandate 2026-10-23; docs/design-system/)
New or changed UI follows it now; existing screens migrate via docs/design-system/09-ai-implementation-playbook.md.
- Until playbook PRs 1–3 land (tokens + primitives), use the nearest existing primitive and never add new `shadow-card`, `rounded-[14px]`, card-in-card or `font-extrabold`; if a page needs a missing primitive, build it per § 4 of the playbook first.
- Tokens only: no hex, `rounded-[…]`, `text-[…px]` or shadow literals in components; add tokens to styles.css.
- Radii: controls `rounded-sm` (6), containers/overlays `rounded-md` (8), badges/tags `rounded-xs` (4); pills only for filter chips, Friday, switch, avatars.
- Shadows: none on static surfaces; `shadow-overlay` for menus/popovers/tooltips/toasts/bars, `shadow-dialog` for dialogs/sheets.
- Containers: Section > Band > Frame (`Card`) > interactive Card; never nest; cards only for independent objects.
- Status: DotStatus (lifecycle), StatusChip + icon (attention), FilterChip (pill), Tag, TierMark — never colour alone.
- Focus: `focus-visible:outline-2 outline-offset-2 outline-ring` (#2A6BAC). Weights 400/500/600 (800 wordmark only). Primary-button label ink.
