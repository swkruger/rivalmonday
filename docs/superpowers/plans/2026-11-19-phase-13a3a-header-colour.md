# Phase 13a3a — header colour, live preview, brand gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`).

**Goal:** agencies can set a contrast-checked header colour that drives every band surface (client title band, `ink` buttons, Friday bubble, auth strip, PDF cover), see it in a live preview, and the remaining brand-token gaps are closed.
**Spec:** `docs/superpowers/specs/2026-11-19-phase-13a3-branding-design.md` (D1–D9) + brand-band spec B1–B6.
**Tech:** TypeScript, Next.js App Router, Tailwind v4 tokens in `packages/ui/src/styles.css`, vitest, Playwright.

## Global constraints
- Floor = white ≥ 7:1, #B7C7DA ≥ 4.5:1, #7FC3F0 ≥ 4.5:1 (one `BAND_FLOOR` constant in `packages/email/src/branding.ts`; never duplicated).
- Nothing unvalidated reaches a `style`: every colour goes through `resolveBranding` / `themeVars` (6-digit hex).
- Accent #F5A524 never overridable; platform zone and `/bot` keep Rival Monday defaults; B5 neutral-ink list unchanged.
- No migration (branding is JSON). No new tool (extends `update_agency_branding`).
- New user-facing strings exactly as spec D9; registered for `pnpm copy:review` the way 13a2 registered its Voice strings.
- Read `docs/gotchas-cross-cutting.md` and `packages/ui/CLAUDE.md`, `packages/email/CLAUDE.md`, `apps/web/CLAUDE.md`, `packages/tools/CLAUDE.md` (where they exist) before coding. LF only. Commit trailer: `Co-Authored-By: <your model> <noreply@anthropic.com>`.

## Decisions
Spec D1–D9. Ruling (controller): PDF cover/summary switch to `bandColor` here (one-line swap each) so app and PDF never disagree; the email header band and dark logo stay 13a3b.

## File structure
- `packages/email/src/branding.ts` — floor helpers, `bandColor`, `deltaE`, `Branding.headerColor`.
- `packages/db/src/schema/delivery.ts` — `AgencyBranding.headerColor`.
- `packages/ui/src/theme.ts`, `styles.css`, `components/switch.tsx` — tokens.
- `packages/tools/src/settings.ts`, `tools/settings.ts`; `apps/web/src/server/forms.ts` — save path.
- `apps/web/src/components/agency/branding-editor.tsx` — field + preview.
- `apps/web/src/components/auth-card.tsx` — strip.
- `apps/web/e2e/branding-themes.spec.ts` — 3-theme check + screenshots.

## Dependencies on in-flight work
None (no other unmerged branch at 2026-11-19). Re-check at Task 0.

## Review focus
1. A stored `headerColor` that later fails (hand-edited JSON, floor change) must resolve to null → automatic, never an unreadable band.
2. Onboarding wizard reuses `BrandingEditor`: the new field must work there and in read-only support sessions (fieldset disabled).
3. Saving the form without touching the header field must not wipe a stored `headerColor` set elsewhere — the hidden input always carries the draft value; "Automatic" sends empty → cleared (intended).
4. Chart swap must not change the default theme's colours (snapshot of `themeVars(RIVAL_MONDAY_TOKENS)` keys/values unchanged except the new `--switch-on`).
5. Mobile 390 px: the editor's preview stacks under the form and the new band block does not overflow.

---

### Task 0: Pre-flight
- `git fetch && git rebase main` in the worktree; `git branch --no-merged main` shows only `phase-13a3`.
- Confirm the symbols above exist as described (`brandInk`, `themeVars`, `LIMITS`, `BRANDING_FIELDS`, `MANUAL_COLOR`, Switch `aria-checked:bg-secondary`, `--ink-hover` unused outside `styles.css` / design-system token files). Fix this plan if not; ledger the ruling.
- **Done when:** ledger has the pre-flight table.

