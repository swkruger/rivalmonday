# site-audiences — two audience sides on rivalmonday.com plus the approved site review

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/site-audiences   **Base:** main @ 843cfbac
**Plan/spec:** none yet. Scope source (session scratchpad): `site-review.html` ("review"), `mocks.mjs` (mockups 1-7), `two.mjs` (mockups 8-11).

## Status (overwrite)
Kickoff brief written 2026-11-10. No spec, plan or code.

## Next (overwrite)
Owner answers Brief § 6 (brainstorming); then spec, lean plan, approval.

## Interfaces this branch adds or changes
None yet. Expected: routes `/agencies`, `/business`. No migration, env var or `@cs/ui` change.

## Assumes from other branches
None (Brief § 5).

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

## New backlog (target → item)
None yet.

## Owner verification steps
None yet.

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
