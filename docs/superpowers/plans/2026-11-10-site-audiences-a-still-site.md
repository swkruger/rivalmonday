# site-audiences, Plan A: a still, shorter site — implementation plan (lean)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Lean plan format (root `CLAUDE.md`): each task gives Goal, Files, Interfaces, Behaviour, Tests, Done when; the implementer writes the bodies.

**Goal:** Take the idle and scroll motion out of `apps/site`, shorten today's home page from about 15,600 px to about 10,300 px at 1440 wide, and land the approved copy on the sections that already exist.

**Architecture:** No new routes. Content keys change together with the component and test that read them, so every task leaves `typecheck` green. Where Plan B needs a final shape (`HERO.headline`, `ANNOUNCEMENT`, `HeroHeadline`), Plan A introduces it now. A source-scan test keeps removed motion from coming back.

**Tech stack:** `@cs/site` (Next 16 App Router, React 19, Tailwind 4, vitest, Playwright). No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-10-site-audiences-design.md` (§ 6 layout, § 7 motion, M9, M14) and the copy deck `2026-11-10-site-audiences-copy.md` (§ 1, § 3). Tasks cite the deck by section; the deck text is binding, word for word.

## Global constraints

- Work only in `E:/Claude Projects/CompetitorSpy-wt/site-audiences`, package `apps/site`. No DB, no migration, no env var, no file outside `apps/site`, `scripts/design-lint.sh` and `docs/`.
- Read `apps/site/CLAUDE.md` and `docs/gotchas-cross-cutting.md` before the first edit.
- Imports only from `@cs/ui` root. No `'use client'` module may import `content/pages`, `content/compare`, `content/integrations`, `content/sources`.
- Prices are never typed: every figure is computed from `content/pricing.ts` `PRICING`. `content.test.ts` "no digits in copy outside PRICING" must pass without a new allowlist entry.
- Site tokens live only in `src/app/site.css`. No hex, `rounded-[…]`, `text-[…px]` or shadow literal in a component. `cn()` never merges `text-display`, `text-display-sub`, `text-section`, `text-numeral`, `shadow-float` with colour or shadow classes.
- Orange stays on Friday, the Pilot pill and the headline underline. A new `bg-amber` file needs an `ALLOW_AMBER` entry.
- US spelling. No vendor names. Website tracking is not mentioned in any new line.
- Pages must prerender: no `cookies()`, no `headers()`.
- Implementers run focused tests only: `pnpm --filter @cs/site exec vitest run <files>`. No E2E before Task 8. Stop any `next dev`/`next start` of this worktree before running tests.
- Commits: on `site-audiences`, LF only, message ends with the `Co-Authored-By` line for the committing model.

## Decisions

Owner-approved: everything in spec § 3 (owner list) and deck lines marked `A`. My calls in this plan (the owner checks these):

- **PA1** Plan A already gives `HERO.headline` the shape `{ lead, mark }` and `ANNOUNCEMENT` its final three-entry shape; the bar shows the `agency` entry until Plan B picks by side.
- **PA2** A source-scan test (`src/no-idle-motion.test.ts`) bans the removed helpers and classes, and any `infinite` animation in `site.css`.
- **PA3** Section padding is 72 px from `lg` and 56 px below it (the spec gives the desktop value only).
- **PA4** Type tokens: `--text-display: clamp(2.5rem, 1.4rem + 3.2vw, 4.25rem)`; `--text-section: clamp(2rem, 1.4rem + 1.5vw, 2.75rem)`. Inner-page titles (`PageIntro`) use the same token and shrink with it.
- **PA5** The rank map's Play button keeps today's rule: pressed on the last week it starts again from week 1.
- **PA6** The quiet button under the client tour also shows on `/how-it-works` until Plan B removes the tour there.
- **PA7** The site E2E suite runs once at the end of this plan and once at the end of Plan B (the gallery pictures are taken from a Plan A build). The top-model review of the whole branch runs once, after Plan B.
- **PA8** The home page height is asserted at ≤ 11,500 px (target 10,300). If it comes out higher, the builder reports the per-section heights; no spacing hack.

## File structure

| File | Change |
|---|---|
| `src/no-idle-motion.test.ts` | new guard |
| `src/components/home/hero-headline.tsx` | new, shared h1 |
| `src/components/media/scan-frame.test.tsx` | new |
| `src/components/motion/in-view.tsx` | deleted (Task 2) |
| `src/components/home/cast.tsx`, `before-after.tsx`, `public/sample/home-counter.webp` | deleted (Task 4) |
| `content/home.ts`, `src/app/site.css`, `src/app/page.tsx` | changed in most tasks |
| `src/components/{home,client-view,sample,shell,media,guides}/*` | per task |
| `e2e/site.spec.ts`, `e2e/pages.spec.ts`, `apps/site/CLAUDE.md` | Task 8 |

## Dependencies on in-flight work

- `phase-18b` (SDD running): no overlap expected. Task 0 re-checks `git diff main...phase-18b --stat -- apps/site scripts/design-lint.sh packages/copy-review` prints nothing.
- No migration number is claimed.

## Review focus

Failure modes the spec implies but does not test. Each has its test in the owning task.

1. **Play on the last week.** The map now opens on week 12; Play must restart from week 1, not do nothing (Task 2).
2. **A map with one week of data.** Opens on it; Play neither throws nor stays stuck in "playing" (Task 2).
3. **Links to sections that left the page.** No link on the home page may point at an id the page no longer renders (Task 4).
4. **A 320 px phone.** The new headline with its unbreakable `mark` must not overflow (Task 8).
5. **Pilot off.** The new plan line and the new button under the client tour must show trial wording, never "Free during the pilot" (Tasks 6, 7).

---

### Task 0 — Pre-flight (controller, no product code)

- `git fetch`; `git rebase main`; run the in-flight check above. `pnpm install` if `node_modules` is missing.
- Baseline, all green before Task 1: `pnpm --filter @cs/site typecheck`, `pnpm --filter @cs/site test`, `bash scripts/design-lint.sh`. Record the test count in `docs/work/site-audiences.md`.
- Greps, results noted in the work file so implementers do not repeat them: users of `Reveal`, `useCountUp`, `useInView`, `draw-line`, `grow-bar`, `grow-col`, `live-ping`, `flow-dash`, `scan-`, `animate-`, `setInterval`, `autoplay`, `opportunityLine`, `PRICING_LINES`, `HOME_IMAGES.counter`, `subNoWeb`, `CAST`, `BEFORE_AFTER`, `ping` (prop of `SectionHeading`).
- Any `animate-spin`/`animate-pulse` that shows only while the reader waits for something they started (form submit, bot check) is listed as an allowed exception for Task 1, with its file.
- **Done when:** baseline green and the grep notes are committed in the work file.

### Task 1 — Scroll and idle motion out

**Goal:** Nothing fades in, draws, counts up, pulses or sweeps by itself. Content renders in its final state without JavaScript observers.

**Files:** create `src/no-idle-motion.test.ts`, `src/components/media/scan-frame.test.tsx`. Modify `src/app/site.css`, `src/components/motion/in-view.tsx`, `client-view/{client-view,ad-activity-chart,dashboard-mock}.tsx`, `home/{checks-diagram,close-band,sample-section,steps,section-heading,friday-row}.tsx` and any caller passing `ping`, `media/scan-frame.tsx`, `guides/guide-articles.tsx`, `src/app/guides/[guide]/page.tsx`; tests `client-view/client-view.test.tsx`, `home/sections.test.tsx`, `home/story.test.tsx`.

**Interfaces:**
- `in-view.tsx` exports only `useInView` after this task (`Reveal`, `useCountUp` gone).
- `SectionHeading({ section, body = true })` — `ping` prop and the `live-ping` span removed.
- `ScanFrame` loses the `blip` prop, the dot, the sweep and the ping. Mat, rings and tag stay.
- Guard: `const BANNED: readonly RegExp[]` and `const ALLOWED: Record<string, string>` (file → reason) in `no-idle-motion.test.ts`; later tasks append to `BANNED`.

**Behaviour:**
- `Reveal` wrappers are replaced by their children (keep any layout class the wrapper carried).
- Line chart renders drawn; bars and columns render at full size; stat cards show their final values on first render.
- Checks diagram: connector lines are still; the "Verifying…" label keeps its words and loses the pulse.
- Close card: no tilt, no hover rotation.
- `site.css`: remove `.reveal`, `.draw-line`, `.grow-bar`, `.grow-col`, `.flow-dash`, `.live-ping`, `.scan-sweep`, `.scan-blip` and their keyframes (`flow-dash`, `scan-ping`, `scan-spin`); prune the matching lines of the reduced-motion block. Keep `reveal-quick`, `.press`, `.rec-card`, sheet keyframes.
- Guard bans, as whole words in `src/**/*.{ts,tsx,css}` outside tests: `Reveal`, `useCountUp`, `draw-line`, `grow-bar`, `grow-col`, `live-ping`, `flow-dash`, `scan-sweep`, `scan-blip`, `scan-ping`, `animate-pulse`, `animate-ping`, `animate-bounce`, `animate-spin` (minus `ALLOWED` from Task 0).
- **Follow pattern:** `src/no-data-vendors.test.ts` for the scan.

**Tests (first):**
- `no-idle-motion.test.ts` "no source file uses a removed motion helper or class": offending `file: token` list equals `[]`.
- `scan-frame.test.tsx` "renders the picture, rings and tag and nothing that moves": img with the alt, tag text present, no class containing `scan-blip`, `scan-sweep`, `scan-ping`.
- `client-view.test.tsx` "stat cards show their final values on first render": values equal the content values with no `IntersectionObserver` stub firing.
- `sections.test.tsx` "the checks diagram shows every step in static markup": `renderToStaticMarkup` contains each step title and no `opacity-0`.
- `story.test.tsx` `CloseBand` "the card sits straight": no class containing `rotate`.

**Done when:** `pnpm --filter @cs/site exec vitest run src/no-idle-motion.test.ts src/components/media src/components/client-view src/components/home` and `pnpm --filter @cs/site typecheck` pass; `bash scripts/design-lint.sh` passes.

### Task 2 — The rank map plays only on Play (M9)

**Goal:** Every rank map opens on its last week and moves only when the reader presses Play.

**Files:** modify `src/components/sample/{rank-grid,sample-brief}.tsx`, `home/sample-section.tsx`, `src/app/page.tsx`, `src/no-idle-motion.test.ts`; delete `src/components/motion/in-view.tsx`; tests `sample/{rank-grid,sample-brief}.test.tsx`.

**Interfaces:**
```ts
RankGrid({ data, onOpen, howHref, subject })   // autoplay removed
SampleBrief(props)                             // autoplayMap removed
SampleSection()                                // autoplayMap removed
```

**Behaviour:**
- Initial `index` is `weeks.length - 1`. No observer, no `autoplayed` state.
- `toggle()` is unchanged: playing → pause; on the last week → back to week 1, then play to the last week and stop (PA5). Choosing a week on the slider or the bars stops playback.
- Applies to all three users: sample brief, rival story, client-tour dashboard (`client-view/dashboard-views.tsx`).
- Doc comment of `RankGrid` rewritten to say this. Guard `BANNED` gains `useInView`, `autoplay`, `autoplayMap`.

**Tests (first), in both describes of `rank-grid.test.tsx`:**
- "opens on the last week": slider value is `String(weeks.length - 1)`; caption is the last week's.
- "does not move by itself": fake timers, 60 s, slider value unchanged, no button named `Pause`.
- "Play restarts from week 1 and stops on the last week": click Play → value `'0'`; advance `STEP_MS × last` → value `last`, button named `Play all 12 weeks` again. (Review focus 1.)
- "choosing a week stops playback".
- "one week of data: shows it, and Play leaves it there": data with `weeks.slice(0, 1)`; no throw; after Play and 5 s the value is `'0'` and no `Pause` button remains. (Review focus 2.)
- `sample-brief.test.tsx`: drop `autoplayMap` cases; "the map opens on the last week".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/sample src/components/home src/components/client-view src/no-idle-motion.test.ts` and `typecheck` pass.

