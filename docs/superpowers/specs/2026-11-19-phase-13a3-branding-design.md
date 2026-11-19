# Phase 13a3 — branding addendum (header colour, preview, dark logo, tokens everywhere)

**Date:** 2026-11-19 · **Implements:** 13a spec addendum 2026-11-05 (items 1–7) · **Builds on:** brand-band spec `2026-11-05-brand-band-design.md` (B1–B6, still binding) · core spec §2.2, §5.1.
**Owner answers (2026-11-19, "as recommended"):** Q1 split into 13a3a + 13a3b; Q2 dark logo = optional second upload; Q3 one header colour for app, emails and PDF; Q4 privacy + site URL in scope (13a3b); Q5 unfloored colour → offer nearest passing shade; Q6 chart clash → swap the rival slot.

## Split
- **13a3a (this plan):** header colour override (data, validation, `themeVars`, editor field), live preview, brand gaps (chart clash, Switch, costs alias, Timeline, `--ink-hover`, `--secondary-foreground` verify), auth-card strip, PDF band follows the header colour (one helper swap), tests + 3-theme screenshots.
- **13a3b (next plan, same spec):** dark-surface logo (upload, band, email header, PDF cover), email header band in brief/alert templates, agency privacy URL + site URL (intake privacy link, `/start/v` CTA), site FAQ item stays with 17.

## Decisions
- **D1 — `headerColor` storage.** `AgencyBranding.headerColor?: string` (JSON, no migration). Absent = "Automatic" (brand-band B2 derivation). Stored only when it is `#rrggbb` **and** passes the band floor; `update_agency_branding` refuses anything else with `headerColor must pass the contrast check; try <shade>`.
- **D2 — floor and nearest shade.** Floor = B2's (white ≥ 7:1, #B7C7DA ≥ 4.5:1, #7FC3F0 ≥ 4.5:1). `nearestBandShade(hex)` = first `mixHex(hex, '#000000', k/100)` for k = 0..100 that passes (always terminates: black passes). No 50 % cap: the agency picked the hue and sees the result before accepting.
- **D3 — one band colour.** `bandColor(b: Branding) = b.headerColor ?? brandInk(b.primary, b.secondary)`. Every consumer of the band colour uses it: `themeVars` `--brand-ink` (band, `ink` buttons, Friday user bubble, hover/ring derive from it as today), PDF cover band and the report summary bars (`report-cover.tsx`, `report/summary.tsx`), the auth strip (D7), 13a3b's email header. `resolveBranding` returns `headerColor: string | null` (null unless valid + floor-passing — a stale stored value never reaches a style).
- **D4 — editor field.** "Header colour" sits after Secondary colour: a checkbox "Automatic" (checked when unset) and, unchecked, the same colour picker + hex input. When the typed colour fails, a note reads "White text is hard to read on this colour." with a button "Use {shade}" that sets the nearest shade. Save is refused server-side for a failing colour (the button is the only path to an adjusted value). Unchecking starts from the current automatic colour.
- **D5 — preview.** The editor's preview frame gains a "Client page" block above "Dashboard": the band (`rm-ink-band`) with breadcrumb "Clients / Cool Breeze" and title "Overview", an `ink` button "Approve" and a primary button "View brief" on the white sheet, a Friday user bubble ("What changed this week?") using `userBubbleClass`, and a `Segmented` control (Week / Month) — all real `@cs/ui` components under the draft's `themeVars`. Values go through `resolveBranding` + `themeVars` only (Review Focus 5 rule unchanged).
- **D6 — brand gaps.**
  - Chart clash: `themeVars` emits `--chart-rival-1` / `--chart-rival-2` only when the default slot is too close to `--you` (= secondary): CIE76 ΔE (Lab, D65) < 20 → that slot takes the first colour from `CHART_RIVAL_FALLBACKS` that is ≥ 20 from secondary and from the other rival slot. The fallback list is picked and checked with the dataviz skill validator at implementation (≥ 3:1 on white, CVD-distinguishable from the defaults); defaults stay #E05A2B / #14936A.
  - Switch: checked track uses `--switch-on` = secondary when white ≥ 3:1 on it, else `bandColor`. `:root` default `var(--secondary)`.
  - Platform costs: new fixed token `--chart-manual: #14936A` (never swapped); `MANUAL_COLOR` uses it.
  - Timeline preview: the "1" on the `fill-primary` circle uses `fill-primary-foreground`.
  - `--ink-hover` / `--color-ink-hover`: removed (unused since brand-band) from `styles.css` and the design-system token files.
  - `--secondary-foreground`: already `readableTextOn(secondary)` in `themeVars`; verify, close the backlog line.
- **D7 — auth strip.** White-label `AuthCard` (agency branding, not Rival Monday, not neutral null) renders a 6 px full-width top strip in `bandColor`. Neutral and Rival Monday auth pages unchanged.
- **D8 — what stays.** B5 neutral-ink list unchanged; accent never overridable; platform zone and `/bot` keep Rival Monday defaults; leak tests unchanged.
- **D9 — copy.** New strings: field label "Header colour", checkbox "Automatic", note "White text is hard to read on this colour.", button "Use {shade}", hint "Used for the title band on client pages, dark buttons, the assistant's chat bubbles, sign-in pages and the report cover.", tip key `agency.settings.branding.header`, refusal text in D1; branding guide (`docs/help/pages/agency.settings.branding.agency.md`) gains a "Header colour" paragraph. All via `pnpm copy:review`.

## Interfaces (13a3a)
- `@cs/db` `AgencyBranding`: `headerColor?: string`.
- `@cs/email/branding`: `passesBandFloor(hex: string): boolean`, `nearestBandShade(hex: string): string`, `bandColor(b: Pick<Branding,'primary'|'secondary'|'headerColor'>): string`, `deltaE(a: string, b: string): number`; `Branding.headerColor: string | null`.
- `@cs/ui` `theme.ts`: re-exports the above; `themeVars(b: Pick<Branding,'primary'|'secondary'> & { headerColor?: string | null })` adds `--switch-on`, conditional `--chart-rival-1`/`--chart-rival-2`; `CHART_RIVAL_FALLBACKS: readonly string[]`.
- `styles.css`: `--switch-on`, `--chart-manual` (+ `@theme` colours); `--ink-hover` removed.
- Tool `update_agency_branding` input + `headerColor: text(20)`; `LIMITS.headerColor = 7`; web `BRANDING_FIELDS` + `headerColor`.

## Interfaces (13a3b, planned)
- `AgencyBranding.logoDarkUrl?: string`, `privacyUrl?: string`, `siteUrl?: string` (https only; logo routes reuse `rehostLogoUrl`); `Branding.logoDarkUrl`, `privacyUrl`, `siteUrl`; logo upload route `?variant=dark`.

## Tests
- Property: fixed brand list + 200 seeded random hexes as `headerColor` and as primary/secondary → `bandColor` always passes the floor; `nearestBandShade` always passes and equals the input when it already passes; invalid/failing stored `headerColor` resolves to null.
- `themeVars`: override wins over derivation; chart swap triggers for an orange secondary (#E8602C) and a green secondary (#12905F), not for defaults; `--switch-on` falls back for #FFD400.
- Tool: refuses a failing colour with the shade in the message; stores a passing one; empty clears.
- Editor: Automatic toggle, "Use shade" button, preview band uses the override.
- E2E: three agency themes (default, teal #0F766E, yellow #FFD400) set by seed, client page at 1440 and 390: band background = expected `bandColor`; screenshots attached to the report.
