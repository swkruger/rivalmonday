# site-audiences — two audience sides on rivalmonday.com plus the approved site review

**Kind:** implementation (site only)   **Worktree:** ../CompetitorSpy-wt/site-audiences   **Base:** main @ 843cfbac
**Spec:** `docs/superpowers/specs/2026-11-10-site-audiences-design.md` + copy deck `2026-11-10-site-audiences-copy.md`
**Plans:** `docs/superpowers/plans/2026-11-10-site-audiences-a-still-site.md` (A, 9 tasks) then `…-b-two-sides.md` (B, 13 tasks)

## Status (overwrite)
2026-11-10: both plans owner-approved. **SDD running:** Plan A Tasks 0-8 implemented, gates run (see measurements below); Plan B Task 0 done, Tasks 1-12 running. Task progress and rulings are in the SDD ledgers `.superpowers/sdd/2026-11-10-site-audiences-a-still-site/progress.md` and `…-b-two-sides/progress.md`. `sharp` not yet added (Plan B Task 2). Own test DB `cs_site_audiences_test`.

## Next (overwrite)
1. SDD: Plan B Tasks 1-12 (site E2E once at Task 12), then the whole-branch review on the top model and one fix wave.
2. Re-measure the `/` and `/agencies` phone LCP at Plan B Task 12 (see measurements).
3. Owner: `pnpm copy:review` for all new and changed lines; then `/rm-merge` on the owner's go-ahead.

## Plan A Task 0 notes (2026-11-10)
- Baseline before Task 1: `typecheck` clean, `@cs/site` unit tests 55 files / 373 tests green, `design-lint` total 0. Branch 0 behind `main`; `phase-18b` touches none of `apps/site`, `scripts/design-lint.sh`, `packages/copy-review`.
- Users, so implementers do not grep again: `Reveal` → client-view, checks-diagram, close-band, sample-section, steps. `useCountUp` → dashboard-mock. `useInView` → ad-activity-chart, dashboard-mock, rank-grid. `draw-line` → ad-activity-chart. `grow-bar` → dashboard-mock. `grow-col` → `site.css` only. `live-ping` → section-heading (`ping` prop; one caller, live-counters). `flow-dash` → checks-diagram. `scan-blip`/`scan-sweep` → scan-frame (`blip` prop callers: friday-row, guides/guide-articles). `radar-sweep`/`radar-blip` → hero. `setInterval` → announcement-bar (rotation, goes) and sample/friday-panel (typing after a question, stays). `autoplay`/`autoplayMap` → rank-grid, sample-brief, sample-section, `app/page.tsx`, one e2e step. `opportunityLine`, `PRICING_LINES` → `content/home.ts`, `content.test.ts`, opportunity / commercial, `story.test.tsx`, `sections.test.tsx`. `subNoWeb` → `home.ts`, `content.test.ts`, hero, `hero.test.tsx`. `CAST`, `BEFORE_AFTER` → `home.ts`, their components, `content.test.ts`, `story.test.tsx`.
- Allowed motion exceptions: none. The only `animate-*` class is `animate-pulse` in checks-diagram, which Task 1 removes.
- `public/sample/home-counter.webp` stays: a guide (`content/guides.ts`) shows it. Task 4 removes only the home page's use.
- `site.css` has six `infinite` animations and eight keyframes today; after Tasks 1 and 3 only `reveal-quick`, `sheet-in-right`, `sheet-in-bottom` remain.

## Plan A Task 8 measurements (2026-11-10)
- Home page at 1440 px: 11,441 px tall (test limit 11,500; target 10,300 not reached). Sections: hero 863, rival-story 940, ceiling 592, opportunity 730, client-view 2,179, recommendations 1,028, friday 567, checks 891, live 445, how-it-works 850, commercial 1,242, join 621.
- `#friday` 567 px (spec ~570). `#commercial` 1,242 px against the spec's ~930: column gap 88 px, plan line 768 px wide. Both go to the whole-branch review.
- Phone vitals: `/` LCP 2,252 to 2,592 ms over five runs (budget 2,500; 2 of 5 over), CLS 0; `/pricing` ~1,500 ms; `/compare` ~1,600 ms. Not compared with `main` in this run. Re-measure after Plan B changes `/`.
- 320 px: the recommendation board made the page 335 px wide (the board is unchanged from `main`); fixed with `min-w-0` on the lanes (`a7cbaa3c`).
- `check:placeholders` still lists the 3 owner placeholders `main` has (`content/founder.ts`, `privacy.md`, `terms.md`): a deploy gate, not changed here.