### Task 3 — Hero and announcement

**Goal:** The decided agency headline at the new size with a still radar, and one fixed announcement sentence.

**Files:** create `src/components/home/hero-headline.tsx`. Modify `content/home.ts`, `home/hero.tsx`, `shell/announcement-bar.tsx`, `src/app/site.css`, `src/no-idle-motion.test.ts`; tests `home/hero.test.tsx`, `home/hero-join.test.tsx`, `shell/shell.test.tsx`, `content/content.test.ts`.

**Interfaces:**
```ts
// content/home.ts
HERO.headline: { lead: 'Tell every client what their rivals did', mark: 'this week.' }
HERO.sub      // deck § 3; HERO.subNoWeb removed (M14)
HERO.heroCta: 'Get a free brief for one client'
export const ANNOUNCEMENT: Record<'home' | 'agency' | 'business', { text: string; link?: { label: string; start: JoinStart } }>
//   home: no link · agency: link start 'agency' · business: link start 'business' · wording: deck § 1
// components/home/hero-headline.tsx (server)
export function HeroHeadline({ headline }: { headline: { lead: string; mark: string } }): JSX.Element
```

**Behaviour:**
- `HeroHeadline` renders the one `<h1>`: `lead`, a space, then `mark` in a no-wrap span carrying the existing amber underline. Class `text-display`, `max-w-[11.5em]`.
- `site.css`: `--text-display` per PA4, line-height 1.02, letter-spacing −0.04em.
- Hero: phone top padding 36 px; the secondary button is hidden below `sm`; the radar is rings only at 55 % opacity (sweep, blips and `BLIPS` removed; use `RadarRings` if it draws the same rings). The hero no longer reads `WEBSITE_MONITORING_LIVE`.
- `site.css`: remove `.radar-sweep`, `.radar-blip` and their keyframes.
- Announcement bar: `ANNOUNCEMENT.agency.text` and its link (`open(link.start)`); no timer, no rotating word, no `data-testid="announcement-example"`; `data-slot="announcement-bar"` stays; still `null` when pilot is off; same height as before.
- Guard: `BANNED` gains `radar-sweep`, `radar-blip`, `announcement-example`; new assertions "`site.css` has no `infinite`" and "`@keyframes` names are a subset of `reveal-quick`, `sheet-in-right`, `sheet-in-bottom`".

