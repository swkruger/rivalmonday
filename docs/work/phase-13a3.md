# phase-13a3 — Branding addendum: header colour, dark logo, editor preview, tokens everywhere

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13a3   **Base:** main @ 35ca3d84
**Plan/spec:** spec `specs/2026-11-19-phase-13a3-branding-design.md`; plan 13a3a `plans/2026-11-19-phase-13a3a-header-colour.md` (13a3b plan after 13a3a merges).

## Status (overwrite)
13a3a built and final-reviewed 2026-11-19 (Tasks 0-6 + one fix wave, opus final review then clean re-review). Gates green at ba158baf: test:affected (only failure = the final-review bug, fixed), @cs/tools 3072/3072, @cs/web 3465/3465, build, branding-themes E2E 4/4 (full E2E 177/177 ran at T6). 13a3b not started.

## Next (overwrite)
Owner: `pnpm copy:review` (13a3a strings, unsigned), look at the theme screenshots, then go-ahead for `/rm-merge phase-13a3` (merge 13a3a now; 13a3b plan on a fresh branch after) or keep the branch for 13a3b.

## Interfaces this branch adds or changes
- `AgencyBranding.headerColor?` (JSON, no migration); `@cs/email` `Branding.headerColor: string|null`, `BAND_FLOOR`, `passesBandFloor`, `nearestBandShade`, `bandColor`, `deltaE`; PDF cover/summary use `bandColor`.
- `@cs/ui` `themeVars({primary,secondary,headerColor?})`: `--brand-ink = bandColor`, always `--switch-on`, `--chart-rival-1/2` only on a clash (`CHART_RIVAL_FALLBACKS`); `styles.css` `--switch-on`, `--chart-manual`; `--ink-hover` removed.
- `update_agency_branding` input `headerColor` (refusal names the nearest shade); `get_agency_branding` output carries `headerColor` (stored + resolved); web `BRANDING_FIELDS` + `headerColor`.
- `BrandingEditor`: Header colour group (Automatic / picker / Use shade) + "Client page" preview; `AuthCard` white-label 6 px `auth-strip`.
- E2E `branding-themes.spec.ts` (@whitelabel) attaches screenshots.

## Assumes from other branches
13a2 plan says it touches none of `branding-form.tsx`, `settings.ts`, `AgencyBranding`, theme tokens; 13a1/13a2 are merged. Re-check `git branch --no-merged main` at pre-flight.

## Decisions (owner-approved)
2026-11-19 "as recommended": Q1 split 13a3a/13a3b; Q2 dark logo = optional second upload; Q3 one header colour for app/email/PDF; Q4 privacy + site URL in 13a3b; Q5 offer nearest passing shade; Q6 swap the clashing rival chart slot. Details: spec D1-D9.

## New backlog (target → item)
- 13a3b (or next touch): test summary bars use `bandColor`; `CHART_RIVAL_FALLBACKS` swap tests assert ΔE >= 20; failing-shade test asserts the shade passes; E2E auth-strip colour; branding-themes clears `headerColor` between themes explicitly; friendlier refusal label than `headerColor must ...`; clearing the hex box -> back to Automatic.
- Owner: deferred 13a3b scope = dark logo, email header band, privacy URL + site URL (spec 13a3b).

## Test and gate results
- 13a3a final: test:affected @ 384139b2 one failure (get_agency_branding stripped headerColor = final-review Critical, fixed ba158baf); then @cs/tools 3072/3072, @cs/web 3465/3465, build, branding-themes 4/4. Full E2E 177/177 incidentally at T6. Screenshots: `apps/web/test-results` (local, from the E2E run).

## Merge notes
- No migration. New copy strings need owner sign-off (`pnpm copy:review`).
- Rulings: PDF cover/summary use `bandColor` now (not 13a3b); no `PDF_LAYOUT_VERSION` bump; `bandColor` re-checks the floor; #0F766E tested as a secondary, not a header colour.

## Owner verification steps
Screenshots of the client view in default / teal / yellow themes at 1440 and 390; Branding editor preview; a test brief email and PDF cover; sign-in strip on an agency host.

---

# Brief (trimmed after 13a3a; full text in git history 995a38d5)
13a3b remaining scope (spec "13a3b"): dark-surface logo (optional second upload; band, email header, PDF cover; fallback agency name in white), brief/alert email header band in `bandColor`, agency privacy URL + site URL (intake privacy link, `/start/v` CTA; backlog *phase-15c2a*). Site white-label FAQ stays with 17 (*phase-17c*).
