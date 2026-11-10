# Site: two audiences, gallery, shorter home, no idle motion (17b)

**Date:** 2026-11-10 · **Branch:** `site-audiences` · **Status:** draft for owner approval
**Builds on:** site spec `2026-10-28-phase-17-marketing-site-design.md` (§ 3, 4, 5, 7.3, 7.6, 7.7, 7.8) and `2026-11-04-site-story-design.md` (§ 1 D8–D14, § 2, § 3). Only what changes is here.
**Wording:** every new or changed line is in the copy deck `2026-11-10-site-audiences-copy.md` (*deck*).
**Source:** the site review the owner approved in full on 2026-11-10 (https://claude.ai/artifact/FMaMYwLv33YyjwZs7Biksr); decisions 1–8 in `docs/work/site-audiences.md`.

## 1. Why

The site talks to two readers at once, an agency owner and a local business owner, through one home page, one menu and one pricing page. The headline speaks to the business owner while the page sells to the agency; the home page is 15,610 px long; ten things move unasked. After this work each reader gets what looks like their own site, and the home page asks which one they are.

## 2. Goals, non-goals, anti-goals

**Goals**
- `/` asks "Which one are you?" and sends each reader to their side. No redirect, no gate, no stored choice.
- Each side has its own first screen, menu, button and pricing page. Neither side shows the other's plan or prices.
- The agency home has 11 sections (from 14) and is about a third shorter.
- No motion without a user action, except the gallery.

**Non-goals:** business self-sign-up (site spec § 5: waitlist only); compare pages; content of `/partners`, `/roadmap`, `/integrations`, `/for/*`, `/guides/*`; `apps/web`, the database, the waitlist API; new illustrations.

**Anti-goals:** a choice kept in a cookie or local storage; a business reader shown agency prices; phone LCP above 2.5 s on a first screen.

## 3. Decisions

**Owner-approved (2026-11-10):** the review in full (mockups 1–11, Motion, Copy review) and work-file decisions 1–8: two sides on one domain with a switch beside the wordmark; `/` asks the question; `/agencies` and `/business`; the business side's five sections; the typical client price; the gallery that plays once; a join popup that skips "Who are you?" once a side is chosen.

**My calls (not yet seen by the owner):**

| # | Call |
|---|---|
| M1 | One spec, two plans, one merge, one copy sign-off. Plan A: motion, layout and copy on existing sections. Plan B: sides, chooser, pricing split, gallery. A lands first (the gallery is photographed from the still site). |
| M2 | The address decides the side (§ 4). Nothing is stored, pages stay static. |
| M3 | Pages for both readers (`/sample-brief`, `/sources/*`, `/for/*`, `/guides/*`, legal, 404 and any unknown address) show wordmark, switch and Sign in only. Trade-off of M2: the way back is the switch. |
| M4 | `/agencies/pricing` and `/business/pricing`; `/pricing` redirects permanently to the agency one. |
| M5 | The switch on a pricing page goes to the other side's pricing page; elsewhere to the other side's first page. |
| M6 | Business menu: "What you get", "Sample brief", "Pricing". |
| M7 | Under the first screen `/` shows three things the site already has: the claim checks ("No evidence, no claim."), the live numbers, and the two doors again. |
| M8 | The gallery opens on Dashboard on `/` and `/agencies`, on Monday brief on `/business` (every business gets the brief; the dashboard is the agency's choice). It rests on the picture it opened on. |
| M9 | The rank map never plays by itself anywhere, `/sample-brief` and the client tour included: it opens on week 12 and plays on Play. |
| M10 | `/how-it-works` keeps intro, four steps, claim checks, FAQ and guides; it drops the week timeline, roles block, client tour, sample and recommendations board, and links to them. |
| M11 | The footer follows the side: agency-only links are not rendered on the business side; pricing links to the reader's own side, and to both (labelled) on `/` and both-reader pages. Its tagline is that side's hero eyebrow. |
| M12 | Gallery pictures come from a committed capture script; `sharp` 0.34.5 (already in the workspace) becomes a dev dependency of `@cs/site`, used by that script only. |
| M13 | Compare leaves the top menu; footer and in-text links stay. |
| M14 | `HERO.subNoWeb` goes: the new opening paragraph names no website tracking. |
| M15 | On the business side the tour shows one note line under the window in place of the numbered notes and their markers (those are written for agencies). |
| M16 | When the side chose the popup's step, the popup has no Back and no "Step 2 of 2": it is one step. Step 1 shows both prices, so Back would break goal 2. On `/` and both-reader pages the popup is unchanged. |
| M17 | `?join=business` always opens the waitlist (as today); `#join` follows the side. |

## 4. Sides and routes

The side is a property of the registered page, looked up by address. No prefix matching, so a mistyped address is `both` on the server and in the browser alike.

```ts
// content/pages.ts
side?: 'agency' | 'business'                 // on SitePage; absent = both readers; '/' is home
// shell/nav-items.ts (server-only)
export function sidePaths(): { agency: string[]; business: string[] }
// src/lib/side.ts — pure, no imports
export type Side = 'home' | 'agency' | 'business' | 'both';
export function sideOf(pathname: string, paths: { agency: string[]; business: string[] }): Side;  // '/' → home; listed → its side; else both
export function switchHref(pathname: string, to: 'agency' | 'business'): string;                   // M5
// shell/side-context.tsx ('use client'); the layout wraps the shell in it
export function SideProvider(props: { paths: { agency: string[]; business: string[] }; children: ReactNode }): JSX.Element
export function useSide(): Side              // sideOf(usePathname(), paths)
```
`side: 'agency'`: `/agencies`, `/agencies/pricing`, `/how-it-works`, `/partners`, `/roadmap`, `/compare` and its enabled rival pages, `/integrations` and its pages. `side: 'business'`: `/business`, `/business/pricing`. Plan pre-flight confirms the prerendered 404 hydrates without a mismatch.

| Path | Content |
|---|---|
| `/` | `HomeHero` (headline, doors, sample-brief link, gallery), `ChecksHub` (its default heading), `LiveCounters`, doors band. No `MobileCta`. |
| `/agencies` | Today's home in today's order, without `Cast`, `BeforeAfter` and `SampleSection`; `ClientView` gains one quiet button, `ChecksHub` a link to `/sample-brief`. |
| `/business` | `BusinessHero`, `RivalStory audience="business"`, `ClientView audience="business"`, `SampleSection`, `BusinessClose` (`id="join"`), `MobileCta`. |
| `/agencies/pricing` | Agency plan card, agency feature list, the four existing FAQ entries, `CtaBand`. |
| `/business/pricing` | Business plan card, business feature list, business FAQ, `BusinessClose`. |
| `/pricing` | `next.config.ts` `redirects()`: permanent → `/agencies/pricing`. Row and `src/app/pricing` removed; footer link repointed. |

Each new page is `src/app/<path>/page.tsx` + `opengraph-image.tsx` + a `PAGES` row (site spec § 7.3). `HOME_ANCHORS` loses `cast`, `before-after`, `sample`; the `SECTIONS` key type keeps `sample` (used on `/business`). `cast.tsx`, `before-after.tsx`, `CAST`, `BEFORE_AFTER` are deleted. In-text links to home sections become `/agencies#…`.

## 5. Interfaces

**Menus** (`content/pages.ts`, `shell/nav-items.ts`; client modules still never import the registry)
```ts
nav?: { label: string; order: number; side?: 'agency' | 'business' }           // menu it appears in; default 'agency'
NAV_EXTRA: readonly { label: string; href: string; order: number; side: 'agency' | 'business' }[]
export function navMenus(): { agency: NavLink[]; business: NavLink[] }           // replaces navItems()
interface NavLink { label: string; href: string; highlight?: boolean; side?: 'agency' | 'business' }  // footer filter (M11)
```
Labels per the deck; business hrefs `/business#client-view`, `/business#sample`, `/business/pricing`. `pages.test.ts` is rewritten for both: order per side; an extra's href is a registered path, optionally with `#anchor`.

**Header** `SiteHeader({ menus })`, `MobileMenu({ menus })`:

| Side | Shows |
|---|---|
| home | wordmark, Sign in |
| agency | wordmark, switch ("For agencies" current), agency menu, Sign in, join button |
| business | wordmark, switch ("For local businesses" current), business menu, Sign in, "Join the waitlist" |
| both | wordmark, switch (neither current), Sign in |

The switch is two links in `<nav aria-label="Audience">`; the current one has `aria-current="page"`. On phones it sits at the top of the menu sheet; on `both` pages (no sheet) it is a line under the header. It fits at 1024 px with the agency menu.

**Join:** `JoinButton` without `start` takes it from the side: agency → `'agency'`, business → `'business'`, home/both → `'choose'`; so does the `#join` link (M17). Business default label: "Join the waitlist" in both pilot states. `MobileCta` reads the side: on business, "Join the waitlist", start `'business'`, the business fine print.

**Headlines:** `headline: { lead: string; mark: string }` for all three heroes; `mark` is the underlined part and may be more than one word.

**Announcement bar**
```ts
export const ANNOUNCEMENT: Record<'home' | 'agency' | 'business', { text: string; link?: { label: string; start: JoinStart } }>
```
One fixed sentence; `both` uses `home`; hidden when the pilot is off, as now.

**Gallery** (`content/gallery.ts`, `components/home/hero-gallery.tsx`)
```ts
export type GallerySlideId = 'dashboard' | 'brief' | 'map' | 'ads' | 'friday';
export interface GallerySlide { id: GallerySlideId; label: string; alt: string; src: string; srcSmall: string; width: 1440; height: 900 }
export const GALLERY: { slides: readonly GallerySlide[]; dwellMs: 6000; caption: string; tablist: string; pause: string; play: string };
export function HeroGallery(props: { start?: GallerySlideId }): JSX.Element     // 'use client'
```
- Five tabs (`role="tablist"`, arrow keys), one picture, the caption.
- Plays once: from `start` through the other four, back to `start`, then stops for good. Choosing a tab stops it for good. Hover or keyboard focus inside holds it. A visible Pause button turns into Play (one more round).
- Reduced motion: never plays; no Pause/Play; tabs work.
- Only the current picture is in the page. The opening picture is eager with high fetch priority; the next is fetched shortly before it is due. Swap in place: no slide, no zoom, fade ≤ 150 ms. Fixed aspect ratio.
- Files `public/sample/gallery-<id>.webp` (1440×900) and `gallery-<id>-720.webp`, through `srcset`/`sizes`.
- `scripts/capture-gallery.mjs`, against a running build with Plan A in: `/agencies` at 1024 px wide, scale 1.5; hides `[data-note-mark]`; for each slide clicks its tab or menu item in the tour, clips `#client-view .product-frame` to 960×600 and writes both sizes with `sharp`. `hero-overview/-map/-friday.webp` and `home-counter.webp` are deleted once unused.

**Shared sections** (site-story D11 pattern)
```ts
RivalStory({ audience = 'agency' }: { audience?: 'agency' | 'business' })
ClientView({ heading, audience = 'agency' })      // business: own eyebrow, heading, body; M15
SampleSection()  ·  SampleBrief(...)              // autoplayMap removed from both (M9)
RankGrid({ data, onOpen, howHref, subject })      // autoplay removed; opens on the last week
```

**Pricing content** (`content/pricing-page.ts`): `PRICING_PAGE` becomes `{ agency, business }`, each `{ eyebrow, h1, lead, leadTrial, featuresHeading, faqHeading }`; `FEATURE_ROWS` unchanged, one column per side, rows whose cell for that side is `false` left out; `PRICING_FAQ` unchanged; new `BUSINESS_FAQ`. `PlanCards` splits into `AgencyPlanCard` and `BusinessPlanCard`; `data-slot` values and the pilot-off card wording stay.

**Home content** (`content/home.ts`): wording per the deck; `opportunityLine()` → `opportunityCells(): { value: string; label: string }[]` (four); the plan line → `planCells()` (three, same shape) plus `PRICING_LINES.lead` / `PRICING_LINES_TRIAL.lead`.

## 6. Layout (mockups 1–7; targets, tokens stay in `site.css`)

| Where | Change |
|---|---|
| Heroes | Headline 4.25rem / 1.02 / −0.04em, max 11.5em wide; phone 2.5rem, top padding 36 px, second button hidden. Radar rings at 55 % opacity, still. Gallery on the right; under the text on phones. |
| Sections | Vertical padding 72 px; headings 2.75rem / 1.08. |
| `#opportunity` | Heading and text side by side (gap 64 px); margin example as four cells. |
| `#friday` | The counter photo goes. About 570 px tall (from 1,062). |
| `#commercial` | Promises left, calculator in a 36rem column right (gap 88 px); plan line as lead + three cells. About 930 px (from 1,732). |
| `#client-view` | One quiet button under the tour. |
| Pricing cards | Chip beside the title (text contrast ≥ 4.5:1, measured), price 2.5rem + "/mo", note, tier rows. |
| `/agencies` | About 10,300 px at 1440 wide (from 15,610). |

## 7. Motion

Nothing moves unless the reader acts; the gallery, once, is the exception.

**Removed:** radar sweep and blips; photo-frame dot, sweep and ping; `.live-ping`; announcement rotation; checks-diagram moving dashes and pulsing "Verifying…" (still lines, fixed label); `Reveal`/`.reveal`, `.draw-line`, `.grow-bar`, `.grow-col`, `useCountUp`, with their CSS and keyframes; rank map autoplay; close-card tilt.
**Kept:** tab change fade (`reveal-quick`); rank map on Play; Friday typing after a question; recommendation card lift on hover; `.press`; phone bar slide-in.

## 8. SEO

New `PAGES` rows, titles ≤ 60 and descriptions ≤ 155 (deck). `/agencies` takes today's home title and description. Sitemap: `/` 1.0, `/agencies` and `/business` 0.9, pricing pages 0.8. `SoftwareApplication` JSON-LD (it carries both offers) on `/`, `/agencies`, `/agencies/pricing`, never on `/business*`; `FAQPage` on both pricing pages, equal to the visible questions. `llms.txt` intro per the deck.

## 9. Tests and gates

- Unit: `sideOf` (every registered path, one unknown); `switchHref`; `navMenus`; gallery with fake timers (plays once, stops on tab choice, holds on hover/focus, still under reduced motion); rank map opens on the last week and advances only on Play; registry (page + og image per row); join dialog per side.
- E2E: `/` doors; each side's headline, menu and button; popup step per side; `/pricing` redirects permanently; no `/business*` page or popup opened there contains an agency plan number, and `/agencies/pricing` has no business card; header fits at 1024 px on both sides; no overflow at 390 and 1024; 404 under `/agencies/…` shows the both-reader header with no console error; phone LCP ≤ 2.5 s and CLS ≤ 0.1 on `/`, `/agencies`, `/business` and both pricing pages (closes the 2026-11-07 backlog item).
- Gates: the site's standing checks and `bash scripts/design-lint.sh`; all copy signed by the owner once, at the end, in `pnpm copy:review` (site-story D10).

## 10. Left to the builder

File layout inside `components/home` and `components/pricing`; how the next gallery picture is fetched; the classes that reach the layout targets; shared hero markup.