**Tests (first):**
- `hero.test.tsx`: "headline is the decided lead and mark in one h1" (h1 text `Tell every client what their rivals did this week.`, mark span `this week.`); "sub is the decided line"; "primary button opens the join dialog on the sample start" (kept); "secondary button is hidden on phones" (`hidden` and `sm:inline-flex`); "the radar is still" (no element with a class containing `sweep` or `blip`); "exactly one h1"; "the pilot pill is the only orange fill"; "site-owned classes survive in the DOM".
- `shell.test.tsx`: "announcement shows one fixed sentence and the join link"; "announcement does not change over time" (fake timers, 30 s, same text); "pilot off hides the bar". The two rotation tests are deleted.
- `content.test.ts`: "hero matches the decided copy"; "headlines are at most 90 characters" reads `lead + ' ' + mark`; "announcement has the three decided entries".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/home src/components/shell content/content.test.ts src/no-idle-motion.test.ts` and `typecheck` pass.

### Task 4 — Section rhythm and a shorter home page

**Goal:** Tighter sections and headings; `Cast`, `BeforeAfter`, the sample section and the Friday counter photo leave the home page.

**Files:** modify `home/section-heading.tsx` and every `HomeSectionShell` caller that passes padding (`client-view/client-view.tsx`, `guides/guide-articles.tsx`, `home/{agency-ceiling,checks-hub,founder-note,friday-row,live-counters,opportunity,recommendations-section,rival-story,steps}.tsx`, `src/app/how-it-works/page.tsx`, `src/app/sample-brief/page.tsx`), `src/app/site.css`, `src/app/page.tsx`, `content/home.ts`; delete `home/cast.tsx`, `home/before-after.tsx`, `public/sample/home-counter.webp`; tests `home/{sections,story,friday-row}.test.tsx`, `content/content.test.ts`.

**Interfaces:**
```ts
HomeSectionShell({ id, labelledBy, className, pad = true, children })   // pad → 'py-14 lg:py-18'
// content/home.ts: SECTIONS loses 'cast' and 'before-after' (keeps 'sample'); CAST, BEFORE_AFTER, HOME_IMAGES.counter removed;
// HOME_ANCHORS loses 'cast', 'before-after', 'sample'
```

**Behaviour:**
- Callers drop `py-20 lg:py-28` and keep border and background classes. `founder-note` passes `pad={false}` and keeps its own `py-14`.
- `site.css`: `--text-section` per PA4, line-height 1.08.
- `/` order: `Hero`, `RivalStory`, `AgencyCeiling`, `Opportunity`, `ClientView`, `RecommendationsSection`, `FridayRow`, `ChecksHub`, `LiveCounters`, `Steps`, `Commercial`, `Testimonials`, `CloseBand`, `MobileCta`. `/how-it-works` keeps its `SampleSection` (Plan B removes it).
- `#friday`: the `ScanFrame` photo goes; text and chat use the freed width. Target about 570 px tall at 1440.
- Delete the image only after a grep shows no other reference.

