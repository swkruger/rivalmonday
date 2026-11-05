# brand-band Implementation Plan

**Goal:** The client title band, the `ink` button tier and Friday's user bubble take a legible deep shade of the agency's colour; Rival Monday's own look is unchanged.

**Spec:** `docs/superpowers/specs/2026-11-05-brand-band-design.md` (binding, B1–B6).

## Global constraints
- Tokens only (design-lint 0): no hex in components; hex lives in `styles.css` / `theme.ts`.
- `themeVars` outputs stay validated `#rrggbb` (Review Focus 5 of 5a).
- No copy change, no migration, no new setting.
- Edit with the Edit tool (Windows `§` corruption with scripted edits).

## Decisions
Spec B1–B6. Plan-local: the tests pin values for the sample list in spec B2.

## File structure
- `packages/ui/src/theme.ts`, `theme.test.ts`, `tokens.contrast.test.ts`, `styles.css`, `components/button.tsx`, `components/button.test.tsx`, `lib/cn.ts` (only if `bg-brand-ink` gets merged wrongly).
- `apps/web/src/components/ask/bubble-classes.ts` (+ the existing ask-chat test).
- Docs: `docs/design-system/{04-design-decisions,05-design-system-specification,06-component-catalog,09-ai-implementation-playbook}.md`, `design-tokens.json`, `component-examples/rm-tokens.css`.

## Dependencies on in-flight work
`pricing-v2` touches agency billing pages, not `@cs/ui` theme or tokens. None.

## Review focus
1. The floor holds for every possible input (property test), and Rival Monday's default output is byte-identical to today.
2. Nothing neutral (text, toasts, tooltips, BulkBar, FilterChip, tab underline) moved to the brand token.
3. `cn()` keeps `bg-brand-ink` when merged with other `bg-*` classes.

---

### Task 1: Derived brand ink in `@cs/ui`
**Files:** modify `packages/ui/src/theme.ts`, `theme.test.ts`, `tokens.contrast.test.ts`, `styles.css`, `components/button.tsx`, `components/button.test.tsx`.
**Interfaces:** `brandInk(primary: string, secondary: string): string`; `brandInkHover(base: string): string`; `themeVars` adds `'--brand-ink'`, `'--brand-ink-hover'`; `--primary-band-ring` compares against `brandInk`. CSS: `:root` `--brand-ink: #0B2540; --brand-ink-hover: #2D435B;`; `@theme inline` `--color-brand-ink: var(--brand-ink); --color-brand-ink-hover: var(--brand-ink-hover);`; `.rm-ink-band { background: var(--brand-ink); … }`. Button `ink`: `bg-brand-ink font-semibold text-white hover:bg-brand-ink-hover`.
**Behaviour (full code — non-obvious algorithm):**
```ts
const BAND_FLOOR: ReadonlyArray<readonly [string, number]> = [['#FFFFFF', 7], ['#B7C7DA', 4.5], ['#7FC3F0', 4.5]];
const passesFloor = (c: string) => BAND_FLOOR.every(([fg, min]) => contrastRatio(fg, c) >= min);

/** Deep shade of the agency colour for the title band / ink buttons (spec B2). */
export function brandInk(primary: string, secondary: string): string {
  const candidates = [
    [safe(secondary, RIVAL_MONDAY_TOKENS.secondary), RIVAL_MONDAY_TOKENS.secondary],
    [safe(primary, RIVAL_MONDAY_TOKENS.primary), RIVAL_MONDAY_TOKENS.primary],
  ] as const;
  for (const [c, rmDefault] of candidates) {
    if (c.toLowerCase() === rmDefault.toLowerCase()) continue;
    for (let k = 0; k <= 50; k++) {
      const shade = mixHex(c, '#000000', k / 100);
      if (passesFloor(shade)) return shade;
    }
  }
  return RIVAL_MONDAY_TOKENS.ink;
}

/** Hover of a brand-ink fill (spec B3): lighter, white label kept ≥ 4.5:1. */
export function brandInkHover(base: string): string {
  if (base.toLowerCase() === RIVAL_MONDAY_TOKENS.ink.toLowerCase()) return '#2D435B';
  for (let step = 14; step > 0; step--) {
    const c = mixHex(base, '#FFFFFF', step / 100);
    if (contrastRatio('#FFFFFF', c) >= 4.5) return c;
  }
  return base;
}
```
Check `RIVAL_MONDAY_TOKENS.ink` is `#0B2540` (else use the literal); keep `--ink-hover` token for other users.
**Tests (TDD):** `theme.test.ts`: `brandInk RM defaults → #0B2540`, `brandInkHover(#0B2540) → #2D435B`; `teal #0F766E secondary → #0b554f`; `red #C0262D → #921d22`; `yellow #FFD400 secondary + RM primary → #0B2540`; `yellow secondary + teal primary → #0b554f`; `RM secondary + custom violet primary → #5c2baf`; `invalid hex falls back like themeVars`; property: fixed list (spec B2 samples + #000000, #FFFFFF, #111111, #9CA3AF) + 200 seeded random hexes → every output passes the floor, every hover keeps white ≥ 4.5; `themeVars` emits `--brand-ink`/`--brand-ink-hover` and RM branding gives the defaults; `ring falls back to #B7C7DA when primary is within 3:1 of brandInk`. `tokens.contrast.test.ts`: `:root` `--brand-ink` passes the floor. `button.test.tsx`: `ink` uses `bg-brand-ink`, `cn('bg-surface', inkClasses)` keeps `bg-brand-ink`.
**Done when:** `pnpm --filter @cs/ui test`; `pnpm typecheck`; `bash scripts/design-lint.sh`.

### Task 2: Friday bubble + design-system docs
**Files:** modify `apps/web/src/components/ask/bubble-classes.ts` (`bg-ink` → `bg-brand-ink`), `ask-chat.test.tsx` if it pins the class; docs listed in File structure.
**Behaviour:** docs are one-line amendments dated 2026-11-05 citing this spec: D-28/D-30/D-32 colour = `--brand-ink` (derived, spec B2); new token rows `--brand-ink` / `--brand-ink-hover` in 05, `design-tokens.json`, `rm-tokens.css`; catalog `ink` row + PageHeader `tone` + user bubble rows say `bg-brand-ink`; playbook class strings updated. Neutral `bg-ink` users (tooltip, toast, BulkBar, FilterChip, tabs) unchanged.
**Tests:** `pnpm --filter @cs/web exec vitest run src/components/ask src/dev-panel src/components/page-header` green.
**Done when:** those tests + `bash scripts/design-lint.sh` + `pnpm typecheck`.

### Task 3: Verification (controller)
`pnpm test:affected --base main`; `pnpm --filter @cs/web e2e:affected`; gallery shots (`/dev-panel/gallery`, four themes) at 1440/390 to `apps/web/.shots/gallery/`; send to owner.
