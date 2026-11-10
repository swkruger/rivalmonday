# site-audiences — two audience sides on rivalmonday.com plus the approved site review

**Kind:** implementation (site only)   **Worktree:** ../CompetitorSpy-wt/site-audiences   **Base:** main @ 843cfbac
**Spec:** `docs/superpowers/specs/2026-11-10-site-audiences-design.md` + copy deck `2026-11-10-site-audiences-copy.md`
**Plans:** `docs/superpowers/plans/2026-11-10-site-audiences-a-still-site.md` (A) and `…-b-two-sides.md` (B)

## Status (overwrite)
2026-11-10: **built, reviewed, ready for the owner.** Plan A Tasks 0-8 and Plan B Tasks 0-12 done, each task reviewed; whole-branch review on the top model: no Critical, 1 Important + 5 Minor fixed in one fix wave (`a37fce10`, `2a83c7fb`, `983f0b15`), re-reviewed. Last code commit `983f0b15`; 38 commits on `main` @ 843cfbac, not pushed.

Gates: `test:affected` at `489226d2` = whole unit suite, 19/19 packages (the `sharp` dev dependency changes `pnpm-lock.yaml`, so every package is "affected"; 1 h 8 min). After the fix wave (apps/site only): site typecheck, lint, design-lint 0, `@cs/site` unit 506 tests, build, `check:bundle`, site E2E 161 passed / 11 skipped (single-project tests), `check:facts` ok (4 rivals), no CRLF. `check:placeholders` exits 1 on the 3 owner placeholders `main` has (deploy gate). The whole-repo unit suite was not repeated after the fix wave (CI runs it).

## Next (overwrite)
1. Owner: the verification steps below, then `pnpm copy:review` for all new and changed lines.
2. `/rm-merge` on the owner's go-ahead (full unit + E2E there after asking; backlog lines below go to `docs/BACKLOG.md`).

## Measurements (final, HEAD)
- Phone vitals over four runs (budget LCP 2,500 ms, never raised): `/` 1,592-1,712, `/agencies` 2,248-2,308, `/business` 2,060-2,212, `/agencies/pricing` 1,492-1,532, `/business/pricing` 1,492-1,556, `/compare` 1,628-1,700 ms; CLS 0 everywhere. Before the fix wave `/agencies` was 2,252-2,504 (one run over) and `/` 1,900-1,932: the LCP element was the hero's background map wash (54 KB, 4-13 % visible on a phone). It is now hidden and not fetched below 1024 px; the LCP element is the headline.
- Header, needed width / room: `/agencies` 738/960 at 1024 px, 1,137/1,216 at 1280 (79 px spare); `/business` 728/960, 968/1,216. One line at 1024, 1280, 1440. Inline menu from 1280 px, sheet below (PB6 fallback).
- `/agencies` at 1440 px: 11,307 px tall (test limit 11,500; Plan A target 10,300 not reached). `#commercial` 1,242 px against the spec's ~930; `#friday` 567 (~570).
- "Pilot" chip contrast 5.94:1. Business price $249 collides with no agency amount ($59, $79, $229, $2,290).
- Gallery: picture change is a 150 ms fade on an already loaded picture; one round, then rest.

## Interfaces this branch adds or changes
- Routes: `/` (chooser), `/agencies`, `/business`, `/agencies/pricing`, `/business/pricing`; `/pricing` → 308 to `/agencies/pricing` (query kept).
- `SitePage.side`, `nav.side`, `NAV_EXTRA` entries, `navMenus()` (replaces `navItems()`), `sidePaths()`, `src/lib/side.ts`, `useSide()`, `useSideOrHome()`.
- `HeroGallery`, `content/gallery.ts`, `scripts/capture-gallery.mjs`; dev dependency `sharp` 0.34.5 in `@cs/site`.
- `PRICING_PAGE` split per side, `BUSINESS_FAQ`, `AgencyPlanCard`, `BusinessPlanCard`. `TITLE_STEM` deleted (`CHOOSER.eyebrow` on site-wide surfaces; default title = `SITE_NAME`).
- No migration, env var, `@cs/ui` or `apps/web` change.

## Assumes from other branches
None. Other branches must not touch `apps/site`, `scripts/design-lint.sh`, `packages/copy-review`.

## Decisions (owner-approved 2026-11-10: "I like and approve ALL the recommendations.")
1. Two sides, one domain; switch "For agencies" / "For local businesses" beside the wordmark; own menu, button, pricing.
2. `/` asks "Which one are you?" (two equal doors, gallery; header = wordmark + Sign in); no redirect, no gate.
3. Addresses `/agencies` and `/business`; the address decides the side.
4. Business side: first screen, rival story, what you get, sample brief, waitlist.
5. Client price $249/mo from pricing code, "A typical price. Your agency sets it and sends the bill."
6. Gallery: five labelled screenshot tabs, plays once and rests, stops on tab choice, waits on hover/focus, visible Pause, still under reduced motion.
7. Rest of the review: 11-section agency home, no idle motion, copy review.
8. Join popup skips the audience step once a side is chosen.
Calls made for the owner (approved with the plans): spec § 3 M1-M17, Plan A PA1-PA8, Plan B PB1-PB10.

