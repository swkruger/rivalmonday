# phase-13a3 — Branding addendum: header colour, dark logo, editor preview, tokens everywhere

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-13a3   **Base:** main @ 35ca3d84
**Plan/spec:** spec `specs/2026-11-19-phase-13a3-branding-design.md`; plan 13a3a `plans/2026-11-19-phase-13a3a-header-colour.md` (13a3b plan after 13a3a merges).

## Status (overwrite)
Spec + 13a3a plan written 2026-11-19; waiting for owner plan approval.

## Next (overwrite)
Owner approves the 13a3a plan; then SDD Task 0 (pre-flight).

## Interfaces this branch adds or changes
Planned: `AgencyBranding` (`packages/db/src/schema/delivery.ts`, JSON) gains `headerColor?`, a dark-logo URL; `@cs/email` `Branding` gains `headerColor`, `logoDarkUrl`; `themeVars`; `updateAgencyBranding` (`packages/tools/src/settings.ts`). Expected no migration (JSON). Next free migration 0115 if one is needed.

## Assumes from other branches
13a2 plan says it touches none of `branding-form.tsx`, `settings.ts`, `AgencyBranding`, theme tokens; 13a1/13a2 are merged. Re-check `git branch --no-merged main` at pre-flight.

## Decisions (owner-approved)
2026-11-19 "as recommended": Q1 split 13a3a/13a3b; Q2 dark logo = optional second upload; Q3 one header colour for app/email/PDF; Q4 privacy + site URL in 13a3b; Q5 offer nearest passing shade; Q6 swap the clashing rival chart slot. Details: spec D1-D9.

## New backlog (target → item)
None yet.

## Owner verification steps
Screenshots of the client view in default / teal / yellow themes at 1440 and 390; Branding editor preview; a test brief email and PDF cover; sign-in strip on an agency host.

---

# Brief

