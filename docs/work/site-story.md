# site-story — homepage storytelling rewrite (rivalmonday.com, Phase 17 family)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/site-story   **Base:** main @ 9384612f
**Plan/spec:** `docs/superpowers/plans/2026-11-04-site-story.md` · `docs/superpowers/specs/2026-11-04-site-story-design.md`

## Status (overwrite)
Plan Tasks 0–8 + 10 done (SDD, per-task reviews clean; final review clean after one fix wave, 2026-11-04). test:affected 363 passed; site e2e 102 passed / 4 skipped (run before the fix wave; CI re-runs). Home LCP 2.39 s (phone).

## Next (overwrite)
Owner: Task 9 — commit main's pending `docs/copy/signoff.json`, then `pnpm copy:review` (site) + `copy:status --prune` here (new: home story strings, `RIVAL_STORY.gridTitle`, `CLOSE_TRIAL.body`); Vercel `NEXT_PUBLIC_CLIENT_PRICE_USD` unset or 249; founder note later (prod site deploy waits, D8). Then `/rm-merge site-story`.

## Interfaces this branch adds or changes
- `apps/site/src/lib/env.ts` `DEFAULT_CLIENT_PRICE_USD` 99 → 249 (D4). `content/home.ts` `HOME_ANCHORS`/`SECTIONS` reshaped (D2); `RECOMMENDATIONS_ROADMAP` teaser becomes one §10 line (D3).

## Assumes from other branches
None. No unmerged branches; `staging-worker` worktree is detached at 42e9ddbe, an ancestor of main (no commits, no changes).

## Decisions (owner-approved)
**Inherited:** root `CLAUDE.md` § Marketing site (17), § Copy sign-off, § Billing ($229 incl. 3 seats, $99/seat, Connect fee 0); `apps/site/CLAUDE.md` (only `@cs/ui`; `siteEnv`; tokens only in `site.css`, design-lint; site keys out of `cn()`; amber = Friday + Pilot pill; prerender; `verifiedIn` in `*-evidence.ts`; roadmap never a claim; hand-tuned sample ranks).

**This branch (owner, 2026-11-04):**
- **D1** Hero H1 "Your competitors are making moves. Are you watching?"; primary CTA "Get a free brief for one of your clients" (opens the join flow with the real-sample option); secondary "See what your clients get ↓".
- **D2** Order: 1 Hero → 2 The invisible competitor (map replay of the sample, Quillstone 8→31 of 49 points) → 3 The agency ceiling (three pressure lines) → 4 The opportunity (three outcomes + example strip 20 clients × $199 = $3,980 revenue, $1,912 cost, $2,068 margin, link `/partners`) → 5 Meet Monday and Friday (three-up) → 6 What your client sees (ClientView tour + recommendations board + Friday row) → 7 Before and after Monday (two columns, client + agency) → 8 No evidence, no claim (checks hub + clickable sample brief + live counters) → 9 How it works (four steps + starting-point line) → 10 Your brand, your price, your billing (white-label, Stripe Connect, plan line, calculator, one roadmap line) → 11 Close (real-sample CTA + founder note).
- **D3** Removed from home: standalone sample section (moves into §8), "Coming soon" recommendations roadmap block (one line in §10), guides block, industry chips in How it works (stay on `/for` + footer), local-business price card in the pricing band.
- **D4** Direct (platform-sold) client price $99 → $249/mo; agency plan unchanged. Agencies set any price. $249 shows only on the `/pricing` business card and the join dialog business path.
- **D5** Website-monitoring lines ("changing prices", "page snapshot", Kestrel $69 cut) ship gated behind `WEBSITE_MONITORING_LIVE`; owner switches monitoring on during the pilot.
- **D6** Founder note: owner supplies details later; ship with `FOUNDER_NOTE = null` (renders nothing).
- **D7** Keep existing demos/components unchanged where possible; new §2, 3, 4, 5, 7 compose `@cs/ui` primitives + site tokens; no new hex etc. (design-lint).

## Brief

