# brand-band — agency-tinted title band, ink buttons and Friday bubble

**Kind:** polish   **Worktree:** ../CompetitorSpy-wt/brand-band   **Base:** main @ 2938e58e
**Plan/spec:** `docs/superpowers/plans/2026-11-05-brand-band.md` · `docs/superpowers/specs/2026-11-05-brand-band-design.md`

## Status (overwrite)
Spec + plan written 2026-11-05 from the owner's "option 2" go-ahead; SDD starting.

## Next (overwrite)
Agent: Task 1 (`@cs/ui` brandInk), Task 2 (bubble + DS docs), Task 3 verification; then owner looks at the gallery shots.

## Interfaces this branch adds or changes
- `@cs/ui` `brandInk(primary, secondary)`, `brandInkHover(base)`; `themeVars` adds `--brand-ink`, `--brand-ink-hover`; `--primary-band-ring` now measured against `--brand-ink`.
- Tokens `--brand-ink` / `--brand-ink-hover` (`bg-brand-ink`); `.rm-ink-band`, `Button ink`, `userBubbleClass` use them.
- 13a spec addendum "comprehensive branding" (header-colour override, preview, dark logo, emails/PDF/auth, backlog brand gaps).
- No migration (next free 0097), no copy.

## Assumes from other branches
`pricing-v2`: no overlap (billing pages only; no `@cs/ui` theme/token changes).

## Decisions (owner-approved 2026-11-05: "option 2 … add instructions in 13a")
1. Derive band/ink-button colour from agency branding; no new setting now (spec B1–B6).
2. Comprehensive branding (incl. an optional header-colour override) goes to 13a (spec addendum).
Agent's calls (spec B2/B5): secondary first, primary second, ≤ 50 % darkening else ink; floor white ≥ 7:1 + band muted/link ≥ 4.5:1; Friday user bubble follows; toasts/tooltips/BulkBar/FilterChip/tab underline stay neutral ink.

## New backlog (target -> item)
- 13a -> see 13a spec addendum 2026-11-05.
- 13a -> `--ink-hover` / `--color-ink-hover` now unused (only its contrast test): remove or reuse at 13a.

## Owner verification steps
1. Gallery shots `apps/web/.shots/gallery/` (four themes): band, ink buttons and Friday bubble in each agency colour; Rival Monday theme unchanged.
2. Optional: change an agency's secondary colour in Branding and open a client page.