## 1. Scope (what remains)
Roadmap row 13a3 ("Header colour, dark logo, editor preview, tokens everywhere", ~1 wk, any time, own worktree). Source: 13a addendum 2026-11-05, 7 items. Core spec: §2.2 white-label, §5.1 branding + voice (13a spec builds on them).
**Delivered by 13a1/13a2: none of the addendum.** Grep finds no `headerColor`, no dark logo anywhere. 13a1 = hosts/domains/sender; 13a2 = voice, scrubbing, leak check (their plans list the addendum as "moves to 13a3"). Partly done earlier: `--secondary-foreground` already comes from `readableTextOn` in `themeVars` (`styles.css` still has a literal `:root` default only; verify and close).
To build:
1. **Header colour override.** Optional `headerColor` (`#rrggbb`, nullable) in branding JSON; editor field "Header colour" (default "Automatic"). Accept only if it passes the brand-band floor (white >= 7:1, #B7C7DA and #7FC3F0 >= 4.5:1); else offer nearest passing shade (`mixHex` toward black), agency accepts. `themeVars` uses override else `brandInk()`.
2. **Live preview** in the Branding editor: band with breadcrumb + title, `ink` + primary button, Friday user bubble, segmented tab, in the agency colours, before save.
3. **Dark-surface logo** (optional second logo; band + email header). Fallback = agency name in white, never the light logo on the band.
4. **Close brand gaps:** `--secondary-foreground` via `readableTextOn`; brand-aware chart check (`--you` = secondary vs rival orange #E05A2B; choose fallback series colour); checked Switch contrast on light secondaries; neutral chart alias for the platform costs chart; onboarding Timeline preview `fill-ink` on agency primary. Also `--ink-hover` unused (remove or reuse).
5. **Emails and PDFs:** brief/alert email header band and PDF cover use header colour + dark logo (`@cs/email` branding gets `headerColor`).
6. **Sign-in / auth card** top strip uses header colour (`authBranding()`).
7. **Tests:** property test (any input -> floor holds); leak check unchanged; screenshots in 3 themes at 1440/390. New editor copy via `pnpm copy:review`.

## 2. Already built (reuse)
- `packages/ui/src/theme.ts`: `brandInk`, `brandInkHover`, `themeVars` (`--brand-ink`, `--brand-ink-hover`, `--primary-band-ring`, `--secondary-foreground`); re-exports `contrastRatio`, `mixHex`, `readableTextOn` from `packages/email/src/branding.ts` (also `RIVAL_MONDAY_TOKENS`, `Branding`, `resolveBranding`, `brandInk` source). Tests: `theme.test.ts`, `tokens.contrast.test.ts`.
- `packages/ui/src/styles.css`: `:root` defaults, `--you: var(--secondary)`, `.rm-ink-band`, `bg-brand-ink`.
- Band/bubble/buttons: `apps/web/src/components/page-header.tsx` (`tone="ink"`), `components/ask/bubble-classes.ts`, `Button variant="ink"`.
- Branding page: `apps/web/src/app/(app)/agency/settings/branding/` (`page.tsx`, `branding-form.tsx`, `actions.ts`, `logo/route.ts`); tool `updateAgencyBranding` + `updateAgencyBrandingTool` (`packages/tools/src/settings.ts`, `tools/settings.ts`; `brandingProblems`, `clean`).
- Storage/auth: `AgencyBranding` JSON (`packages/db/src/schema/delivery.ts`), `rehostLogoUrl`, `clientOriginFor`; `components/auth-card.tsx`, `authBranding()`, `white-label-leak.test.tsx`.
- Email/PDF: `packages/email/src/templates/report-cover.tsx`, `report/summary.tsx`, `brief.tsx`, `alert.tsx`.

## 3. Binding decisions (never reopen)
- Brand-band B1-B6: derived `--brand-ink`, floor rule, 50 % cap, fallback ink #0B2540; RM defaults unchanged on platform zone; stays neutral ink: `text-ink`, toasts, tooltips, BulkBar, pressed FilterChip, tab underlines, chart ink.
- App style: opt-in `@cs/ui` variants; `ink` primary on agency pages, agency primary on client pages; orange only Friday / priority bar / `NumberMarker`; fixed chip tints; ink title band on client pages; raised cards only on recommendations board; `--brand-ink` header override planned here (13a).
- Brand: wordmark `rivalmonday`; palette (#47A8E7 / #2A6BAC / #F5A524 / #0B2540 / #F6F9FC / #EEF2F6), Inter, max 1560 px; favicon = mark on ink tile on platform host only.
- Design system v1: white sheet in canvas frame, shadows on floating layers only, chart roles you #2A6BAC + <= 2 rivals + grey; charts inline SVG, colours checked with the dataviz skill; 36 px controls.
- Hosts 13a1: agency host or custom domain; client email never a Rival Monday domain. Leaks 13a2: no client surface names the platform (`PLATFORM_BRAND_RE`, crawl classifies every route); agency hosts `/agency*` 404.

## 4. Backlog to fold in (verbatim)
- [ ] 13a3: agency privacy URL and agency site URL in branding (agency `/start/v` CTA link, intake privacy link) — *phase-15c2a*
- [ ] 13a: brand-aware chart check (`--you` = agency secondary may clash with rival orange #E05A2B); neutral chart-series alias for the platform costs chart (manual series borrows `--chart-rival-2`); checked Switch `bg-secondary` + white thumb (~1.4:1 on #FFD400) — *phase-16*  (BACKLOG line 225, text truncated at "on #FFD400")
- [ ] 13a: comprehensive branding per the 13a spec addendum 2026-11-05 (header-colour override, editor preview of band/buttons/bubble, dark logo, emails/PDF/auth strip); `--ink-hover` now unused (remove or reuse) — *brand-band*
- [ ] 13a: when white-label (own domain, email) ships, update the site's white-label FAQ, partners page and RM compare cells — *phase-17c*  (apps/site; likely 17-owned, not this phase)
Other "Phase 13a follow-ups" items (13a1/13a2 leftovers) are not branding; take only if touched (e.g. `/start/v/[leadId]` crawl class, relevant to the privacy/site URL work).

## 5. In-flight workstreams
`git branch --no-merged main`: only `phase-13a3`. Worktrees: main, phase-13a3, `staging-worker` (detached, ignore). Next migration 0115 (latest 0114_voice_review). 13a2 plan states it does not touch branding-form, `settings.ts`, `AgencyBranding`, theme tokens, so no conflict expected.

## 6. Open questions
1. Split into sub-phases? (a) one phase ~1 wk; (b) 13a3a core (header colour, preview, tokens, auth strip, tests) + 13a3b (dark logo, email/PDF, privacy/site URLs); (c) three. Rec: (b).
2. Dark logo: second upload, or auto-derive? (a) second optional upload, fallback white name; (b) white-recolour automatically; (c) none. Rec: (a).
3. Header colour for emails/PDF: same colour as app? (a) same, one setting; (b) separate email colour. Rec: (a).
4. Privacy URL and agency site URL: in scope here? (a) yes, add two optional https fields to branding; (b) defer. Rec: (a), small and tagged 13a3.
5. Unfloored colour: (a) show nearest passing shade, agency accepts; (b) hard reject; (c) apply with warning. Rec: (a), per addendum.
6. Chart clash (`--you` vs rival orange): (a) swap the rival slot to a fallback when contrast/distance fails; (b) never reuse agency colour in charts. Rec: (a).