## Rulings made during the build (owner may overturn; cost if wrong in brackets)
- R1/R10 kept `home-counter.webp`, `hero-map.webp`, `hero-overview.webp` (guides show them); only `hero-friday.webp` deleted [unused pictures].
- R2 one shared `home/value-cells.tsx` [20-line file]. R3 one-week map never stays "playing" [few lines]. R5, R8, R13, R14 test-line adjustments so the suite stayed green between tasks [none].
- R4/R16 builders and task reviewers on Sonnet, whole-branch review on the top model [tokens]. R17 small or test-only fix diffs re-reviewed by the controller [a slip shows in the final review]. R12/R26 two implementers were allowed to build and run the site (capture script, E2E specs) [minutes].
- R6 `#friday` keeps two columns [one layout tweak]. R7 quiet tour button = ghost join button, line border, ink text, 44 px [restyle]. R9 `min-w-0` on the recommendation lanes for 320 px [one class].
- R11 `sharp` changes the root lock file [none; makes `test:affected` run everything].
- R15 pilot off + agency side: the join button opens the choose step [one branch].
- **R18** gallery alt text for dashboard and brief rewritten to match the pictures [owner rewords in copy:review].
- R19 gallery change = own 150 ms opacity fade `gallery-fade` [one keyframe]. R20 Play overrides hover/focus holds; a hidden tab still holds [round runs under a resting pointer].
- **R21** `RECOMMENDATIONS_ROADMAP` and the `roadmap` prop stay, but no page shows the roadmap block now [dead block until someone wants it].
- **R22** `BUSINESS.whatYouGet.eyebrow` ("What you get") is in content and the deck but not rendered (no section shows an eyebrow) [owner signs a line no page shows, or delete it].
- **R23** `/agencies/pricing` title "Pricing for agencies: three clients included" (deck line was 69 characters with the suffix; cap 60) [owner rewords].
- R24 (superseded) the audience switch is a `next/link`: a side change keeps the page loaded [one component].
- **R25/R29** site-wide descriptions use the neutral chooser line; default title (404 page) is "Rival Monday" [reword].
- R27 final fix wave = the reviewer's list only; other minors carried (backlog below). **R28** hero wash hidden below 1024 px, kept because the phone LCP fell [one revert]. R30 whole-repo unit suite not repeated after the fix wave [a break outside apps/site shows in CI].

## Owner flags (look at these)
1. Phone hero has no map wash any more (R28): glance at `/`, `/agencies`, `/business`, `/how-it-works`, `/partners` on a phone.
2. Menu sheet from 1024 to 1279 px instead of the inline menu (PB6); the sheet has a new Close button (label "Close").
3. Copy not in the deck or changed: nav label "Where things moved" on `/how-it-works`, the two gallery alts (R18), the shortened pricing title (R23), "Close", default title.
4. Gallery pictures: dashboard stat-card labels sit at different heights; the map picture has empty space right of the grid and the last row is cut. Retake with `scripts/capture-gallery.mjs` if wanted.
5. `/` carries price offers in its structured data (spec § 8) while showing no price; search engines prefer structured data that matches the page.
6. `/agencies` is 11,307 px tall (target 10,300); `#commercial` is 1,242 px (spec ~930).

## New backlog (target → item)
- site-polish → Final-review minors left: `value-cells.tsx` has `dt`/`dd` reversed; gallery tabpanel has no `tabIndex={0}` and a manual tab choice has no preload; `console.log` left in `e2e/pages.spec.ts` (line 90 logs the audience-nav count instead of asserting it) and `e2e/site.spec.ts`; "Play all 12 weeks" types the count; both pricing share images have the same alt; `sections.test.tsx` types `$249`; `capture-gallery.mjs` scroll outside the per-slide try and `--quality` unvalidated.
- site-polish → Test hygiene from both plans' reviews: `no-idle-motion` keyframe test may be vacuous and scans `src` only; "sidePaths lists no disabled rival" cannot fail; `//` → `home` unpinned; gallery vendor regex also bans "google"; `BusinessHero` primary button untested at unit level; breadcrumbs test uses the implementation's fallback; `seo-basics` SoftwareApplication check is a substring; E2E headline checks compare against content constants; `#join` after a soft side change tested at unit level only.
- site-polish → Breadcrumb "Home" points at the chooser, not the reader's side; no skip-to-content link (site-wide, older than this branch).
- ops → `pnpm test:affected` selects all 19 packages whenever `pnpm-lock.yaml` changes (1 h 8 min): consider scoping a lock-file change to the packages whose dependencies changed.
- Resolved here, remove at merge: "Site `e2e/vitals.spec.ts` `/` phone LCP sits at the 2500 ms budget …" (now 1.6-1.7 s; `/agencies` 2.25-2.31 s). Superseded: "Retake the hero collage …" (gallery replaces it). Folded in: "Home close band is left-aligned …". Partly (RankGrid Play tests added): "Test hygiene minors: rival-grid test … — *site-story*".

## Owner verification steps
1. `pnpm --filter @cs/site dev` (port 3001). On a phone-width and a laptop window open `/`, `/agencies`, `/business`, `/agencies/pricing`, `/business/pricing`.
2. Use the switch beside the wordmark both ways; the header, menu and join button change without a page reload. Open `/pricing?utm_source=x`: it lands on `/agencies/pricing?utm_source=x`.
3. Open the join popup on each side (agency form, business waitlist; on `/` it asks first). Open it on one side, press Back: it closes.
4. On `/` watch the gallery play one round and rest; try Pause, a tab, hover.
5. At about 1100 px wide open the menu sheet and close it with the Close button.
6. Sign the copy in `pnpm copy:review`; then say the word for `/rm-merge`.