### Task 1: Band colour core
**Files:** modify `packages/email/src/branding.ts`, `packages/email/src/branding.test.ts`, `packages/db/src/schema/delivery.ts`, `packages/email/src/templates/report-cover.tsx`, `packages/email/src/templates/report/summary.tsx`.
**Interfaces (binding):**
```ts
export function passesBandFloor(hex: string): boolean;          // false for non-#rrggbb
export function nearestBandShade(hex: string): string;          // k = 0..100 toward #000000; lower-case #rrggbb; input must be #rrggbb
export function bandColor(b: Pick<Branding, 'primary' | 'secondary' | 'headerColor'>): string; // headerColor ?? brandInk(primary, secondary)
export function deltaE(a: string, b: string): number;           // CIE76 in Lab (D65, sRGB)
// Branding gains: headerColor: string | null
// AgencyBranding gains: headerColor?: string
```
**Behaviour:** `resolveBranding` sets `headerColor` to the stored value only if `passesBandFloor`, else null. `brandInk` reuses `passesBandFloor` (no second floor). Report cover + summary bars call `bandColor(b)`. `bandColor` tolerates `headerColor` undefined (older callers).
**Tests (first):** `nearestBandShade` returns input unchanged for #0b554f; returns a passing shade for #FFD400, #47A8E7, #FFFFFF; property over fixed list (#0F766E, #7C3AED, #C0262D, #16A34A, #E05A2B, #FFD400, #F5A524, #9CA3AF, #FFFFFF, #000000) + 200 seeded random hexes: `passesBandFloor(nearestBandShade(x))` and `passesBandFloor(bandColor({primary:x, secondary:y, headerColor:null}))`; `resolveBranding` drops `headerColor: '#FFD400'` and `'red'`, keeps `'#0b554f'`; `deltaE('#000000','#FFFFFF')` ≈ 100 (±0.5), `deltaE(x,x) === 0`; report cover test renders the header colour when set.
**Done when:** `pnpm --filter @cs/email test`, `pnpm --filter @cs/db typecheck`, `pnpm --filter @cs/email typecheck`.

### Task 2: Theme tokens and brand gaps
**Files:** modify `packages/ui/src/theme.ts`, `theme.test.ts`, `styles.css`, `components/switch.tsx`, design-system token files that list `--ink-hover` (`docs/design-system/` `design-tokens.json`, `rm-tokens.css`, 05 token table), `apps/web/src/app/(platform)/platform/costs/_components/monthly-chart.tsx` (+ its test), `apps/web/src/components/onboarding/previews/timeline.tsx`.
**Interfaces:** `themeVars(b: Pick<Branding,'primary'|'secondary'> & { headerColor?: string | null })`; `--brand-ink` = `bandColor`; new keys `--switch-on` (always), `--chart-rival-1` / `--chart-rival-2` (only when swapped); `export const CHART_RIVAL_FALLBACKS: readonly string[]` (2–4 colours). `styles.css`: `:root { --switch-on: var(--secondary); --chart-manual: #14936A; }`, `@theme` `--color-switch-on`, `--color-chart-manual`; remove `--ink-hover`, `--color-ink-hover`. Switch: `aria-checked:bg-switch-on`. `MANUAL_COLOR = 'var(--chart-manual)'`. Timeline "1" → `fill-primary-foreground`.
**Behaviour:** swap rule per spec D6 (ΔE < 20 against secondary; fallback ≥ 20 from secondary and the other slot; if none qualifies keep default). `--switch-on` = secondary if `contrastRatio('#FFFFFF', secondary) >= 3` else `bandColor`. **Pick `CHART_RIVAL_FALLBACKS` with the dataviz skill's validator** (≥ 3:1 on white #FFFFFF, CVD-distinguishable from #2A6BAC, #E05A2B, #14936A and #A3B1C2); write the validator numbers in a code comment as `monthly-chart.tsx` does.
**Tests (first):** default theme snapshot = today's map + `--switch-on: '#2A6BAC'`, no rival keys; headerColor `#0b554f` → `--brand-ink: '#0b554f'`; orange secondary `#E8602C` → `--chart-rival-1` ∈ fallbacks; green secondary `#12905F` → `--chart-rival-2` ∈ fallbacks; yellow secondary `#FFD400` → `--switch-on` = brand ink; costs test expects `var(--chart-manual)`; grep test or assertion that `--ink-hover` is gone from `styles.css`.
**Done when:** `pnpm --filter @cs/ui test`, `pnpm --filter @cs/web exec vitest run src/app/\(platform\)/platform/costs src/components/onboarding`, `pnpm typecheck`.

