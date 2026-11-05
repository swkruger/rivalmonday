# site-story — implementation plan (lean)

**Goal:** turn `/` on rivalmonday.com into the approved 11-section story (agency = hero, client = second hero, Rival Monday = guide), and raise the direct client price to $249, reusing the existing demos.

**Spec:** `docs/superpowers/specs/2026-11-04-site-story-design.md` (decisions D1–D12, design plan § 2, interfaces § 3, **decided copy § 4: verbatim**). Brief: `docs/work/site-story.md`.

## Global constraints
- `apps/site` only (+ `docs/DEPLOY.md`, `docs/STAGING.md` price notes). Read `apps/site/CLAUDE.md` and `docs/gotchas-cross-cutting.md` first.
- Only `@cs/ui` from the workspace; tokens from `site.css`; no hex / `text-[…px]` / `rounded-[…]` / shadow literals (`bash scripts/design-lint.sh`); site keys never inside `cn()` with a colour/shadow class; amber only for Friday + Pilot pill.
- Pages prerender; hero stays server-rendered (LCP). New client components only where state is needed (§2).
- All copy in `content/home.ts`, verbatim from spec § 4; figures interpolated from `PRICING` / `partnerExample`, never typed.
- Website wording only through `WEBSITE_MONITORING_LIVE` (D5). Roadmap wording is planned work, never a claim.
- Link labels follow the site's existing style (trailing " →" on text links, as `CHECKS_LINK`).
- `/how-it-works` must render exactly as today (shared components get opt-out props with today's defaults).
- Test scope: implementers run focused vitest (`pnpm --filter @cs/site exec vitest run <files>`); no reviewer test runs; `pnpm test:affected` + site e2e once at final review. Stop your own `next dev` before vitest (hook).
- Never commit `apps/site/next-env.d.ts` changes. LF only.

## Decisions
D1–D12 (spec § 1). Not re-opened.

## File structure
- Modify: `apps/site/src/lib/env.ts`, `src/lib/env.test.ts`, `content/home.ts`, `content/content.test.ts`, `src/app/page.tsx`, `src/components/home/{hero,mobile-cta,steps,recommendations-section,checks-hub,sections.test,hero.test}.tsx`, `e2e/site.spec.ts`, `docs/DEPLOY.md`, `docs/STAGING.md`.
- Create: `src/components/home/{rival-story,agency-ceiling,opportunity,cast,before-after,commercial,close-band}.tsx` + `story.test.tsx`.
- Delete: `src/components/home/pricing-teaser.tsx`, `src/components/home/real-sample.tsx` (+ `real-sample.test.tsx`, pricing-teaser cases in `sections.test.tsx`), `PRICING_HEADING_TRIAL` and `SECTIONS.pricing`/`real-sample`/`guides` if nothing else imports them (grep first).

## Dependencies on in-flight work
None (no unmerged branches; `staging-worker` is an ancestor of main). Re-check in Task 0.

## Review focus
1. Copy is verbatim from spec § 4 and every figure is computed. 2. No website wording when `WEBSITE_MONITORING_LIVE = false`. 3. `/how-it-works` unchanged. 4. Design plan § 2: one showpiece (§2), no card kits, no new motion, no eyebrows on new sections. 5. Accessibility: one h1, h2 per section with `aria-labelledby`, §7 contrast readable as text order, focus visible, reduced motion respected by the replay. 6. LCP: hero unchanged in weight.

---

### Task 0 — Pre-flight
- `git rebase main`; `git branch --no-merged main` (expect only `site-story`); re-read the brief's reuse paths still exist.
- **Done when:** clean rebase; notes added to the work file only if something moved.

### Task 1 — Direct client price $249 (D4, D9)
**Files:** `src/lib/env.ts`, `src/lib/env.test.ts`, `docs/DEPLOY.md:83`, `docs/STAGING.md:240`.
**Interfaces:** `export const DEFAULT_CLIENT_PRICE_USD = 249;`
**Behaviour:** env override still wins; docs say the default is 249 and Vercel should leave the var unset (or 249). Tests that mock `clientPriceUsd: 99` keep their mock (they test interpolation, not the default).
**Tests:** `env.test.ts` default = 249; override still parsed.
**Done when:** `vitest run src/lib/env.test.ts src/components/join content/pricing-page.test.ts` passes.

### Task 2 — Home copy module (spec § 3–4)
**Files:** `content/home.ts`, `content/content.test.ts`.
**Interfaces:** exactly spec § 3 (`HERO` keys, `HOME_ANCHORS`, new `SECTIONS` ids + `checks.homeHeading`, `RIVAL_STORY`, `rivalStoryMoves(live)`, `CEILING_LINES`, `OPPORTUNITY`, `opportunityExample()`, `CAST`, `BEFORE_AFTER`, `COMMERCIAL`, `CLOSE`, `CLOSE_TRIAL`). `SECTIONS['client-view'].heading` per § 4.
**Behaviour:**
- `rivalStoryMoves(live)` reads `CLIENT_VIEW.alerts`, sorts ascending by `date`, drops alerts whose `SAMPLE.evidence[id].kind === 'snapshot'` when `!live`. (Import `SAMPLE` from `src/sample/schema` — check content modules may import it; if the client boundary forbids, pass `kindOf` in from the component.)
- `opportunityExample()` = `partnerExample(OPPORTUNITY.example.clients, OPPORTUNITY.example.clientPriceUsd)`; a formatter `opportunityLine(e)` fills the § 4 sentence with `en-US` currency, no cents.
- Keep `RECOMMENDATIONS_ROADMAP` (used by `/how-it-works`). Remove home-only keys per File structure after grep.
**Tests (first):** `rivalStoryMoves(false)` has 2 items, none `e3`; `(true)` has 3, ascending; `opportunityExample()` = `{ revenueUsd: 3980, costUsd: 1912, marginUsd: 2068 }`; `opportunityLine` contains "$2,068"; `HERO.subNoWeb` and `RIVAL_STORY.bodyNoWeb` don't match `/price|\$69|website|snapshot/i`; `HOME_ANCHORS` has no duplicates and ends with `'join'`.
**Done when:** `vitest run content/content.test.ts` passes; `tsc --noEmit -p apps/site` clean except callers fixed in later tasks (note them).

### Task 3 — Hero + mobile bar (D1)
**Files:** `hero.tsx`, `mobile-cta.tsx`, `hero.test.tsx`, `e2e/site.spec.ts` (headline test).
**Behaviour:** H1/sub from `HERO` (`sub` when `WEBSITE_MONITORING_LIVE`, else `subNoWeb`; read the constant server-side). Primary `JoinButton start="agency-sample"`; secondary link unchanged in style, new label. Mobile bar uses the same label + start. Layout, images, proof row unchanged.
**Tests:** h1 text = D1; primary click opens the join dialog on the agency step with the sample box ticked (follow the existing `agency-sample` test pattern in `join-dialog.test.tsx`); sub has no "changing prices" while the flag is false.
**Done when:** `vitest run src/components/home/hero.test.tsx` passes.

### Task 4 — §2 rival story (the showpiece)
**Files:** create `rival-story.tsx`; tests in `story.test.tsx`.
**Interfaces:** `export function RivalStory(): JSX.Element` (`'use client'`), section `id="rival-story"`.
**Behaviour:** layout per spec § 2 wireframe: `RankGrid data={SAMPLE}` (wide column, `lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`), right column H2 + body (`live` variant) + `logHeading` + an `<ol>` of `rivalStoryMoves(live)` rows (date in the viewer-neutral `Oct 7` form, title as a button opening `EvidencePanel`), caption, closing line. `howHref="/sources/local-map-rankings"`. Follow `friday-row.tsx` for the `EvidencePanel` open/return-focus pattern. Surface background, no `Reveal`.
**Tests:** renders the H2 and RankGrid's slider; 2 moves while flag false; clicking a move opens the evidence dialog and Escape returns focus.
**Done when:** `vitest run src/components/home/story.test.tsx` passes.

### Task 5 — §3 ceiling, §4 opportunity, §5 cast, §7 before-after
**Files:** create `agency-ceiling.tsx`, `opportunity.tsx`, `cast.tsx`, `before-after.tsx`; extend `story.test.tsx`.
**Behaviour:** server components, `HomeSectionShell` + `SectionHeading`, backgrounds per spec § 2.
- Ceiling: `<ul>` of 3, each `<b>` lead + body, hairline `border-t border-line` between, closing line below in `text-ink`.
- Opportunity: body, 3 outcome columns (`md:grid-cols-3`, `border-t-2 border-secondary pt-5` like `Steps` minus numerals), then a `bg-muted-surface rounded-lg p-6` strip with `opportunityLine()` (tabular numerals) + `exampleNote` + link to `/partners`.
- Cast: 3 columns; Friday column leads with `FridayAvatar` (amber allowed); Monday and Rival Monday text only (no fake logos).
- Before-after: a `<table>` (caption = H2 text, visually hidden) with row headers "Your client" / "Your agency" and column headers Before / After; Before cells `text-ink-secondary`, After cells `text-ink font-medium`; stacks to two `<dl>`-like blocks under `md` (CSS only, same markup).
**Tests:** each renders its H2 and items from content; opportunity strip shows "$2,068"; before-after table has 2 row headers and 2 column headers.
**Done when:** `vitest run src/components/home/story.test.tsx` passes; `bash scripts/design-lint.sh` clean.

### Task 6 — §10 commercial, §11 close, shared opt-outs
**Files:** create `commercial.tsx`, `close-band.tsx`; modify `steps.tsx`, `recommendations-section.tsx`, `checks-hub.tsx`; delete `pricing-teaser.tsx`, `real-sample.tsx` + their tests (move still-valid assertions into `story.test.tsx`).
**Interfaces:** `Steps({ industries?: boolean })`, `RecommendationsSection({ roadmap?: boolean })`, `ChecksHub({ hideLink?, heading?: string })` — defaults keep `/how-it-works` identical. `Steps` also takes `afterSteps?: string` for the §9 line (home passes it).
**Behaviour:**
- Commercial (`id="commercial"`, `'use client'` only if pilot mode is needed for the plan line — reuse `usePilot`): heading, 3 points in the `/partners` two-column row style (`partners/page.tsx`), plan line, `MarginExample` (unchanged), roadmap line + link, all from `COMMERCIAL`.
- Close (`id="join"` on `InkBand`, keeps `#join` deep link working): centred heading/body/button (`start="agency-sample"`), fine print (`HERO.finePrint` / `finePrintTrial`), the `REAL_SAMPLE_PREVIEW` card from `real-sample.tsx` beside it from `lg` (white sheet, `shadow-float` — a floating layer), then `<FounderNote />` after the band (renders nothing while `null`).
**Tests:** `#join` exists once; close button opens agency-sample; commercial shows the agency plan line and no local-business price; `/how-it-works` test in `sections.test.tsx` still passes unchanged (industries + roadmap present there).
**Done when:** `vitest run src/components/home` passes.

### Task 7 — Assemble the page
**Files:** `src/app/page.tsx`, `sections.test.tsx`, `e2e/site.spec.ts`.
**Behaviour:** order: `Hero, RivalStory, AgencyCeiling, Opportunity, Cast, ClientView, RecommendationsSection roadmap={false}, FridayRow, BeforeAfter, ChecksHub heading={SECTIONS.checks.homeHeading}, SampleSection, LiveCounters, Steps industries={false} afterSteps=…, Commercial, Testimonials, CloseBand, MobileCta`. Update the order comment. No `GuideArticles` on home.
**Tests:** home `section[id]` order equals `HOME_ANCHORS` (live hidden when status null — keep the existing handling); one h1; no duplicate ids; no "$249" / local-business price on home; e2e headline = D1 and `#join` deep link opens the dialog.
**Done when:** `vitest run src/components/home src/app` passes; `pnpm --filter @cs/site lint` and `tsc` clean.

### Task 8 — Visual critique pass (frontend-design)
- `npx next dev -p 3011` in `apps/site`; screenshot `/` at 1440×900 and 390×844 (Playwright script in the scratchpad, not committed); check against spec § 2: one showpiece, background rhythm, no horizontal scroll at 390, focus rings, reduced-motion replay static. Remove one accessory if anything competes with §2. Fix, re-shoot once. Stop the dev server (kill the 3011 listener).
- Retake the hero collage only if the tour sample changed (it doesn't here).
- **Done when:** screenshots reviewed, fixes committed, `design-lint.sh` clean.

### Task 9 — Owner steps (not agent work)
- Commit main's pending `docs/copy/signoff.json` lines, then on this branch: `pnpm copy:review` (site surface) → sign the changed/new home strings → `copy:status --prune`.
- Vercel (staging + prod `@cs/site`): `NEXT_PUBLIC_CLIENT_PRICE_USD` unset or 249.
- Founder note (D8) when ready; the prod site deploy waits for it.

### Task 10 — §2 shows the rival's own map (owner decision 2026-11-04, spec D13)
**Goal:** §2's replay shows **Quillstone Climate Pros'** map rankings climbing from 8 to 31 top-3 points, not Northwind's own grid (which contradicts the copy).
**Files:** create `apps/site/scripts/rival-rank-story.mjs`, `apps/site/content/rival-grid.json`, a pinning test (next to `src/sample/rank-story.test.ts`); modify `src/components/sample/rank-grid.tsx` (+ `rank-map` if colours live there), `rival-story.tsx`, `content/home.ts` (`RIVAL_STORY.gridTitle`), `story.test.tsx`.
**Interfaces:**
- `rival-grid.json`: `{ rivalId: 'r1', weeks: { weekOf: string; ranks: (number | null)[] }[] }` — same 12 `weekOf`s as `sample-brief.json` `rankGrid.weeks`, 49 cells each.
- `RankGrid` gains optional `subject?: { title: string; ranks: (weekOf: string) => (number | null)[]; tone: 'rival' }`. Default (absent) = today's behaviour byte-for-byte (every other caller unchanged).
- `RIVAL_STORY.gridTitle` = `Quillstone Climate Pros' map rankings for “{keyword}”` (keyword from the sample; new string, owner signs in Task 9).
**Behaviour:**
- Script mirrors `scripts/sample-rank-story.mjs` (seeded, deterministic): the rival's strength spreads from its own base (an off-centre point, e.g. row 1 col 5) towards Northwind's ringed centre; top-3 counts per week: week 1 (2026-08-04) = 8, monotone non-decreasing (±1), weeks 2026-10-13 and 2026-10-20 = 31. Output committed; never generated at runtime.
- With `subject`: heading = `subject.title`; the "ringed point is Northwind…" line stays (the ring = the client being squeezed); the summary line computes from the rival's ranks ("Top 3 in 31 of 49 points, up from 8 in week 1"); per-week leader text and the rank-evidence chips (they describe Northwind's scans) are hidden; table alternative uses the rival ranks.
- Colour: rival tone uses the chart rival-1 role (`--chart-rival-1` token, via existing `@cs/ui` colour classes; tints by opacity utilities, no hex) for the rank buckets, legend matching; check contrast of the rank numerals with the dataviz skill's rules (numerals readable on every bucket). Ring stays as today.
- Reduced motion and autoplay unchanged.
**Tests (first):** script output pinned (week1 top3 = 8, 10-13 and 10-20 = 31, monotone ±1, 49 cells × 12 weeks); `RankGrid` without `subject` renders as before (existing tests green); with `subject` shows the title, "31 of 49" on the last week, no leader/evidence chips; `RivalStory` uses it.
**Done when:** `vitest run src/components/sample src/components/home src/sample content`, `tsc`, `design-lint` clean; one 1440 + 390 screenshot of §2 reviewed (scratchpad).

### Task 11 — Component styling from the owner's design canvas (owner decision 2026-11-04, spec D14)
**Goal:** restyle existing home components after the owner's canvas "Rival Monday — homepage redesign" (local copy: the `Main.dc.html` path given in the dispatch). Styling only: **no section, layout, order, copy or content change; nothing removed, moved, reworded or replaced.**
**Files:** modify `apps/site/src/app/site.css` (new site tokens/classes only), home components under `apps/site/src/components/home/`, `client-view/`, `sample/` (chrome only), `join/join-button.tsx` (variant styling), `scripts/design-lint.sh` (`ALLOW_AMBER` entries with reasons), `apps/site/CLAUDE.md` (orange rule). Never `@cs/ui`.
**Interfaces / styling map (canvas → site):**
- Type: `--text-display` → clamp(3rem, … , 6rem), line-height .96, letter-spacing -0.045em, weight 700, `text-wrap: balance`; `--text-section` → clamp(2.125rem, …, 3.5rem), lh 1.04, ls -0.035em. Large figures `tabular-nums`.
- Hero H1: an orange hand-drawn underline (inline SVG path, `aria-hidden`) under the last word "watching?" — text unchanged, the word stays in the heading's colour or amber per canvas (`amber`).
- Buttons on ink: primary 12 px radius, 16/24 padding, primary glow shadow (site token `shadow-glow`); secondary/ghost: 1 px white/18 % border, 12 px radius, white text, hover white/8 %. Hero CTAs get the canvas's trailing arrow icon (primary →, "See what your clients get" ↓), `aria-hidden`.
- Cards and frames: 14 px radius for content cards, 18–24 px for product frames; hairline `border-line`; product frames (client view, sample brief, close preview card) get the canvas's browser chrome (3 grey dots + centred title pill using the frame's existing title text, or no pill if none) and the large floating shadow (`shadow-frame` token). Link cards: hover lift (translateY(-3px) + deeper shadow), user-triggered only.
- Chips/badges: 5–6 px radius, tinted fills: info `primary-tint` (#E3F2FC) + #1F5F8F text, high `danger` tint + `danger-text`, good `success` tint + `success-text`, watch `warning-surface` + `warning-text`, neutral `muted-surface` + slate. "Recommended" callouts: `warning-surface` box, 12 px radius, `amber-text` text.
- Numbered markers (How it works step numbers, any existing 1/2/3 sequence markers): orange circle (`amber` fill, `amber-text` numeral, 32 px).
- Tabs (client-view tab list): segmented control — 5 px padded track, 14 px radius; active tab `primary` fill with ink label; 44 px min height.
- Ink bands (hero, close): keep `.night-map` + veils (owner: keep the blue map background); add only in the hero a slow radar sweep (conic gradient, 9 s) + 2–3 pulsing amber blips + concentric rings at low opacity, `aria-hidden`, `pointer-events: none`, removed under `prefers-reduced-motion`. No other autoplay motion (no floating cards, no marquee).
- Out of scope: the rank grid cells and chart colours (validated data-viz palette, chart roles), eyebrow labels (owner: none), any new section.
**Behaviour:** every colour via tokens (add site tokens in `site.css` for tints not in `@cs/ui`, e.g. `--color-primary-tint`, `--color-danger-tint`, `--color-success-tint`, `--color-info-text`); design-lint stays clean (new orange users listed in `ALLOW_AMBER` with a reason citing D14). Contrast ≥ 4.5:1 for all text (check tinted chips). Phone width: no horizontal scroll; 16 px gutter.
**Tests:** existing site tests must pass unchanged in assertions (copy and structure untouched); add none unless a new class needs a guard (e.g. sweep hidden under reduced motion is CSS-only: no test).
**Done when:** `pnpm --filter @cs/site typecheck`, `pnpm --filter @cs/site test`, `pnpm --filter @cs/site lint`, `bash scripts/design-lint.sh` clean; screenshots at 1440 and 390 compared with the canvas.