**Tests (first):**
- `sections.test.tsx`: "section ids match HOME_ANCHORS" (new list); "the home page has no cast, before-after or sample section"; "no link on the home page points at an id the page does not render" (every `a[href^="#"]` and `a[href^="/#"]` except `#join` resolves to an element id; review focus 3); "has one h1 and no duplicate ids" (kept).
- `story.test.tsx`: the `Cast` and `BeforeAfter` describes are deleted.
- `friday-row.test.tsx`: "renders no picture".
- `content.test.ts`: "HOME_ANCHORS has no duplicates, ends with join" (kept); "lists … have the decided sizes" without the cast.

**Done when:** `pnpm --filter @cs/site exec vitest run src/components content/content.test.ts` and `typecheck` pass; `git grep -n "home-counter\|before-after\|CAST\b" -- apps/site` prints nothing.

### Task 5 — Ceiling heading; opportunity side by side with four cells

**Goal:** The new `#ceiling` heading, and `#opportunity` with heading beside text and the margin example as four labelled cells.

**Files:** modify `content/home.ts`, `home/opportunity.tsx`; tests `home/story.test.tsx`, `content/content.test.ts`.

**Interfaces:**
```ts
SECTIONS.ceiling.heading                       // deck § 3
OPPORTUNITY.exampleLabel: 'For example'
export function opportunityCells(e = opportunityExample()): { value: string; label: string }[]   // replaces opportunityLine()
// [`${clients} clients`, `at ${usd(clientPriceUsd)}/mo each`], [usd(revenueUsd), 'revenue a month'],
// [usd(costUsd), 'platform cost'], [usd(marginUsd), 'margin a month']
```