## Plan B Task 0 notes (2026-11-10)
- Branch 0 behind `main` (no rebase needed); `phase-18b` touches none of `apps/site`, `scripts/design-lint.sh`, `packages/copy-review`, `.github/workflows`.
- **Unknown addresses (review focus 1):** a prerendered 404 renders on the server with pathname `/_not-found`; in the browser `usePathname()` returns the address asked for (`/agencies/nope`, `/business/pricing/x`). Both must resolve to `both` (exact matching does that), or the markup disagrees. `/how-it-works/` answers 308 to `/how-it-works`, so a trailing slash never reaches a page. `/partners?utm=x` gives pathname `/partners`. On an unknown address the console shows one "Failed to load resource: 404" for the document itself (plus name-resolution errors for the fake app host in E2E): a "no console error" test must leave resource-load errors out.
- Header changes to the phone sheet below `lg` (1024 px): `nav` and the right-hand buttons are `hidden lg:flex`, the menu button `lg:hidden` (`shell/site-header.tsx`, `shell/mobile-menu.tsx`).
- `sharp@0.34.5` is in the pnpm store; adding it as a devDependency changes the root `pnpm-lock.yaml` (allowed). `src/import-boundary.test.ts` reads every dependency group of `package.json`.
- Users, so implementers do not grep again:
  - `'/pricing'`: `content/pages.ts` (row, with the Pricing menu entry), `content/pages.test.ts` (nav list `/how-it-works, /compare, /pricing, /partners, /roadmap`), `content/legal/terms.md`, `src/app/pricing/{page,opengraph-image}.tsx`, `src/app/sitemap.test.ts`, `shell/nav-items.ts` (footer), `src/lib/waitlist-body.test.ts` (sample pathname, five times), `e2e/pages.spec.ts`, `e2e/vitals.spec.ts`.
  - `navItems(`: `src/app/layout.tsx` (`<SiteHeader items={navItems()} />`, the only `items=` on the header), `shell/nav-items.ts`, `shell/shell.test.tsx`, `content/industries-guides.test.ts`. `NAV_EXTRA` is `[]` today; `content.test.ts` has "every NAV_EXTRA /#id is in HOME_ANCHORS".
  - `PLAN_CARDS`: `content/pricing-page.ts` and its test, `pricing/plan-cards.tsx`, `pricing/pricing.test.tsx`. `PRICING_PAGE`: `content/pricing-page.ts` and its test, `src/app/pricing/page.tsx`.
  - `HOME_ANCHORS`: `content/home.ts`, `content/content.test.ts`, `content/how-it-works-page.test.ts`, `src/app/page.tsx`, `home/sections.test.tsx`, `e2e/pages.spec.ts`.
  - `TITLE_STEM` (`content/site.ts`): default title in `src/app/layout.tsx`, `src/app/manifest.ts`, `src/lib/json-ld.ts` (organization and software-application descriptions), `src/lib/llms.ts`.
  - `HOME_IMAGES`: `home/hero.tsx` and its test (`hero*` keys), `home/steps.tsx` (`.street`, stays).
  - Hero pictures: `hero-map.webp` and `hero-overview.webp` are also shown by `content/guides.ts` and stay; only `hero-friday.webp` has no other user.
  - `MobileCta`: `src/app/page.tsx`, `home/mobile-cta.tsx` (first part of the hero fine print + `JoinButton start={HERO.primaryStart}`).
  - `WEEK`, `ROLES`: `content/how-it-works-page.ts` and its test, `src/app/how-it-works/page.tsx`.
  - `data-note-mark`: `client-view/note-mark.tsx` (and a test). `ANNOUNCEMENT` is already keyed `home | agency | business`. `HeroHeadline({ headline })` and `JoinButton({ start?, children?, variant, className })` exist. No source link uses `/#…` today.
- Motion guard: `src/no-idle-motion.test.ts` has `BANNED` and an empty `ALLOWED`; the gallery (Task 3) is the one approved exception.
- E2E specs stop matching after Task 5 and are moved in Task 12 (E2E runs once, there).

## Interfaces this branch adds or changes
- Routes: `/` (chooser), `/agencies`, `/business`, `/agencies/pricing`, `/business/pricing`; `/pricing` → permanent redirect to `/agencies/pricing`.
- `SitePage.side`, `nav.side`, `NAV_EXTRA` entries, `navMenus()` (replaces `navItems()`), `sidePaths()`, `src/lib/side.ts`, `useSide()`.
- `HeroGallery`, `content/gallery.ts`, `scripts/capture-gallery.mjs`; dev dependency `sharp` 0.34.5 in `@cs/site`.
- `PRICING_PAGE` split per side, `BUSINESS_FAQ`, `AgencyPlanCard`, `BusinessPlanCard`.
- No migration, env var, `@cs/ui` or `apps/web` change.