### 1. Scope
Rewrite `/` only (`apps/site/src/app/page.tsx`) as a story (D2), new hero copy (D1), price change (D4). Spec `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md`: § 1 intent/anti-goals, § 3 hero (superseded by D1), § 4 sections (order was builder's call, § 8), § 5 join popup, § 7.2 env (client price C: 99 → D4), § 7.6 pricing/partners, § 7.7 SEO (LCP ≤ 2.5 s), § 7.8 design latitude. Roadmap row 17 (17a/b/c, site-roadmap, site-showcase) merged 2026-10-29.

### 2. Already built — reuse, don't rebuild (paths under `apps/site/`)
- Home: `src/components/home/*` (hero, checks-hub/diagram, live-counters, steps, friday-row, real-sample, sample-section, recommendations-section, founder-note, testimonials, pricing-teaser, cta-band, mobile-cta).
- Tour: `src/components/client-view/*` + `content/client-view.ts`. Sample: `src/components/sample/*` (`rank-grid` week slider → §2), `content/sample-brief.json` (Quillstone 8 → 31 of 49).
- Economics: `src/components/partners/margin-example.tsx` + `content/partners.ts` `PARTNER_EXAMPLE` (`clientPriceUsd: 199`, calculator; reuse for §4 strip/§10 calculator).
- Copy: `content/home.ts` (`HERO`, `HOME_ANCHORS`, `SECTIONS`, `RECOMMENDATIONS_ROADMAP`, `HOW_STEPS`, `PRICING_LINES*`, `CTA_BAND*`, …), `content/pricing.ts` (`PRICING.business.monthlyUsd = siteEnv.clientPriceUsd`), `content/pricing-page.ts` (`PLAN_CARDS`, `FEATURE_ROWS`, `PRICING_FAQ`), `content/founder.ts` (`FOUNDER_NOTE = null` + `OWNER-PLACEHOLDER`), `content/website-monitoring.ts` (`WEBSITE_MONITORING_LIVE = false`), `content/industries.ts` `websitesLine()`.
- Env: `src/lib/env.ts` `DEFAULT_CLIENT_PRICE_USD = 99`, `NEXT_PUBLIC_CLIENT_PRICE_USD` read literally. Join: `src/components/join/copy.ts` `JOIN_COPY.step1.business.body/bodyTrial` (price from `PRICING`).
- Tests pinning copy/order: `src/components/home/sections.test.tsx` (order == `HOME_ANCHORS`), `hero.test.tsx`, `content/content.test.ts`, `e2e/site.spec.ts`, `content/pricing-page.test.ts`, `content/partners.test.ts`; price pins also in `src/lib/env.test.ts`, `join/join-dialog.test.tsx`, `partners/partners.test.tsx`.
- Claims ledger `docs/research/2026-10-29-phase-17c-claim-check.md` (ids binding; `cap-websites` gated; item 6: business price is site config).
- **Where `NEXT_PUBLIC_CLIENT_PRICE_USD` is set:** nowhere in code/CI besides `env.ts` (turbo hashes `NEXT_PUBLIC_*`; `ci.yml` unset). Optional Vercel env: `docs/DEPLOY.md:83`, `docs/STAGING.md:240`. No app-side direct price exists.
- **Copy sign-off:** `packages/copy-review/src/sources.ts` scans surface `site` (module mode `content/*.ts|json`, `src/**/copy.ts`; JSX mode `src/**/*.tsx`). Identity = `(file, hash)` (sha256 of normalised text); anchor (`file#EXPORT.path#n`, e.g. `content/client-view.ts#CLIENT_VIEW.alerts[0].title#0`) only detects "changed". Edited → "changed" → re-sign → `--prune`.

### 3. Backlog to fold in (`docs/BACKLOG.md` § Phase 17 follow-ups; only the home-relevant ones apply)
- [ ] Testimonials: add real pilot quotes (with permission) to `content/testimonials.ts`; the section stays hidden while empty — *site-showcase*
- [ ] Retake the hero collage (`public/sample/hero-{overview,map,friday}.webp`) when the tour sample in `content/client-view.ts` changes: static screenshots, no script — *site-polish*
- [ ] Later (deferred 2026-11-03): owner content — founder note + photo, privacy/terms OWNER-PLACEHOLDERs (the site deploy refuses until done) — *OWNER-GUIDE Stage 4*
- [ ] Copy gate: make `copy:status --strict emails,site,site-legal,app-client` block `deploy`/`deploy-site` (production only…) before the first pilot invite — *copy-signoff-tool*
- Other Phase 17 items (CSP, map-check tool, SEO pages, 17a/17c minors, recurring) stay in BACKLOG.

### 4. In-flight workstreams
None besides this branch; no `apps/site` overlap.

### 5. Open questions for the owner — resolved 2026-11-04: all as recommended (spec D8–D11)
1. **Founder note vs deploy gate.** `check:placeholders` (ci.yml `deploy-site`) refuses prod while `content/founder.ts` keeps its `OWNER-PLACEHOLDER` marker. (a) Keep marker; prod site deploy waits for the note — **recommended** (matches BACKLOG Stage 4, privacy/terms block anyway); (b) drop the marker so `null` is a legal final state.
2. **$249 via env or constant.** (a) Change `DEFAULT_CLIENT_PRICE_USD` to 249 and confirm Vercel `NEXT_PUBLIC_CLIENT_PRICE_USD` is unset or 249 — **recommended**; (b) leave the default, set the env on Vercel only (staging/CI would still show $99).
3. **Re-signing scope.** Reworded/new home strings will show as changed/unsigned. (a) Plan's last task: owner runs `pnpm copy:review` on the `site` surface, then `--prune` — **recommended**; (b) sign per task as sections land.
4. **Removed content.** (a) Delete unused exports/tests (`RECOMMENDATIONS_ROADMAP` teaser, home guide slugs) — **recommended**; (b) keep them.

## New backlog (target → item)
- site → Pre-existing ungated website wording outside the story copy: `SECTIONS.checks.body` ("a page snapshot"), `HOW_STEPS[2]` ("Websites, …") — gate or reword when `WEBSITE_MONITORING_LIVE` flips (D12)
- site → Close band left-aligned from `lg` with `Reveal` on the preview card (carried from RealSample; spec § 2 said centred) — centre if the owner prefers
- site → Test hygiene minors from site-story reviews: rival-grid test pins properties not bytes; no RankGrid autoplay test; loose avatar/className selectors; redundant h1 assertion; `ids` helper filters 'founder'
## Rulings (SDD, 2026-11-04)
- `HERO.primaryCta` stays "Join the free pilot" (site-wide JoinButton default); hero/mobile bar/close use new `HERO.heroCta`.
- §2 keeps RankGrid autoplay-on-scroll (the one moment); home sample-brief grid `autoplay={false}`.
- D13 rival grid follows existing sample evidence: 8 top-3 points through 2026-10-06, 31 on 10-13/10-20 (a jump, not a climb); rival-1 buckets darkened with an ink layer for ≥ 4.5:1 numerals.
- `/how-it-works` keeps its client-view heading (home uses `homeHeading`).
- `CLOSE_TRIAL.body` reworded to what a trial delivers (no emailed private link).
- Sample-dependent helpers live in `content/rival-story.ts`, keeping sample data out of every page's client JS.

## Owner verification steps
- Vercel `NEXT_PUBLIC_CLIENT_PRICE_USD` (Q2); sign changed copy.
