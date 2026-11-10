# site-audiences, Plan B: two sides, one question — implementation plan (lean)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Lean plan format (root `CLAUDE.md`): each task gives Goal, Files, Interfaces, Behaviour, Tests, Done when; the implementer writes the bodies.

**Goal:** Split rivalmonday.com into an agency side (`/agencies`) and a local-business side (`/business`), with a home page that asks which one the reader is, a pricing page per side, and a hero gallery of five product pictures that plays once.

**Architecture:** The address decides the side; nothing is stored. The page registry marks each page's side, the server turns that into two plain path lists, and a small client context (`useSide`) lets the header, footer, announcement and join popup follow the address. Existing sections are reused with an `audience` prop; nothing is forked. Gallery pictures are photographed from the site's own client tour by a committed script.

**Tech stack:** `@cs/site` (Next 16 App Router, React 19, Tailwind 4, vitest, Playwright). One new dev dependency: `sharp` 0.34.5 (capture script only).

**Spec:** `docs/superpowers/specs/2026-11-10-site-audiences-design.md` (§ 4 routes, § 5 interfaces, § 8 SEO, § 9 tests) and the copy deck `2026-11-10-site-audiences-copy.md`. Tasks cite the deck by section; the deck text is binding, word for word. Starts after Plan A (`2026-11-10-site-audiences-a-still-site.md`) is green.

## Global constraints

- Everything in Plan A's "Global constraints" applies.
- **No agency plan number on the business side:** no `/business*` page, its `<head>`, its JSON-LD or a popup opened there may show `PRICING.agency` figures. `/agencies/pricing` shows no business card.
- No `'use client'` module imports `content/pages`. Side lists and menus are built in `shell/nav-items.ts` (server) and passed down as plain props.
- Every new page: `src/app/<path>/page.tsx` + `opengraph-image.tsx` + a `PAGES` row; title ≤ 60, description ≤ 155 characters (deck values fit).
- Pages prerender. The side is read with `usePathname()` in client components only; no `cookies()`, `headers()` or storage.
- No business self-sign-up: the business action is always the waitlist.
- Compare pages stay behind `NEXT_PUBLIC_COMPARE_PAGES`; CI and Playwright env stay as they are.
- Gallery pictures show sample data only and carry the caption from deck § 6.

## Decisions

Owner-approved: spec § 3 (owner list), deck lines marked `A`. Spec calls M1–M17 stand. My further calls in this plan (the owner checks these):

