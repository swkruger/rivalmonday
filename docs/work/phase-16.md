# phase-16 — design system v1 across the web app, page by page

**Kind:** planning → implementation   **Worktree:** ../CompetitorSpy-wt/phase-16   **Base:** main @ f58b4764 (rebased 2026-10-26)
**Plan/spec:** 16-onboarding spec [2026-10-24-phase-16-onboarding-design.md](../superpowers/specs/2026-10-24-phase-16-onboarding-design.md) (owner-approved 2026-10-24) · plan [2026-10-24-phase-16-onboarding.md](../superpowers/plans/2026-10-24-phase-16-onboarding.md) (owner-approved 2026-10-25); inputs `docs/design-system/`.

## Status (overwrite)
**Execution started 2026-10-26** (owner go-ahead). 16-onboarding Task 0 done except the owner gate: rebased (clean), plan re-checked and corrected (§ Pre-flight), mockups `client.html`/`intake.html` built + `agency.html` fixed (PDFs sent). Waiting on: owner mockup approval (gates Tasks 8–10) and OK for image generation (~$1.50–2.50). Nothing built yet.

## Next (overwrite)
SDD Tasks 1–7 (not gated by mockups); generate image candidates once the cost is OK'd; Tasks 8–10 after mockup approval; Task 11. Rest of Phase 16: rebase on main, refresh Brief §2/§5 + Assumes (stale), resume brainstorming at Q: build new pieces (docked Friday panel, bulk bar, peek panel, settings drill-in nav) or restyle with existing components only → spec → lean plan(s) → approval → SDD.

## Interfaces this branch adds or changes
Per 09 §9: tokens, new `@cs/ui` primitives, `Card` = frame, `PageHeader` `meta`/`tabs`/`variant`, shell frame + sheet, `scripts/design-lint.sh`.
16-onboarding (planned, plan "Interfaces"): migration **0095** `onboarding_split` (`client.phone/address/logo_url` + app_user UPDATE grant, `agency_onboarding.wizard_finished_at`, `client_setup.owner_pick_requested_at/location_source`); tools `save_agency_basics`, `finish_onboarding`, `update_client_details`, `upload_client_logo`, `get_client_details`, `advance_client_setup` action `ask_owner`; `create_client` `details`; setup steps `details/lookup/profile/competitors/invite/billing` (`totalSteps` 5|6, `waiting_owner`); search rule = keywords + centre (no place id); `ToolDeps.geocode` (Stadia) + web env `STADIA_API_KEY`; route group `(onboarding)` (moves `/onboarding`, `/agency/clients/new`, `/c/<id>/setup`); owners never enter `/setup` (only `/setup/competitors` while waiting).

## Assumes from other branches
None in flight (2026-10-26); 15c2*, 7b1, 7c1 etc. are merged and this branch is rebased onto them.

## Pre-flight (16-onboarding Task 0, 2026-10-26)
Plan corrected in place. Main changes: migration 0095; `(onboarding)` layout re-provides AppShell's providers/banners via a shared `ShellProviders` (P1); `OnboardingShell` `helpKey`/`guide` + coverage gate (P10); client logo route public + content-addressed (P11); `ask_owner` sends no email, invite step can't be skipped while `waiting_owner` and queues the review email (P12); role vs scope errors (P13); P5 has 8 call sites incl. an SQL twin; geocoder signature `TimedFetch`/`LedgerSink`/`CallScope`, geocode before the `create_client` tx; `ISOLATION_FIXTURES` for all 5 new tools; extra files in Tasks 4/7/8/9 (page-gates, e2e-affected-rules, labels, links, worker setup job, readiness selects, demo coverage, help reach); line refs refreshed.