**Behaviour:**
- From `lg`: heading in the left column, section body in the right, gap 64 px. **Follow pattern:** the 5/7 grid in `home/agency-ceiling.tsx`. The three outcomes stay as a row under it.
- Example strip: the label, then a `<dl>` of four cells (two per row on phones, four from `md`), value in semibold `tabular-nums`, label small and secondary. The note and the `/partners` link stay under the cells.
- `opportunityLine` is removed everywhere (Task 0 grep).

**Tests (first):**
- `story.test.tsx` `Opportunity`: "shows the example as four labelled cells" (four `dt`/`dd` pairs equal to `opportunityCells()`; label `For example` present); "keeps the note and the link to /partners".
- `content.test.ts`: "opportunity cells are computed from PRICING" (values equal the `usd`-formatted fields of `opportunityExample()`; margin = revenue − cost); "ceiling heading is the decided line".

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/home/story.test.tsx content/content.test.ts` and `typecheck` pass.

### Task 6 — `#commercial` in two columns with plan cells

**Goal:** Promises left, calculator right, the plan as a lead line and three cells. Target about 930 px tall at 1440 (from 1,732).

**Files:** modify `content/home.ts`, `home/commercial.tsx`; tests `home/{story,sections}.test.tsx`, `content/content.test.ts`.

**Interfaces:**
```ts
export const PRICING_LINES = { strong: 'Free during the pilot.', lead: `Then one plan, with a ${agency.trialDays}-day trial:` } as const;
export const PRICING_LINES_TRIAL = { lead: `One plan, with a ${agency.trialDays}-day free trial:` } as const;
export function planCells(): { value: string; label: string }[]   // three, deck § 3 "Plan line"; every number from PRICING.agency
COMMERCIAL.points[0].body                                         // 'colours' → 'colors'
```

**Behaviour:**
- From `lg`: two columns, gap 88 px. Left: the three points, heading over body. Right: `MarginExample` in a column at most 36rem wide.
- Under both, full width: `data-slot="plan-line"` holding the lead (`strong` in bold first when pilot is on) and the three cells as a `<dl>`; then the roadmap line.
- Phones: points, calculator, plan line, roadmap line, in that order.
- **Follow pattern:** cell markup from Task 5.