- **PB1** The gallery also waits while the browser tab is in the background, and if the next picture fails to load it stops on the current one.
- **PB2** Gallery pictures are not wrapped in `ScanFrame` (they already show a window frame). `apps/site/CLAUDE.md` records the exception.
- **PB3** M16 in full: on an agency or business page the popup opens straight on that side's form with no Back and no step label. On `/` and both-reader pages it works as today. With the pilot off, the agency side keeps today's rule (button = sign-up link; `#join` shows the choose step).
- **PB4** The link in the Terms text moves from `/pricing` to `/agencies/pricing` (link target only, no wording change).
- **PB5** Both pricing pages keep today's eyebrow "Pricing" and FAQ heading "Questions".
- **PB6** If the agency header cannot fit on one line at 1024 px with 36 px controls and text ≥ 13 px, the menu moves into the sheet below 1280 px and the header keeps wordmark, switch, Sign in and the join button. The builder reports which case shipped.
- **PB7** Share-image eyebrows: `/agencies` "For agencies", `/business` "For local businesses", `/` "Competitor tracking for local businesses", pricing pages "Pricing".
- **PB8** `llms.txt` opens with the home eyebrow and description instead of the agency stem.
- **PB9** On the business tour, the other dashboard pages (Map rankings, Ads, …) keep their existing one-line notes; only the numbered notes and their markers go.
- **PB10** Footer links carry an optional `wideLabel` (used on `/` and both-reader pages) so the two pricing links can be told apart there.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/side.ts` (+ test) | pure `sideOf`, `switchHref` |
| `src/lib/redirects.ts` (+ test) | the one permanent redirect |
| `src/components/shell/side-context.tsx` | `SideProvider`, `useSide` |
| `src/components/shell/audience-switch.tsx` | the two-link switch |
| `content/gallery.ts`, `scripts/capture-gallery.mjs`, `public/sample/gallery-*.webp` | gallery content and pictures |
| `src/components/home/hero-gallery.tsx` (+ test) | the gallery |
| `content/chooser.ts`, `src/components/home/{home-hero,doors,doors-band}.tsx` | the home page |
| `content/business.ts`, `src/components/home/{business-hero,business-close}.tsx` | the business side |
| `src/app/{agencies,business}/page.tsx`, `src/app/{agencies,business}/pricing/page.tsx` (+ og images) | new routes |
| `src/components/pricing/{agency-plan-card,business-plan-card,feature-list}.tsx` | replace `plan-cards.tsx`, `feature-table.tsx` |
| `content/pages.ts`, `shell/nav-items.ts`, `shell/{site-header,mobile-menu,site-footer,announcement-bar}.tsx`, `join/*` | changed |
| `src/app/pricing/*`, `public/sample/hero-{overview,map,friday}.webp` | deleted |

## Dependencies on in-flight work

- Plan A merged into this branch and green (its Task 8).
- `phase-18b`: Task 0 re-checks it touches none of `apps/site`, `scripts/design-lint.sh`, `packages/copy-review`, `.github/workflows` (site job).
- `apps/web` links to `https://rivalmonday.com/#join`: stays valid (`#join` on `/` opens the choose step). No change in `apps/web`.

## Review focus

1. **Unknown address under a side prefix.** `/agencies/nope`, `/business/pricing/x`, a trailing slash, a query or a hash: the first two are both-reader pages, the rest do not change the side (Task 1).
2. **Gallery in a background tab or with a broken picture.** It must not burn its one round unseen, and must not show a blank frame (Task 3).
3. **Moving between sides without a page load.** Header, open phone sheet and the popup's first step must follow the new address (Tasks 9, 10).
4. **`/pricing` with a query string.** Old ad and email links keep their `utm_*` through the permanent redirect (Task 12).
5. **Agency numbers in the business side's source.** Not only visible text: `<head>`, JSON-LD and the popup (Tasks 7, 8, 10, 12).

---

### Task 0 — Pre-flight (controller, no product code)

- Plan A Task 8 gates are green on this branch. `git fetch`; `git rebase main`; run the in-flight check.
- Greps, noted in the work file: `/pricing`, `navItems(`, `PLAN_CARDS`, `PRICING_PAGE`, `HOME_ANCHORS`, `TITLE_STEM`, `HOME_IMAGES`, `hero-overview|hero-map|hero-friday`, `MobileCta`, `items=` on header and menu.
- 404 probe (not committed): add a temporary `useSide()` log to the header, `next build && next start -p 3011`, open `/agencies/nope`; the browser console shows no hydration warning. Expected: the prerendered 404 and the client both resolve to `both`. If not, stop and report before Task 1.
- Confirm `sharp@0.34.5` is in the pnpm store (`pnpm why sharp -r`); confirm how the header breaks to the phone sheet today (breakpoint) for PB6.
- **Done when:** notes are in `docs/work/site-audiences.md` and the dev server is stopped.

### Task 1 — Side registry and context

**Goal:** Every address resolves to `home`, `agency`, `business` or `both`, on the server list and in client components. No visible change.

**Files:** create `src/lib/side.ts`, `src/lib/side.test.ts`, `src/components/shell/side-context.tsx`. Modify `content/pages.ts`, `content/pages.test.ts`, `shell/nav-items.ts`, `shell/shell.test.tsx`, `src/app/layout.tsx`.

**Interfaces:** exactly spec § 4:
```ts
side?: 'agency' | 'business'                                   // SitePage; absent = both readers
export function sidePaths(): { agency: string[]; business: string[] }      // nav-items.ts, server
export type Side = 'home' | 'agency' | 'business' | 'both';
export function sideOf(pathname: string, paths: { agency: string[]; business: string[] }): Side;
export function switchHref(pathname: string, to: 'agency' | 'business'): string;
export function SideProvider(props: { paths: { agency: string[]; business: string[] }; children: ReactNode }): JSX.Element
export function useSide(): Side
```

**Behaviour:**
- `side: 'agency'` on `/how-it-works`, `/partners`, `/roadmap`, `/compare` and rival rows, `/integrations` and its rows. `/pricing` gets none (it leaves in Task 8).
- `sidePaths()` reads `PAGES` (so disabled rivals are absent).
- `sideOf`: drop query and hash, drop a trailing slash except on `/`; `/` → `home`; exact match in a list → that side; anything else → `both`. No prefix matching.
- `switchHref`: on `/agencies/pricing` or `/business/pricing` → the target side's pricing page; otherwise `/agencies` or `/business` (M5).
- `side.ts` has no imports. `useSide` outside a provider throws.
- Layout: `SideProvider` wraps `PilotProvider` and everything in it.

**Tests (first):**
- `side.test.ts`: "/ is home"; "every registered path maps to its row's side" (loop over `PAGES`, absent → `both`); "an unknown path under a side prefix is both" (`/agencies/nope`, `/business/pricing/x`, `/_not-found`); "a trailing slash, query or hash does not change the side" (`/how-it-works/`, `/partners?utm=x`, `/roadmap#top`; review focus 1); `switchHref` four cases (pricing ↔ pricing, elsewhere → first page).
- `pages.test.ts`: "agency-side rows are exactly the decided set"; "sidePaths lists no disabled rival".
- `shell.test.tsx`: "useSide follows usePathname" (mock `next/navigation`).

**Done when:** `pnpm --filter @cs/site exec vitest run src/lib/side.test.ts content/pages.test.ts src/components/shell` and `typecheck` pass.

### Task 2 — Gallery pictures and the capture script

**Goal:** Five product pictures, each in two sizes, photographed from the client tour, plus the gallery's content file.

**Files:** create `scripts/capture-gallery.mjs`, `content/gallery.ts`, `content/gallery.test.ts`, `public/sample/gallery-{dashboard,brief,map,ads,friday}.webp` and `-720.webp`. Modify `apps/site/package.json` (`sharp` 0.34.5 devDependency; script `"capture:gallery": "node scripts/capture-gallery.mjs"`), `apps/site/CLAUDE.md`.

**Interfaces:** `GallerySlideId`, `GallerySlide`, `GALLERY` exactly as spec § 5; labels, caption, button and tab-list names and alts from deck § 6 (reused alts copied as text from `HOME_IMAGES`, which Task 3 deletes). `src` = `/sample/gallery-<id>.webp`, `srcSmall` = `/sample/gallery-<id>-720.webp`. Slide order: dashboard, brief, map, ads, friday.

**Behaviour (script):**
- Args `--base` (default `http://localhost:3011`) and `--path` (default `/agencies`; run now with `--path /`, where the tour lives until Task 5).
- Playwright Chromium, viewport 1024×900, `deviceScaleFactor` 1.5, `reducedMotion: 'reduce'`; injects CSS hiding `[data-note-mark]`.
- Per slide, inside `#client-view`: `dashboard` = tab "Dashboard", menu "Overview"; `brief` = tab "Monday brief"; `map` = tab "Dashboard", menu "Map rankings"; `ads` = tab "Dashboard", menu "Ads"; `friday` = tab "Friday". Then screenshot clipped to the top-left 960×600 CSS px of `#client-view .product-frame`.
- `sharp` writes 1440×900 WebP and a 720×450 WebP. Exits non-zero with the slide id when a selector is missing or the clip is not 1440×900.
- Run against `next build && next start -p 3011`; stop the server afterwards.
- **Follow pattern:** `scripts/sample-rank-story.mjs` for argument and logging style.

**Controller step:** open all five large pictures (Read tool), check each against its alt and correct the alt in `content/gallery.ts` if the picture shows something else (deck § 6). Report file sizes; target ≤ 120 KB large, ≤ 60 KB small (lower WebP quality before accepting more).

**Tests (first):** `gallery.test.ts`: "five slides in the decided order with the decided labels"; "every picture file exists in public/sample in both sizes"; "alts are 40–200 characters and name no vendor"; "dwell is 6000 ms".

**Done when:** `pnpm --filter @cs/site exec vitest run content/gallery.test.ts`, `typecheck` and `pnpm --filter @cs/site lint` pass; ten files committed; `apps/site/CLAUDE.md` says how to re-capture and records PB2.

### Task 3 — `HeroGallery`

**Goal:** The gallery component, replacing the three stacked pictures in the agency hero.

**Files:** create `src/components/home/hero-gallery.tsx`, `hero-gallery.test.tsx`. Modify `home/hero.tsx`, `home/hero.test.tsx`, `content/home.ts` (`HOME_IMAGES.hero`, `.heroMap`, `.heroFriday` removed), `src/app/site.css` only if a token is needed; delete `public/sample/hero-{overview,map,friday}.webp` after a grep.

**Interfaces:** `export function HeroGallery(props: { start?: GallerySlideId }): JSX.Element` (`'use client'`; default `'dashboard'`).

**Behaviour (binding; spec § 5 "Gallery"):**
- Order = `GALLERY.slides` rotated so `start` is first. One `<img>` in the DOM at a time, in a fixed 16:10 box; the opening picture is `loading="eager"` with `fetchPriority="high"`; `srcSet` = small 720w, large 1440w; `sizes="(min-width: 1024px) 50vw, 100vw"`. A change swaps `src` in place with the `reveal-quick` fade (≤ 150 ms).
- State: `index`, `mode: 'playing' | 'stopped'`, `held`. Starts `playing` once the opening picture has loaded, unless reduced motion.
- While playing and not held: after `dwellMs` advance by one. 1,500 ms before an advance is due, preload the next picture (`new Image()`); advance only once it has loaded; if it errors, `mode = 'stopped'` on the current picture (PB1).
- After the advance that lands back on `start` (five advances): `stopped`, for good.
- Held while the pointer is over the gallery, focus is inside it, or `document.hidden`; on release the dwell starts again from zero.
- Choosing a tab: show it, `stopped`. Pause: `stopped`. Play (shown when stopped): one more round from the current picture, ending on it.
- Reduced motion: never plays; no Pause/Play button; tabs work.
- Tabs: `role="tablist"` named `GALLERY.tablist`, five `role="tab"` with `aria-selected`, roving `tabIndex`, Left/Right wrap, Home/End; the picture box is the `tabpanel`. No live-region announcement while playing. Caption under the picture.
- All timers cleared on unmount.

**Tests (first; fake timers, `Image` stubbed to load or fail on demand):**
- "opens on start and renders one picture" (`start="brief"` → img alt is the brief alt; one `img`).
- "plays once through the other four and rests on start" (5 × 6 s → back on start; a further 60 s changes nothing; button named `Play`).
- "choosing a tab stops it for good".
- "hover and focus hold the round; leaving resumes with a full dwell".
- "Pause stops; Play runs one more round from the current picture".
- "reduced motion: never plays, no button, tabs work".
- "arrow keys move between tabs and wrap; Home and End jump".
- "a hidden tab holds the round" and "a picture that fails to load ends the round on the current one" (review focus 2).
- "unmount clears timers" (`vi.getTimerCount() === 0`).
- `hero.test.tsx`: "the hero shows the gallery opening on the dashboard".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/home/hero-gallery.test.tsx src/components/home/hero.test.tsx src/no-idle-motion.test.ts content` and `typecheck` pass (add `hero-gallery.tsx` to the guard's `ALLOWED` only if it trips a banned word, with the reason "plays once, then stops").

### Task 4 — Home-page pieces (not yet mounted)

**Goal:** The chooser hero and the doors band, built and tested before the route swap.

**Files:** create `content/chooser.ts`, `src/components/home/home-hero.tsx`, `doors.tsx`, `doors-band.tsx`, `home-hero.test.tsx`. Modify `content/content.test.ts`.

**Interfaces:**
```ts
export const CHOOSER: {
  eyebrow: string; headline: { lead: string; mark: string }; sub: string; question: string;
  doors: readonly { id: 'agency' | 'business'; title: string; body: string; cta: string; href: '/agencies' | '/business' }[];
  sample: { lead: string; label: string; href: '/sample-brief' };   // 'Not sure yet?' · 'See a sample brief'
  proof: readonly string[]; bandHeading: string;
}                                                                    // wording: deck § 2
export function Doors(props: { headingId: string }): JSX.Element      // the two door links
export function HomeHero(): JSX.Element
export function DoorsBand(): JSX.Element                              // section id="choose"
```

**Behaviour:**
- `HomeHero`: eyebrow, `HeroHeadline` (Plan A), sub, the question as an `<h2>`, `Doors`, the sample-brief line, proof, and `HeroGallery start="dashboard"` to the right (under the text on phones). Still radar as in the agency hero. No join button, no pilot pill.
- A door is one `<a>` (whole card clickable) with title, body and the arrow label; 36 px minimum control height; calm styling: surface card, `border-line`, `.press`; no orange.
- `DoorsBand`: `bandHeading` + `Doors`, in `HomeSectionShell`.
- **Follow pattern:** `home/hero.tsx` for layout; `home/cta-band.tsx` for the band.

**Tests (first):** "headline is the decided lead and mark in one h1"; "two doors link to /agencies and /business with the decided titles"; "the sample-brief link points to /sample-brief"; "no join button and no price"; "doors band repeats the same two doors"; `content.test.ts` "chooser copy matches the deck" (spot keys) and "chooser has no digits".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/home/home-hero.test.tsx content/content.test.ts` and `typecheck` pass.

### Task 5 — Route move: `/agencies` and the new `/`

**Goal:** Today's home page lives at `/agencies`; `/` becomes the chooser.

**Files:** create `src/app/agencies/page.tsx`, `src/app/agencies/opengraph-image.tsx`. Modify `src/app/page.tsx`, `src/app/opengraph-image.tsx`, `content/pages.ts`, `content/pages.test.ts`, `home/sections.test.tsx`.

**Interfaces:** `PAGES` rows: `/` takes title and description from deck § 2 (priority 1); new `/agencies` row takes today's home title and description, `side: 'agency'`, `sitemap: true`, `changeFrequency: 'monthly'`, `priority: 0.9`.

**Behaviour:**
- `/agencies` = Plan A's home composition, same order, with `softwareApplicationLd()` and `MobileCta`.
- `/` = `JsonLd` (`softwareApplicationLd()`), `HomeHero`, `ChecksHub` (default heading), `LiveCounters`, `DoorsBand`. No `MobileCta`.
- Share images per PB7. **Follow pattern:** `src/app/pricing/opengraph-image.tsx`.
- `HOME_ANCHORS` keeps its name and now describes `/agencies`.

**Tests (first):**
- `sections.test.tsx`: the `HomePage` describe becomes `AgenciesPage` (same assertions, imported from `app/agencies/page`); new `HomePage` describe: "renders hero, checks, counters and the doors band, in that order"; "one h1 and no duplicate ids"; "shows no price and no join button"; "no link points at an id the page does not render".
- `pages.test.ts`: "/ and /agencies carry the decided titles"; og-image and length tests pass for the new row.

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/home content/pages.test.ts src/lib` and `typecheck` pass.

### Task 6 — `/how-it-works` trimmed (M10)

**Goal:** The page keeps intro, four steps, claim checks, FAQ and guides, and links to what moved.

**Files:** modify `src/app/how-it-works/page.tsx`, `content/how-it-works-page.ts`, their tests (`content/content.test.ts`, any page test found by grep).

**Interfaces:** `HOW_LINKS: readonly { label: string; href: string }[]` (three, deck § 7) in `content/how-it-works-page.ts`; `JUMP_LINKS` = The four steps, How claims get checked, Questions, Guides; `WEEK` and `ROLES` removed.

**Behaviour:** remove the week timeline, the roles block, `ClientView`, `SampleSection`, `RecommendationsSection`; render `HOW_LINKS` as a row of text links right after `Steps`. `ChecksHub hideLink` stays (it still shows the sample-brief link from Plan A).

**Tests (first):** "jump links point only at ids the page renders"; "the page links to /agencies#client-view, /sample-brief and /agencies#recommendations"; "no client tour, sample or recommendations board on the page"; FAQ JSON-LD test unchanged.

**Done when:** focused vitest on the touched tests and `typecheck` pass; `git grep -n "WEEK\b\|ROLES\b" -- apps/site` prints nothing.

### Task 7 — `/business`

**Goal:** The local-business page: hero, rival story, what you get, sample, close.

**Files:** create `content/business.ts`, `src/components/home/business-hero.tsx`, `business-close.tsx`, `business.test.tsx`, `src/app/business/page.tsx`, `src/app/business/opengraph-image.tsx`. Modify `home/rival-story.tsx`, `client-view/{client-view,dashboard-mock,brief-email-mock,friday-chat-mock}.tsx`, `content/pages.ts`, tests `home/story.test.tsx`, `client-view/client-view.test.tsx`, `content/content.test.ts`.

**Interfaces:**
```ts
export const BUSINESS: {
  hero: { eyebrow: string; headline: { lead: string; mark: string }; sub: string; primaryCta: string; secondaryCta: string;
          finePrint: string; finePrintTrial: string; proof: readonly string[] };
  rivalStory: { heading: string; intro: string; closing: string };
  whatYouGet: { eyebrow: string; heading: string; body: string; note: string };
  close: { heading: string; body: string; bodyTrial: string; button: string };
}                                                                  // deck § 4; `{$249}` from PRICING.business
export const BUSINESS_ANCHORS = ['rival-story', 'client-view', 'sample', 'join'] as const;
RivalStory({ audience = 'agency' }: { audience?: 'agency' | 'business' })
ClientView({ heading, audience = 'agency' }: { heading?: string; audience?: 'agency' | 'business' })
DashboardMock / BriefEmailMock / FridayChatMock: new prop `marks = true`
```

**Behaviour:**
- Page order: `BusinessHero`, `RivalStory audience="business"`, `ClientView audience="business"`, `SampleSection`, `BusinessClose`, `MobileCta`. No `SoftwareApplication` JSON-LD. Row: `side: 'business'`, priority 0.9, deck § 4 title and description.
- `BusinessHero`: `HeroHeadline`, primary `JoinButton start="business"`, secondary link to `#sample`, fine print by pilot mode, proof, `HeroGallery start="brief"`.
- `RivalStory` business: `BUSINESS.rivalStory.heading`; `intro` as a paragraph above the existing body; `closing` in place of `RIVAL_STORY.closing`. Map, log and caption unchanged.
- `ClientView` business: `whatYouGet` eyebrow, heading and body; `marks={false}` on the three mocks (no `[data-note-mark]` in the DOM); in place of the numbered list one line `whatYouGet.note`; other dashboard pages keep `viewNotes` (PB9); no button under the tour.
- `BusinessClose`: `id="join"`, heading, body by pilot mode, `JoinButton start="business"`. **Follow pattern:** `home/close-band.tsx` (without the card).

**Tests (first):**
- `business.test.tsx` (renders the page): "hero copy is the decided copy"; "fine print follows pilot mode" (pilot off: no `Free during the pilot`); "one h1, no duplicate ids"; "section ids are BUSINESS_ANCHORS"; "the join section's button opens the business form"; "the page never shows an agency plan number" (text contains none of the formatted `PRICING.agency` monthly, yearly and tier prices; review focus 5).
- `story.test.tsx`: "business audience: business heading, intro and closing; the body is unchanged".
- `client-view.test.tsx`: "business audience: one note line, no numbered notes, no markers, no button".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components content` and `typecheck` pass.

### Task 8 — Pricing per side

**Goal:** `/agencies/pricing` and `/business/pricing`; `/pricing` redirects for good.

**Files:** create `src/app/agencies/pricing/{page,opengraph-image}.tsx`, `src/app/business/pricing/{page,opengraph-image}.tsx`, `src/components/pricing/{agency-plan-card,business-plan-card,feature-list}.tsx`, `src/lib/redirects.ts`, `src/lib/redirects.test.ts`. Modify `content/pricing-page.ts`, `pricing/faq.tsx`, `pricing/pricing.test.tsx`, `content/pages.ts`, `content/pages.test.ts`, `next.config.ts`, `shell/nav-items.ts` (footer href), `content/legal/terms.md` (PB4), `lib/breadcrumbs.ts` and its test if nested paths need it. Delete `src/app/pricing/`, `pricing/plan-cards.tsx`, `pricing/feature-table.tsx`.

**Interfaces:**
```ts
PRICING_PAGE: { agency: PricingPageCopy; business: PricingPageCopy }
type PricingPageCopy = { eyebrow: string; h1: string; lead: string; leadTrial: string; featuresHeading: string; faqHeading: string }
BUSINESS_FAQ: readonly { q: string; a: string; ledger: string; link?: { href: string; label: string } }[]   // four, deck § 5
PLAN_CARDS.pilot.agency / .business gain: chip: string; rows?: readonly { label: string; value: string }[]   // deck § 5
AgencyPlanCard(): JSX.Element     // data-slot="plan-agency"
BusinessPlanCard(): JSX.Element   // data-slot="plan-business"
FeatureList({ side }: { side: 'agency' | 'business' }): JSX.Element
Faq({ items, heading }: { items: readonly { q: string; a: string; link?: { href: string; label: string } }[]; heading: string })
// src/lib/redirects.ts (no imports); next.config.ts: `redirects: async () => [...REDIRECTS]`
export const REDIRECTS = [{ source: '/pricing', destination: '/agencies/pricing', permanent: true }] as const;
```

**Behaviour:**
- Card (spec § 6): title with the chip beside it (pilot only), price at 2.5rem with "/mo", note, tier rows (agency), points, button. Pilot-off wording is today's `PLAN_CARDS.trial`. `AGENCY_POINTS[2]` per deck § 5. Chip text contrast ≥ 4.5:1.
- `FeatureList`: one column; rows whose cell for the side is `false` are left out; a string cell shows as the row's note.
- Agency page: intro, card, features, `Faq` (`PRICING_FAQ`), `CtaBand`; JSON-LD `softwareApplicationLd()` and `faqPageLd`. Business page: intro, card, features, `Faq` (`BUSINESS_FAQ`; FAQ 3 reuses the `faq-data` answer and link), `BusinessClose`; JSON-LD `faqPageLd` only.
- Rows: both `sitemap: true`, priority 0.8, own `side`; breadcrumb trail of a nested path resolves each registered parent.
- **Follow pattern:** today's `src/app/pricing/page.tsx`; `src/lib/headers.ts` for a config value kept in `src/lib` and tested there.

**Tests (first):**
- `pricing.test.tsx`: "agency page shows only the agency card"; "business page shows only the business card and no agency plan number" (review focus 5); "pilot off: trial wording on both cards, no chip"; "feature list leaves out rows the side does not get" (business: no `Your branding`, no `Client billing in your name`); "FAQ JSON-LD equals the visible questions" on both pages; "business FAQ ledger ids exist in the claim check"; "every agency figure on the card comes from PRICING".
- `redirects.test.ts`: "redirects /pricing permanently to /agencies/pricing" (exactly one rule; no rule's source is a registered path).
- `pages.test.ts`: no `/pricing` row; both new rows have og images.

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/pricing content src/lib` and `typecheck` pass; `git grep -n "'/pricing'\|(/pricing)" -- apps/site` shows only `src/lib/redirects*` and `e2e/` (Task 12).

### Task 9 — Header, menu, announcement and footer per side

**Goal:** The shell follows the address.

**Files:** create `src/components/shell/audience-switch.tsx`. Modify `content/chooser.ts` (`SWITCH`), `content/pages.ts` (`nav.side`, `NAV_EXTRA`; Compare loses `nav`), `content/pages.test.ts`, `shell/{nav-items.ts,site-header,mobile-menu,site-footer,announcement-bar}.tsx`, `shell/shell.test.tsx`, `src/app/layout.tsx`.

**Interfaces:** spec § 5 (`nav.side`, `NAV_EXTRA`, `navMenus()`, `NavLink.side`), plus:
```ts
interface NavLink { label: string; href: string; highlight?: boolean; side?: 'agency' | 'business'; wideLabel?: string }   // PB10
export const SWITCH = { label: 'Audience', agency: 'For agencies', business: 'For local businesses' } as const;            // content/chooser.ts
SiteHeader({ menus }: { menus: { agency: NavLink[]; business: NavLink[] } })
MobileMenu({ menus }: { menus: { agency: NavLink[]; business: NavLink[] } })
AudienceSwitch({ className }: { className?: string })
```
Agency menu: How it works `/how-it-works`, Sample brief `/sample-brief`, Pricing `/agencies/pricing`, Partners, Roadmap. Business menu (`NAV_EXTRA`): What you get `/business#client-view`, Sample brief `/business#sample`, Pricing `/business/pricing`.

**Behaviour:**
- Header by `useSide()`: `home` = wordmark, Sign in. `agency` = wordmark, switch, agency menu, Sign in, join button. `business` = wordmark, switch, business menu, Sign in, "Join the waitlist". `both` = wordmark, switch (neither current), Sign in.
- Switch: `<nav aria-label="Audience">` with two links, `href = switchHref(pathname, side)`, current one `aria-current="page"`. Phones: first thing in the menu sheet; on `both` pages (no sheet) a line under the header. Fit rule: PB6.
- The open sheet closes when the pathname changes.
- Announcement: `ANNOUNCEMENT[side]`, `both` → `home`; link calls `open(link.start)`; hidden when the pilot is off.
- Footer: `footerColumns()` sets `side` on a link from its page's row. A link with a side is hidden on the other side; empty columns drop. Product column carries both pricing links (`label: 'Pricing'`, `wideLabel` per deck § 1); `wideLabel` shows on `home` and `both`. Tagline: agency `HERO.eyebrow`, business `BUSINESS.hero.eyebrow`, otherwise `CHOOSER.eyebrow`.
- Layout passes `navMenus()`; `navItems()` is removed.

**Tests (first; `usePathname` mocked):**
- "header on /: wordmark and Sign in only"; "header on /agencies: switch with For agencies current, five menu items, join button"; "header on /business: business menu and Join the waitlist"; "header on /sample-brief: switch with neither current, no menu".
- "the switch keeps pricing on pricing".
- "phone menu lists the same items as the header on each side, switch first".
- "changing the pathname re-renders the header for the new side and closes the open sheet" (review focus 3).
- "announcement per side; both-reader pages use the home line; pilot off hides it".
- "footer on /business has no agency-only link and one Pricing link to /business/pricing"; "footer on / shows both pricing links with their long labels"; "footer tagline follows the side".
- `pages.test.ts`: "agency menu is the decided five"; "Compare is not in the top menu"; "every business menu anchor is in BUSINESS_ANCHORS"; "/for and /guides never appear in a menu".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/shell content/pages.test.ts` and `typecheck` pass; `pnpm --filter @cs/site lint` passes.

### Task 10 — Join popup per side

**Goal:** The join button, `#join`, the popup's first step and the phone bar follow the side (M16, M17, PB3).

**Files:** modify `join/{join-provider,join-button,join-dialog,step-agency,step-business}.tsx`, `join/copy.ts` only if a label moves, `home/mobile-cta.tsx`; tests `join/join-dialog.test.tsx`, `home/hero-join.test.tsx`, a new `join/join-side.test.tsx`.

**Interfaces:**
```ts
open(start?: JoinStart): void        // no argument: agency → 'agency', business → 'business', home/both → 'choose'
JoinButton({ start, children, variant, className })   // start optional; label default on the business side: 'Join the waitlist'
JoinDialog({ open, start, onClose, submit, direct }: { …; direct?: boolean })   // direct = the side chose the step
```

**Behaviour:**
- Provider: `direct = side === 'agency' || side === 'business'`. `?join=business` → `open('business')` on every page. `#join` → `open()`.
- Dialog with `direct` and opened on a form step: no Back button, no step label. If the choose step is shown (pilot off on the agency side), it works as today, Back included.
- `JoinButton` on the business side: always the waitlist button, label "Join the waitlist" in both pilot states. Agency side, pilot off: sign-up link as today.
- `MobileCta`: agency = today's; business = first part of `BUSINESS.hero.finePrint(Trial)` + "Join the waitlist" (`start="business"`).
- The side is read at the moment of `open()`, so a client-side move between sides is picked up without remounting.

**Tests (first):**
- `join-side.test.tsx`: "on /agencies the button opens the agency form with no Back and no step label"; "on /business it opens the business form with no Back and no step label"; "on / it opens the choose step, and step 2 has Back and its step label"; "on /sample-brief it behaves as on /"; "#join follows the side"; "?join=business opens the business form on an agency page"; "pilot off on /agencies: #join shows the choose step"; "after the pathname changes side, the next open() uses the new side" (review focus 3); "a popup opened on /business shows no agency plan number" (review focus 5).
- `join-dialog.test.tsx`: existing cases keep passing with `direct` unset.
- `MobileCta`: "business side shows Join the waitlist".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/join src/components/home` and `typecheck` pass.

### Task 11 — SEO surfaces

**Goal:** Sitemap, structured data, `llms.txt` and page heads match the two sides (spec § 8).

**Files:** modify `src/lib/llms.ts`, `src/app/llms.txt/llms.test.ts`, `src/lib/seo-basics.test.ts`, `src/app/sitemap.test.ts`, `content/pages.test.ts`; `src/lib/metadata.ts` / `src/app/layout.tsx` only where `TITLE_STEM` leaks (Task 0 grep).

**Behaviour:**
- `llms.txt`: `INTRO` per deck § 7; the quoted first line is `CHOOSER.eyebrow` + the home description (PB8). Both sides and both pricing pages are listed.
- `TITLE_STEM` no longer reaches the `<head>` or share image of `/` or `/business*`.
- `SoftwareApplication` JSON-LD on `/`, `/agencies`, `/agencies/pricing` only.

**Tests (first):** "sitemap: / is 1.0, /agencies and /business 0.9, both pricing pages 0.8, and /pricing is absent"; "SoftwareApplication is on the three decided pages and not on /business or /business/pricing"; "llms.txt opens with the decided intro and lists both sides"; "metadata of /business and /business/pricing contains no agency stem and no agency plan number"; "every registered path has a page file and an og image".

**Done when:** `pnpm --filter @cs/site exec vitest run src/lib src/app content` and `typecheck` pass.

### Task 12 — E2E, vitals, gates, final review

**Goal:** Prove the two sides end to end, then review the whole branch once.

**Files:** modify `e2e/{site,pages,vitals}.spec.ts`, `e2e/helpers.ts` if a helper is shared, `apps/site/CLAUDE.md` (sides, `useSide`, the pricing rule, the gallery), `docs/work/site-audiences.md`.

**E2E (both projects unless said):**
- "/ shows the two doors and each leads to its side".
- "each side shows its headline, its menu and its join button".
- "the popup opens on the side's own form" (agency, business) and "on / it asks first".
- "/pricing redirects permanently and keeps the query": `request.get('/pricing?utm_source=x', { maxRedirects: 0 })` → 308, `location` = `/agencies/pricing?utm_source=x` (review focus 4).
- "the business side's source has no agency plan number": raw HTML of `/business` and `/business/pricing` (head and JSON-LD included) and the open popup's text contain none of the formatted `PRICING.agency` prices (matched as whole amounts); `/agencies/pricing` has no `[data-slot=plan-business]` (review focus 5).
- "moving between sides without a reload updates header, menu and popup" (click the switch; review focus 3).
- "the header fits at 1024 px on both sides" (one line, no overflow) and "no overflow at 390 and 1024" on `/`, `/agencies`, `/business`, both pricing pages.
- "an unknown address under /agencies shows the both-reader header and logs no console error".
- "the gallery plays once and then rests" (desktop; `page.clock` fast-forward 40 s → first tab selected, Play visible) and "with reduced motion it never moves".
- "the pricing chip is readable": computed colour contrast of `[data-slot=plan-agency]` chip ≥ 4.5.
- `vitals.spec.ts`: paths `/`, `/agencies`, `/business`, `/agencies/pricing`, `/business/pricing`, `/compare`; LCP ≤ 2,500 ms, CLS ≤ 0.1 (phone). A miss is reported with the LCP element; the budget is not raised.
- Plan A's "home page is shorter" and "nothing moves by itself" now run on `/agencies`; "nothing moves by itself" runs on `/`, `/agencies` and `/business` and starts after the gallery has finished its round.

**Done when (controller, once, in order):** `pnpm --filter @cs/site typecheck` · `pnpm test:affected` · `pnpm --filter @cs/site lint` · `bash scripts/design-lint.sh` · `pnpm --filter @cs/site build`, `check:bundle`, `check:placeholders`, `check:facts` · `pnpm --filter @cs/site e2e`. Then the whole-branch review on the top model (`main...site-audiences`; brief: this plan's Review focus, Plan A's, and the constraints), one fix wave, re-run of the affected gates. `git ls-files --eol | grep crlf` prints nothing. Work file updated with measurements and owner verification steps; copy sign-off (`pnpm copy:review`) and `/rm-merge` wait for the owner.