## Assumes from other branches
None. `phase-18b` must not touch `apps/site`, `scripts/design-lint.sh`, `packages/copy-review` (re-checked in each plan's Task 0).

## Decisions (owner-approved)
Owner 2026-11-10: "I like and approve ALL the recommendations."
1. Two sides, one domain; "For agencies" / "For local businesses" switch beside the wordmark on every side page; own menu, button and pricing.
2. `/` asks "Which one are you?" (two equal answers, both-readers headline, gallery; header = wordmark + Sign in); no redirect, no gate.
3. Addresses `/agencies` and `/business`.
4. Business side: first screen, rival story, what you get, sample brief, waitlist; dashboard and Friday at the agency's choice.
5. Client price $249/mo, "A typical price. Your agency sets it and sends the bill."; from pricing code.
6. Gallery: five labelled screenshot tabs (Dashboard, Monday brief, Map rankings, Ads, Friday); plays once (~6 s each) and rests on the first; stops on tab choice; waits on hover/focus; visible Pause; still under reduced motion; first image eager only.
7. Rest of the review: 11-section agency home without the two characters; mockups 2-6; Motion; Copy review.
8. Join popup skips the audience step once a side is chosen.

## Calls made for the owner (approved with the plans 2026-11-10)
Spec § 3 M1-M17, Plan A PA1-PA8, Plan B PB1-PB10. Copy-deck lines marked `D` are approved to build; the wording is still signed in `pnpm copy:review`. The ones that change what a visitor sees:
- Pages for both readers (sample brief, sources, industries, guides, legal) show the switch but no menu (M3).
- `/how-it-works` loses the week timeline, roles block, client tour, sample and board; it links to them instead (M10).
- Compare leaves the top menu (M13); the footer hides agency-only links on the business side (M11).
- The business tour shows one note line instead of numbered notes (M15).
- The gallery waits in a background tab and stops if a picture fails to load (PB1).
- If the agency header cannot fit on one line at 1024 px, the menu moves into the sheet below 1280 px (PB6).
- Section padding 72 px desktop / 56 px phone; smaller headline sizes (PA3, PA4).

## New backlog (target → item)
None yet.

## Owner verification steps
After the build: open `/`, `/agencies`, `/business` and both pricing pages on a phone and a laptop; use the switch; open the join popup on each side; watch the gallery play once; then sign the copy in `pnpm copy:review`.

## Brief

### 1. Scope
Governs: site spec `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` § 3-5, 7.3, 7.6-7.8; `docs/superpowers/specs/2026-11-04-site-story-design.md` § 2-4 (D14 hero motion and the rewritten § 4 lines are superseded); roadmap row 17 (`docs/superpowers/plans/2026-09-29-roadmap.md`).
- **Routing and shell:** side routes, switch, per-side menu and button, minimal home header (mockups 8, 9).
- **Home chooser:** mockup 8; `two.mjs` `HOME`.
- **Agency side:** home minus `Cast`, before/after and the embedded sample (a link instead); a quiet button after the tour (mockups 3-5, 7).
- **Business side:** review "What each side reuses"; `two.mjs` `BUSINESS`.
- **Pricing split:** mockups 6, 10; the new pilot label needs a 4.5:1 check.
- **Gallery:** decision 6, mockup 11; images, not live components.
- **Motion removal:** review "Motion"; rival map still at week 12 with a play button.
- **Copy:** review "Copy review"; US spelling; `/how-it-works` cut to steps + checks; new lines need a pilot-off variant and a claims-ledger check.
- **SEO/metadata:** registry row and `opengraph-image.tsx` per new page; JSON-LD, llms intro (site spec § 7.7).

### 2. Already built: reuse, don't rebuild (in `apps/site/`)
- Home: `src/app/page.tsx`, `src/components/home/*`, `content/home.ts`.
- Registry `content/pages.ts` feeds nav, footer, `src/app/sitemap.ts`, `src/lib/llms.ts` and canonical (`src/lib/metadata.ts`); JSON-LD `src/lib/json-ld.ts`; OG pattern `src/app/opengraph-image.tsx`. Registered pages are self-canonical.
- Shell: one `src/app/layout.tsx`, `src/components/shell/*` (client modules cannot import `content/pages`).
- Pricing: `content/pricing.ts` (client price = `DEFAULT_CLIENT_PRICE_USD`, `src/lib/env.ts`), `content/pricing-page.ts` (a cell per side), `src/components/pricing/*`.
- Join: `src/components/join/*` incl. `copy.ts`; `JoinButton start` already skips step 1 (decision 8 needs nothing new).
- Tour: `src/components/client-view/*`; `public/sample/hero-{overview,map,friday}.webp` (no brief or ads shot yet).
- Motion: `src/app/site.css`, `src/components/motion/*`; `src/components/sample/rank-grid.tsx` has `autoplay={false}`.
- Tests: `content/*.test.ts`, `src/components/{home,shell,pricing}/*.test.tsx`, `src/app/sitemap.test.ts`, `src/app/llms.txt/llms.test.ts`, `e2e/*.spec.ts`. `content/pages.test.ts` expects `src/app/<path>/page.tsx` (a route group breaks it).

### 3. Binding decisions
- Root `CLAUDE.md` § Decisions (Site 17, Brand): claims only from the ledger/code; vendors never named; compare off until counsel.
- `apps/site/CLAUDE.md`: static prerender; `scripts/design-lint.sh` clean; `/for/*`, `/guides/*` never in the top nav; no CSS-hidden links; phone LCP <= 2.5 s; one test run per test DB (`docs/gotchas-cross-cutting.md` § Testing).
- Site spec § 5 (no business self-sign-up), § 7.6 (numbers from one content file), § 7.8 (390 px without overflow; `docs/design-system/README.md` with marketing latitude), § 8 (`prefers-reduced-motion`).
- Copy: signed once at the end (site-story D10); the CI copy step is report-only (copy sign-off tool D9).

### 4. Backlog to fold in (`docs/BACKLOG.md`, verbatim)
- **Folded in** (new first screen = new LCP element): "Site `e2e/vitals.spec.ts` `/` phone LCP sits at the 2500 ms budget (CI 1.86–2.58 s, local 2.37–2.57 s with either font setup): failed CI run 42440234294; find the LCP element and trim it before raising the budget — *2026-11-07*"
- **Superseded** (gallery replaces it; see § 6 Q4): "Retake the hero collage (`public/sample/hero-{overview,map,friday}.webp`) when the tour sample in `content/client-view.ts` changes: static screenshots, no script — *site-polish*"
- **Folded in** (tilt and `Reveal` go; alignment stays): "Home close band is left-aligned from `lg` with `Reveal` on the preview card (spec § 2 said centred) — centre if the owner prefers — *site-story*"
- **Partly** (RankGrid autoplay test only): "Test hygiene minors: rival-grid test pins properties not bytes; no RankGrid autoplay test; loose avatar/className selectors; redundant h1 assertion; `ids` helper filters 'founder' — *site-story*"

### 5. In-flight workstreams
`git branch --no-merged main`: only `phase-18b` (GBP posts; migration 0105). Its diff has no `apps/site` file or shared doc, its work file no site interface: no overlap. No DB migration expected here.

### 6. Open questions for the owner
1. **One delivery or two?** (a) One spec, two plans here (A: motion, layout, copy on existing sections; B: sides, chooser, pricing split, gallery), one merge, one copy sign-off. (b) Merge A first: earlier result, but the `/` first screen is built and signed twice. **Recommend (a).**
2. **How does a page know its side?** Pages are static, so the server cannot remember a choice. (a) The address decides: each page has a fixed side; the business menu links only to `/business` sections and its pricing; both-reader pages (`/sample-brief`, legal, `/for/*`, `/guides/*`) show wordmark, switch, Sign in. (b) As (a), but both-reader pages recall the last side in the browser and swap the menu in after load (visible change). **Recommend (a).**
3. **Pricing addresses.** (a) `/agencies/pricing` + `/business/pricing`; `/pricing` redirects to the agency one (the app never links to it). (b) `/pricing` stays the agency page, plus `/business/pricing`. (c) `/pricing` becomes a "Which one are you?" page without prices. **Recommend (a).**
4. **Who makes the gallery screenshots?** (a) A committed capture script (the steps `two.mjs` ran on the tour), run by hand when the sample changes. (b) By hand, like today's three. **Recommend (a).**
5. **Copy the review does not write** (business sections, business pricing and FAQ, pilot-off variants, page titles). (a) Drafted in the spec for your approval, signed once at the end in `pnpm copy:review`. (b) Drafted during the build; you first see it in `copy:review`. **Recommend (a).**
6. **Compare in the agency menu?** Mockup 9 drops it; the review keeps compare on the agency side. (a) Footer and in-text only, as mocked. (b) A sixth link. **Recommend (a).**