**Tests (first):**
- `story.test.tsx` `Commercial`: "shows the three points, one calculator and the roadmap link" (`[data-slot=margin-example]` count 1); "pilot on: the plan line starts with the pilot lead and holds the three cells"; "pilot off: the trial lead and no pilot wording" (`[data-slot=plan-line]` does not contain `Free during the pilot`; review focus 5).
- `sections.test.tsx`: "pilot on: pilot wording and the pilot plan line" and "pilot off: trial wording everywhere" updated to the new keys; "never shows the local-business price" kept.
- `content.test.ts`: "plan cells are computed from PRICING" (each `planCells()` value contains the formatted `PRICING.agency` figure it stands for).

**Done when:** `pnpm --filter @cs/site exec vitest run src/components/home content/content.test.ts` and `typecheck` pass.

### Task 7 — Remaining copy and the two small additions

**Goal:** The rest of deck § 3, a quiet button under the client tour, and a link from the claim checks to the sample brief.

**Files:** modify `content/home.ts`, `client-view/client-view.tsx`, `home/checks-hub.tsx`; tests `home/{sections,story}.test.tsx`, `client-view/client-view.test.tsx`, `content/content.test.ts`.

**Interfaces:**
```ts
SECTIONS.recommendations.heading / .body, HOW_STEPS[3].title, CTA_BAND.heading / .body   // deck § 3
export const CHECKS_SAMPLE_LINK = { label: 'Open the sample brief →', href: '/sample-brief' } as const;
```

**Behaviour:**
- `ClientView`: under the tour, one `JoinButton` in the quiet (ink ghost) style, `start={HERO.primaryStart}`, label `HERO.heroCta`, wrapper `data-slot="client-view-cta"`. Pilot off: the join button's own label and link. **Follow pattern:** the hero's primary button (`home/hero.tsx`, `hero-join.test.tsx`).
- `ChecksHub`: `CHECKS_SAMPLE_LINK` is always shown; `hideLink` still hides only `CHECKS_LINK`.

**Tests (first):**
- `client-view.test.tsx`: "the tour ends with the quiet brief button" (name `Get a free brief for one client`; click calls `open('agency-sample')`); "pilot off: that button is the sign-up link with the join button's own label" (review focus 5).
- `sections.test.tsx`: "the claim checks link to the sample brief" (href `/sample-brief`), also with `hideLink`; "the fourth step is 'The brief lands on Monday'".
- `story.test.tsx`: `CtaBand` heading `Try it on one client, free.`; recommendations heading `Every rival move comes with a next step.`
- `content.test.ts`: keys equal the deck lines.

**Done when:** `pnpm --filter @cs/site exec vitest run src/components content/content.test.ts` and `typecheck` pass.

### Task 8 — E2E and gates for Plan A

**Goal:** Prove the home page is still, shorter and intact on phone and desktop.

**Files:** modify `e2e/site.spec.ts`, `e2e/pages.spec.ts`, `apps/site/CLAUDE.md` (two gotcha lines: the motion guard; `HomeSectionShell` owns section padding), `docs/work/site-audiences.md` (measurements).

**Behaviour / tests:**
- `site.spec.ts` "home renders the decided headline": the new h1 text.
- `site.spec.ts` sample test: the "stop the first-view autoplay" step is removed; the slider starts on its last value.
- New `site.spec.ts` "nothing on the home page moves by itself" (desktop): load `/`, scroll to the bottom and back, wait 1 s; `document.getAnimations().filter((a) => a.playState === 'running')` is empty.
- New `site.spec.ts` "the hero fits a 320 px phone": viewport 320×640; `overflow(page)` is false; the h1's right edge is inside the viewport; the secondary button is not visible (review focus 4).
- New `pages.spec.ts` "the home page is shorter" (desktop, 1440): `document.documentElement.scrollHeight` ≤ 11,500; the value and each section's height are logged and copied into the work file (PA8).
- Existing overflow, CSP, structured-data and vitals tests stay as they are and must pass.

**Done when (controller, once, in this order):** `pnpm --filter @cs/site typecheck` · `pnpm test:affected` · `pnpm --filter @cs/site lint` · `bash scripts/design-lint.sh` · `pnpm --filter @cs/site build` then `check:bundle` and `check:placeholders` · `pnpm --filter @cs/site e2e` (both projects). `git ls-files --eol | grep crlf` prints nothing. Then Plan B Task 0.