## Decisions (owner-approved)
- D1 Look only: every page keeps its content and behaviour; adopt the new design (storyboard look: one sheet, sections over cards, fewer cards, cleaner). Priority pages: Overview, Brief detail.
- D2 All pages in one pass to the new design; owner verifies after review and requests per-page changes (no per-page pre-approval).
- D3 Context switcher stays in the left sidebar (15a D4 kept; overrides storyboard Frame 2's top-bar switcher).
- D4 Runs after Phase 7 and Phase 15 are merged (reverses the earlier "design system first").
- Open: OD-5 bottom tabs on phones vs 15a D8 (drawer only) — not yet decided.
- D5 (2026-10-24) **16-onboarding** sub-phase: agency (4 steps) + client (7 steps) + intake as full-page split flows with live previews; owner lands on Overview; replaces DS D-22/L7. Spec: [2026-10-24-phase-16-onboarding-design.md](../superpowers/specs/2026-10-24-phase-16-onboarding-design.md) (O1–O14). Mockups `docs/design-system/mockups/onboarding/`.
- D6 (2026-10-25) Plan approved; code waits for the owner's explicit go-ahead.
- D7 (2026-10-25) Generated images (gpt-image via OpenRouter, `openai/gpt-image-2.5-sunburst`) used sparingly: onboarding only on sign-up, both "All set" screens, intake "Check your email" (O14); static, owner-picked.

## New backlog (target → item)
- Owner → at 16-onboarding deploy add `STADIA_API_KEY` to the Vercel web env (geocoding).
- Unscheduled → no-listing clients have no self competitor (scorecard/rank self data empty until a listing is linked in Settings); consider "Link Google listing" prompt.

## Owner verification steps
16-onboarding: plan Task 11 list (written into this file when built). Other sub-phases TBD.

## Brief
### 1. Scope (no roadmap row)
Visual migration, no data/behaviour change (09 §0.3), plus the pieces DS needs: docked Friday panel (D-14), bulk bar, peek panel, drill-in settings nav, bottom tabs (OD-5). Order 09 §9 / 08 §7: tokens → primitive restyle → new primitives → container sweep C1–C4 → shell + PageHeader → **Overview slice (owner stop)** → workspace → detail/settings → Friday + briefs → responsive → lock-in. Card map 09 §6.2 (153 uses, cut at `10ce242d`; recount via 09 §8); codemods 09 §7; acceptance 08 §8; archetypes L1–L7 05 §4; `design-tokens.json` (mirror `component-examples/rm-tokens.css`).
**Frames** (`storyboard/frames`, `png`): 01 direction · 02 shell · 03 nav/headers (switcher, Ctrl K, Rankings, Website changes) · 04 controls · 05 sections/cards · 06 forms · 07 tables · 08 Overview · 09 detail + danger zone · 10 responsive · 11 reference · 12 Overview + docked Friday. **Examples** `component-examples/index.html`: buttons, chips, tabs, fields, table, KPI+feed, overlays, Friday.
**Pages** (87; [Fn] frame, else archetype; * no PageHeader):
- Client (26): Overview [8,12] · competitors [7] · competitors/[id] [9] · rankings, changes [3] · ask*, ask/[threadId]* [12] · ads, reviews, moves, briefs (L1) · pricing, recommendations, pitch-snapshot (L2) · briefs/[id], reports/[id], help (L5) · alerts/[id], evidence/[id] (L3) · setup (L7) · settings* · settings/profile [6] · settings/{ai,alerts,billing,delivery,runbook} (L4, danger [9]).
- Agency (20): home (L2) · alerts, approvals, leads, prospects (L1) · approvals/[id], prospects/[id] (L3) · clients/new, prospects/new (L7) · help · settings* + 9 settings pages (L4).
- Platform (16): home (L2) · agencies, ask, billing, costs, health, knowledge, leads, reviews, topics, verticals (L1) · agencies/[id], ask/[id] (L3) · knowledge/new, knowledge/[id], runbook (L4) · help.
- Account (5 + e2e-throw*): inbox, kb/[id], onboarding (L7), paused*, settings/notifications.
- Public/auth/setup (20, all *; L7): `/`, bot, sign-in(+check-email), sign-up(+problem), join, link-expired, link-other-account, no-access, oauth/consent, u/[token]/{confirm,done}, start, start/[slug], start/verify, start/v/[leadId]; + error pages.
No agency/platform/auth/setup page has a frame.

### 2. Reuse, don't rebuild
`packages/ui/src/styles.css` (Tailwind 4 `@theme inline`; `--color-line`, `--you`, `--chip-*`; no dark tokens), `theme.ts` `themeVars()`; shadcn components (card, button, badge, status-chip, tabs(-link), table, dialog, sheet, command, confirm-dialog, save-bar (0 uses), friday-badge, …). Web `components/`: `page-header`, `page-skeleton`, `stat-card`, `settings-nav`, `shell/*`, `charts/*` (ramps validated 2026-10-17), `help/*` (EmptyState, HelpTip, PageGuide), `ask/*`, `evidence-chips`, `lib/labels`, `lib/format/*`. E2E role-based (1 class assert); ~10 unit tests assert classNames.

### 3. Binding decisions
Root `CLAUDE.md` § Decisions (DS, brand, charts, switcher, Ask first, settings routes, PageHeader + help key, no `loading.tsx`, miles, tz, white-label). 15a D2 mockups before code, D11 no dark mode, §2.7 PageHeader + `›`. 15c C8 dates, C9 mobile list/detail sheet, C10 mockups + one copy sign-off per sub-phase. 15b copy `server-only`, owner signs copy. DS OD-1 ink label/computed foreground · OD-2 600 ink headings · OD-3 brand.md updated · OD-4 inputs #8796AB · OD-5 bottom tabs after phone validation. 09 §0 tokens only, one concern per PR, only `--primary/--secondary` per agency.
**Conflicts (Q2):** 15a D8 "no bottom tab bar" vs OD-5; 15a D4 switcher in sidebar vs F2 top-bar slash switcher.

### 4. Backlog to fold in (verbatim)
- "**Next phase candidate:** `/rm-kickoff design-system`… Coordinate with **15c-2**"; "Validate the responsive proposal (D-23…) with 3–5 pilot owners on phones before PR 10." — *design-system*
- "chip hex duplicated in `status-chip.tsx` and `styles.css`; `global-error` lacks Inter; PageSkeleton title height; 'Other' series #94a3b8 fails dataviz checks; categorical slots … fail the all-pairs normal floor" — *phase-15c1*
- "Competitor profile: KPI cards `text-xl` vs the brand's 34px" — *5c-1/5c-2*; "Heatmap 'Show as table' cells unstyled…; SVG text shrinks at phone width" — *5c-2*; "Feed brief pill hardcodes `text-[#B45309]`" — *5c-1*; "snippet button hard-codes #47A8E7" — *phase-11*; "strip sits outside the 1560px wrapper…; run dataviz skill on chart colours" — *8c*; "dark chart theme (with the app's dark theme)" — *5c-1/5c-2*.
- 15c-2 overlap: "`--color-secondary-foreground` still a literal → DS phase"; R-DS2 billing tabs segmented until DS; R-DS3 `StatusChip` stays; 2b `ListDetail`, Changes tabs, heatmap table toggle; "intake button white text on light agency colours; briefs tab list clips" — *15a*; "tips inside `CardTitle` lengthen heading accessible names" — *15b-2*.

### 5. Open questions for the owner (by design impact)
1. **Split.** a) playbook's 11 PRs as 11 sub-phases; b) **16a foundations (PR 1–5: tokens, primitives, new primitives, container sweep, shell + PageHeader) → 16b Overview slice + owner review → 16c client pages → 16d agency + account → 16e platform + auth/setup + responsive/lock-in** (rec.); c) one branch, page by page.
2. **15a vs DS conflicts.** a) DS wins: switcher → top bar, bottom tabs <768 after phone test (rec.; mandate is newer); b) keep 15a sidebar switcher + drawer only; c) top bar now, bottom tabs to backlog.
3. **15c-2a (done, unmerged).** a) merge 15c-2a first, then 16 restyles its pages (rec.: tested work, shares `readableTextOn`/`--primary-foreground`); b) shelve and redo inside 16; c) 16 first, 2a rebases (heavy conflicts).
4. **Mockups.** a) storyboard is the approval for framed pages; HTML mockup per page group without a frame (agency, platform, auth/setup) and for new UI (docked Friday, bulk bar, peek panel, drill-in nav, bottom tabs) (rec.); b) mockup every page; c) none.
5. **Visual verification.** a) Playwright screenshots 1440 + 390 per page vs frame PNG, owner review per sub-phase (rec.); b) owner manual only.
6. **Pages without a frame.** a) nearest archetype + reuse frame components, no new patterns (rec., per 07); b) design new frames first.
7. **Dark mode.** a) out of scope, backlog (rec.; 15a D11, DS §unresolved 2); b) add dark tokens now.
8. **Tests/selectors.** a) update className-asserting unit tests to role/`data-slot`/`data-variant`, keep E2E role-based, add axe check per page (rec.); b) add `data-testid` broadly; c) no axe.
9. **Lint gate.** a) `design-lint.sh` report-only, blocking in last sub-phase, CI only on approval (rec.); b) blocking from the start.