### Task 3: Save path
**Files:** modify `packages/tools/src/settings.ts` (+ test), `packages/tools/src/tools/settings.ts`, `apps/web/src/server/forms.ts` (+ test).
**Interfaces:** `LIMITS.headerColor = 7`; tool input `headerColor: text(20)`; `BRANDING_FIELDS` + `'headerColor'`.
**Behaviour:** `brandingProblems`: non-hex → `headerColor must be a colour like #0B2540`; hex failing floor → `headerColor must pass the contrast check; try ${nearestBandShade(v)}`. Empty → not stored (Automatic). Launch-gate parity snapshot updated if it lists tool inputs.
**Tests (first):** refuses `#FFD400` with the shade in the message; stores `#0b554f`; omitted/empty → stored JSON has no `headerColor`; `parseBrandingForm` reads `headerColor`.
**Done when:** `pnpm --filter @cs/tools exec vitest run src/settings` + parity test, `pnpm --filter @cs/web exec vitest run src/server/forms`.

### Task 4: Editor field, live preview, copy
**Files:** modify `apps/web/src/components/agency/branding-editor.tsx` (+ test), `apps/web/src/app/(app)/agency/settings/branding/page.tsx` (TipRow item "Header colour"), help copy (`apps/web/src/help/copy/agency.ts` tip `agency.settings.branding.header`), `docs/help/pages/agency.settings.branding.agency.md`, copy ledger registration per 13a2's pattern.
**Behaviour:** spec D4 + D5 exactly. Hidden input `headerColor` = draft value ('' when Automatic). Preview block "Client page" uses `rm-ink-band` with real `Breadcrumb`, `Button variant="ink"`, `Button` (primary), a div with `userBubbleClass`, `Segmented` (Week/Month, local state), all inside the existing `Frame style={vars}`; `vars = themeVars(resolved)` now includes the header colour. Labels/notes are spec D9 strings verbatim. Wizard and read-only modes behave as today.
**Tests (first):** Automatic checked by default and hidden input empty; unchecking shows picker prefilled with `brandInk(primary, secondary)`; typing `#FFD400` shows the note and "Use #…" button, clicking sets the shade; preview `.rm-ink-band` style var `--brand-ink` equals the override; read-only disables the field; `terminology.test.ts` / help-copy tests green.
**Done when:** `pnpm --filter @cs/web exec vitest run src/components/agency src/help src/terminology.test.ts`, `pnpm copy:status` lists the new strings as unsigned.

### Task 5: Auth strip
**Files:** modify `apps/web/src/components/auth-card.tsx` (+ test, `white-label-leak.test.tsx` stays green).
**Behaviour:** white-label only (D7): `<div data-slot="auth-strip" aria-hidden className="h-1.5 w-full bg-brand-ink" />` as the first child of `<main>` (main padding adjusted so the strip is flush top). Neutral (`branding: null`) and Rival Monday: no strip.
**Tests (first):** agency branding → strip present and `--brand-ink` in the main style equals `bandColor`; null and Rival Monday → absent.
**Done when:** `pnpm --filter @cs/web exec vitest run src/components/auth-card src/components/white-label-leak`.

### Task 6: Three-theme E2E + screenshots
**Files:** create `apps/web/e2e/branding-themes.spec.ts`; seed helper in `apps/web/e2e/seed.ts` if needed. **Follow pattern:** `white-label.spec.ts`.
**Behaviour:** for themes default, teal (secondary #0F766E), yellow (secondary #FFD400, headerColor unset) and one override (headerColor #5c2baf): set the agency's branding, open a client page as agency admin at 1440×900 and 390×844; assert `.rm-ink-band` computed `background-color` = `bandColor` (rgb); attach full-page screenshots via `testInfo.attach`. Restore branding after.
**Done when:** `pnpm --filter @cs/web e2e -- branding-themes` green (one E2E run at a time on this worktree's DB).
