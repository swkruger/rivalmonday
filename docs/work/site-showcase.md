# site-showcase — marketing site: show the product (client view, richer evidence, map story)

**Kind:** polish   **Worktree:** ../CompetitorSpy-wt/site-showcase   **Base:** main @ e12705c8
**Plan/spec:** none (owner's direct design brief, 2026-10-29; audit + plan below)

## Status (overwrite)
Implemented and unit-tested (`@cs/site` vitest all green). Site Playwright run pending/see last session. Not committed until the owner reviews.
Copy changed in ledgered files (`content/home.ts`, `content/client-view.ts`, `content/testimonials.ts`, `sample-brief.json`, new `.tsx`): needs `pnpm copy:review` sign-off.

## Next (overwrite)
Owner: review in the browser (`npx next dev -p 3011` in `apps/site`), sign copy in `pnpm copy:review`, decide the open questions below; then commit + `/rm-merge`.

## Brand lock (unchanged)
Wordmark `rivalmonday` (rival #2A6BAC, monday #F5A524); primary #47A8E7 with ink #0B2540 label; secondary #2A6BAC; accent #F5A524 only for Friday + the Pilot pill; ink #0B2540; canvas #F6F9FC; panels #EEF2F6; Inter; max 1560px; design system v1 (white sheet, sections before cards, shadows only on floating layers, chart roles you/2 rivals/grey). Voice: plain, specific, evidence-first ("No evidence, no claim"), no hype.

## What changed
- **New section "What your clients see"** (`components/client-view/`, data `content/client-view.ts`): tabs Dashboard / Monday brief / Friday in a window frame. Dashboard mirrors the app's client overview (KPIs count up, pressure bars grow, ad-activity line chart draws in with hover + table). Brief = the email in the agency's name. Friday = cited answer with numbered sources. Agency brand shown as "Your logo"/"Your agency" slots; test asserts no "Rival Monday" inside.
- **Evidence sheet** rewritten: kind header + tier; "The claim this backs" + "Matches the evidence"; per kind: website before→after diff + page sketch, ad rendered as a Meta-style ad with a generated creative, rank = earlier vs this week meters (rival) or mini map (you); 4-step trail Captured→Compared→Checked→Briefed.
- **Map rankings**: new `rank-map.tsx` over a generated fictional town map (`public/sample/marlowemere-map.webp`); grid starts at week 1 (only the office point top 3), autoplays once on view (not under reduced motion), play/pause, weekly top-3 bars. Data: `sample-brief.json` rankGrid + "You:" summaries regenerated centre-out (1 → 42 of 49; final week kept at 42 so Friday's cited figure holds). `rank-story.test.ts` pins the shape.
- **Hero**: shorter headline, sub, "Join the free pilot", secondary is a text link to the tour; snapshot fragment → map fragment; Friday fragment only from `xl`.
- **Sample brief**: brief column ≤ 3xl beside a sticky map from `lg`; tier marks on rivals.
- Motion: `components/motion/in-view.tsx` (`useInView`, `Reveal`, `useCountUp`) + site.css `.reveal/.draw-line/.grow-bar/.flow-dash/.press`; all off under reduced motion; reveal never hides content without JS.
- Phones: sticky join bar after the hero (hides at `#join`); menu button 44px.
- Checks hub: capped width, animated evidence flow on connectors.
- `content/testimonials.ts` empty slot; section renders nothing until filled.
- Images (OpenRouter `openai/gpt-image-2.5-sunburst`, ≈ $0.06): map 54 KB, two ad creatives 61/22 KB WebP; fixed width/height, lazy except the hero map.
- **Pass 2:** tour notes ("What to notice", 3 per tab) with matching numbered `NoteMark`s in each mock; hero proof row (`HERO.proof`, restates existing claims); Friday row dock is a live `FridayPanel` (`initialId` opens on a full answer); real-sample section gets a "Where you stand" preview card (decorative, sample figures); pricing = two plan blocks with large prices, no button; closing band is ink with the town map as texture + fine print; every join CTA reads "Join the free pilot"; citation pills are distinct ("Map scan, Oct 13", "Meta ad: <headline>").
- **Pass 3:** hero map card (`home/hero-map-card.tsx`) replays the 12 scans centre-out once in view (cells hidden via `.hero-map` until the first frame, so no end-state flash; reduced motion / no `matchMedia` → latest scan); Friday hero card desktop-only (`xl`); claim-check diagram tiles widened (fixes the overflowing "Google Ads Transparency Center" label); "Join the free pilot" also on /pricing, /partners and the announcement bar; footer tagline (`HERO.eyebrow`) and no gap under the ink band (`main:has(#join) ~ footer`); print rule; brief-email note marker moved out of its `<ol>` (axe). axe WCAG 2.1 AA on home: only the wordmark's orange "monday" (logotype, exempt; brand-locked).

- **SEO pass:** keyword-led titles in `content/pages.ts` (≤ 60, short `crumb`s kept); generated `app/icon.tsx`, `app/apple-icon.tsx` (`renderIcon` in `lib/og.tsx`, "rm" in wordmark colours), `app/manifest.ts`, `viewport.themeColor`, `lang="en-US"`; JSON-LD graph with `@id`s (`Organization` + logo/description, new `WebSite`, `SoftwareApplication.publisher`); sitemap drops build-time `lastmod`; internal links: brief kind tags → `/sources/*`, rank map → `/sources/local-map-rankings`, home sample → `/sample-brief` (`lib/source-links.ts`, server-side; props into client components). Tests: `lib/seo-basics.test.ts`, sitemap, json-ld. Playwright not re-run after this pass (another session's headless Chrome held the guard); unit 49/49, build + HTTP crawl verified.

- **SEO content:** `/for` + `/for/{hvac,plumbing,dental}` (FAQPage), `/guides` + 3 guides (Article JSON-LD; map guide shows sample week 1 vs 12), source pages gain `SOURCE_DEPTH` (why it matters, FAQ, guide link); integration details `noindex` + out of sitemap; footer columns Industries/Guides; announcement-bar trade word links to its industry page. Sitemap 26 → 25 indexable URLs (−9 integration details, +8 new). `check:bundle` ok.

## Open questions (owner)
1. Sign the new hero headline/sub/CTA wording (or keep the old headline).
2. Fictional KPI/pressure/rating/ad-count numbers in `content/client-view.ts` are invented sample data (labelled). OK?
3. Testimonials: supply real pilot quotes with permission, or leave the slot empty.
4. Re-running `export:sample-brief` overwrites the hand-tuned rank story (`rank-story.test.ts` fails, by design): re-run `apps/site/scripts/sample-rank-story.mjs` (or port it into `@cs/demo`).

## Interfaces this branch adds or changes
Site only. `HOME_ANCHORS` gains `client-view` (first). `weekStats` moved to `components/sample/rank-map.tsx` (re-exported from `rank-grid.tsx`). `AdView` takes `advertiser`. Hero fragment `data-fragment="snapshot"` → `"map"`.

## Assumes from other branches
None.
