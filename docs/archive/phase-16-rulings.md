# phase-16 — SDD rulings (16a–16f)

Collected from the gitignored SDD ledgers before deletion. Format: what — why — cost if wrong. Owner: skim; flag any to reverse.

## 16a-foundations
- T11 keeps the `--shadow-card` token definition (deletion is 16f per spec § 3) — spec is binding — cost if wrong: one stale token for a few sub-phases.
- T4's `disabled:opacity-45` class assertion stays (Review Focus 3) — cost if wrong: one brittle test line.
- design-lint uses `git grep -P` (rg not on Git Bash PATH) — same patterns — cost if wrong: counts differ slightly from playbook rg numbers.
- agency /onboarding steps + real invite step dropped from shots (unreachable without seed changes) — D19 partly covered (setup + sign-up + intake) — cost: owner sees fewer onboarding before/after pairs.
- Tasks 2+3 batched in one dispatch/review (both PR1 token work, small, ui-only) — cost if wrong: one larger review
- Tasks 4+5+6 batched (button, form controls+Field, tabs+Segmented: same-shape ui primitive work, one commit each, one review) — cost if wrong: larger review surface
- review-controls.tsx pressed `secondary` → `default` (primary fill keeps pressed state visible; 16e revisits with FilterChip/Segmented) — cost if wrong: one button colour on the approvals page
- Tasks 7+8 batched (overlays/toast + ConfirmDialog/ActionDialog: both dialog chrome) — cost if wrong: larger review
- SaveBar visible "Unsaved changes" stays (playbook recipe; SaveBar has 0 call sites) but marked aria-hidden to avoid double announce — cost if wrong: one string owner hasn't signed (added to end sign-off list)
- fold Task 8's leftover ui `tsc -p .` error (ui-primitives.test ConfirmDialog props) + FilterChip dropping ...props in applied branch into a Task 10 fix round — real breakage (ui typecheck red) — cost if wrong: none
- suggestions → `divide-y divide-line` list (li py-3, details pt-3), not bordered items — keeps P4 (no card-in-card) until 16c makes them interactive Cards — cost if wrong: 16c restyles again
- viewer snapshot keeps `rounded-md border border-line` (media well, not a card; matches evidence page) — cost: none
- also fold minors: lead message gets `border-l-2 border-line pl-3`; inactive toggle pills `border border-transparent`; design-gates scans .ts too
- banner via `reserveBanner` spacer (SupportBanner is position:fixed) instead of moving it into flow — equal outcome, (app) untouched — cost if wrong: spacer height drifts if banner height changes
- add Task 12b — C9 sweep of web hand-rolled control classes (outline focus, control radius rounded-sm, border-input) + lint badge regex `<Badge\b` excluding lib/page-gates.ts — spec § 4.8 acceptance is binding — cost if wrong: none
- fix wave = Critical 1 + Important 2,3,4 + Minor 1 (command double chrome), Minor 2 (toast region label → signed-off list, drop duplicate role=status) + cheap ledger items (FilterChip span props/bubbling, toast 6000ms test, shots STATE dir, shell-providers indent, onboarding INPUT_CLASS border-input). Work file (Important 5) written by controller at Task 13 — docs only. Switch #FFD400 thumb → 13a backlog; agency-coloured focus rings → 16c–16e.
- default primary hover/active now lighter (#56AFE9/#64B6EB, mixed toward white because label is ink) instead of DS's darker #2F93D6/#2581C2 (which failed 4.5 with ink) — contrast-safe + white-label — cost if wrong: owner prefers darker hover; DS docs 05/08/tokens.json/frame 11 still show old hex → owner decision at end
- toast type="background" (polite) — non-urgent notices — cost: urgent toasts would need type="foreground"
- real, deferred to 16b task 1 (fallback to full mix + mid-tone sample) — cost: no hover shade for such brands until 16b
- real, dev-only, 16b task 1 (validate label) — cost: a dev could wipe before-shots
- no consumers yet; 16c when FilterChip is adopted — cost: none now
- visual check in shots; 16c adopts TableFrame — cost: cosmetic
- Task 13b — move shots root to gitignored apps/web/.shots/<label>/, validate SHOTS_LABEL (^[\w.-]+$, not '.'/'..'); regenerate `before` from harness-only commit 50c4807a in a temp worktree — cost if wrong: none

## 16b-shell-overview
- Task 2 dispatched while Task 1 is in review (disjoint files) — cost if wrong: a T1 fix round must avoid T2 files
- Task 6 dispatched before Task 5 while Task 4 in review (T6 disjoint; T5 shares mobile-nav with T4) — cost: none
- fold Task 4 minors 1 (move nav primitives to shell/nav-link.tsx, break cycle) + 3 (design-system focus outline on nav items, chips, back link) into Task 5 dispatch (same shell files) — cost: slightly larger Task 5
- fold Task 6 minors into Task 8 dispatch (StatBadge info → chip-neutral tokens, warn → chip-warning-text, scorecard self row hover:bg-primary-soft) — cost: none
- chart context grey #A3B1C2 exempt from dataviz chroma floor/contrast (role is recessive grey by D-13 + CLAUDE.md 'you + ≤2 rivals + grey'; legend + table view exist) — cost if wrong: grey series hard to read without table
- existing ramps (up/down/rank/sentiment) fail the categorical validator — wrong tool for sequential/diverging ramps; ramps unchanged per plan; backlog: validate ramps with a sequential/diverging method in 16c (rankings/reviews pages) — cost: possibly weak ramps until then
- seriesColor gains `opts?: { lowerIsBetter?: boolean }`; RankTrend passes it; P8 reads "best latest value" — spec intent (highlight the most relevant rivals) wins over plan literal — cost: none
- fold banner `lg:px-7` → `lg:px-8` (billing-banner, client-billing-banner, ShellNotices) into Task 8 dispatch — aligns with top bar/sheet — cost: none
- @cs/ui Section gets `titleAside?: ReactNode` rendered beside the heading (outside h2); D1 binding over plan wording — cost: none. Fold minors 2 (starting-point rows bg-surface), 3 (brief-view rule +@overview), 4 (stat-strip rule +@briefs).
- KpiStrip role=group surfaces the existing label (not a D1 name change) — cost: one new named group in a11y tree.
- test intent = every field on the card visible (no clipping/side scroll), not above-the-fold; scroll the card into view before toBeInViewport; agency page spacing itself is 16e — cost if wrong: masks a real 390 layout regression (check agency-dashboard-390 shot)

## 16c-client-pages
- P7's DOM-order change on competitor detail (Pages table before Collection status) accepted — content and names unchanged, layout-forced — cost if wrong: screen-reader order differs from before
- plan's new copy (peek "Previous change"/"Next change"/"Close details", bulk-bar "Selected suggestions") added to owner sign-off list; ramp colour changes (T11) only if a ramp fails, listed for owner
- implementers no longer run Playwright (parallel tasks share port 3100/test DB) — cost: E2E regressions surface only at Task 14
- fix in @cs/ui HairlineGrid via nth-child rules per cols (Overview 1-row pairs unaffected); fold minors: Pages double frame (Card + TableFrame → keep one), test for rating null with GBP.
- accept, no history rewrite while parallel agents commit; rule added: never amend.
- fold selected-row cue (data-selected + font-semibold, consistent with Changes) + first/last row corner rounding into a small fix round — consistency — cost: none
- controller verification for a 9-line fix in place of a re-review dispatch — cost: none. Minor (deferred): rounded-[5px] literal.
- @cs/ui Section gets opt-in `labelled?: boolean` (useId → heading id + section aria-labelledby); NOT auto for all (would add landmarks that never existed = also a D1 change). Fixer audits main..HEAD for removed section aria-labelledby/aria-label and restores via labelled. — cost if wrong: missed region somewhere
- add a second scored event to seedWorkspace (deterministic occurredAt); this fixer alone may run Playwright (workspace + specs that read E2E HVAC changes/alerts/briefs); also add e2e-affected rule for business-avatar.tsx — cost: seed change may shift other specs (they run)
- seed promo occurredAt = now-2d (restore original first row); headings added where CardTitle divs were → listed for owner (additive)
- test-DB collision with the fix wave's concurrent Playwright globalSetup (16c touches neither package); rerun db+mcp after the fix wave — cost if wrong: a real db/mcp regression surfaces on rerun

## 16d-friday-briefs
- implementers assert the actual `formatDate` output, not the plan's example literal — formats live in lib/format — cost if wrong: none |
- askEvidenceRefs formats in the client profile tz (not viewerTimeZone) — client pages (Changes, Briefs, Overview, Ask) all format with profile.timezone today and D1 keeps that; a pill must not change date between local resolve and router.refresh — cost if wrong: dates follow the client's zone rather than the viewer's cookie on these pages, as they already do; a separate tz sweep would fix all at once
- Reviews text input keeps toolbarControlClass (backlog line stale; nativeInputClass h-9 would misalign the h-7 toolbar); nativeInputClass alias added for future use — cost if wrong: none (alias unused)
- shots seed their own delivered alert + trend_report in the shots beforeAll, not e2e/seed.ts — the shared E2E seed drives alert counts/expectations in specs — cost if wrong: shots-only rows diverge from E2E seed; harmless (shots run alone on port 3100)
- fix wave = #1 #2 #3 #4(E2E step) T3 guard #6 #7; leave #5 sheet width (16f), #8, #9 (backlog) — cheap correctness/coverage first, visual nits to the shots review — cost if wrong: small rework in 16e/f
- client-switch check accepted as E2E hard-load step + owner manual check — App Router keys a dynamic segment's layout by its param value, so another client's layout is a fresh instance — cost if wrong: panel could stay open across a client switch via the context switcher; owner step catches it

## 16e-agency-platform-public
- T4/T9 Playwright "Done when" steps are skipped by implementers; Task 11 e2e:affected covers intake + platform-costs — Global constraint + one-test-run-per-DB rule outrank the optional step — cost if wrong: a DOM-shape E2E break found only in Task 11 (one extra fix round).
- ⚠️ unrendered layout accepted — mockups are record-only (D13, no owner wait); real pages are checked by shots in Task 11 — cost if wrong: a mockup that renders oddly in the record
- bare EmptyState callers in 16e pages are wrapped by their page task (where the empty state replaces a table, it sits where that table's frame/flush table sits, inside its Section) — carried into Tasks 4 (approvals:42, leads:111, prospects), 5 (usage:57), 7 (notifications:40), 8 (platform/leads:94,140), 10 (ask:53, knowledge:86); client-page ones go to the final review triage — § 6.2 item 8 says keep it inside its frame — cost if wrong: a few empty states float on the sheet until 16f
- plan's "Near cap/Over cap" titles were wrong — real copy "Near limit"/"Limit reached"/"Paused" kept — plan wording error, copy unchanged — cost if wrong: none
- plan's region 'Billing' expectation was wrong — labelled Section is 'Client billing'; E2E 'Billing' region is the client banner (unaffected) — cost if wrong: E2E client-billing fails in Task 11
- invoices list → table adds column headers "Date", "Amount", "Status", "Invoice" (new copy) — kept for table semantics/a11y; added to owner copy sign-off list in the work file at Task 11 — cost if wrong: owner renames 4 headers
- client billing definition rows routed into Task 5 fix round (plan put the deviation on the wrong page) — cost if wrong: small extra diff on a 16c page
- ⚠️ Segmented status nav overflow at 360 px and 3-cell HairlineGrid layout → checked in Task 11 shots (390) and 16f sweep — cost if wrong: a horizontal scroll on the agencies filter at phone width until 16f
- split agencies-by-state into two StatStrips (3 + 4) with no new headings — splitting with titles "In good standing"/"Needs attention" would be new copy (D1) — cost if wrong: grouping is implicit, owner may want titles
- minor #3 (signups funnel th scope=row → td) promoted to Important and put in the fix round — a11y semantics lost is a behaviour change under D1 — cost if wrong: small extra diff
- correct, runbook migrated in Task 6 (16c P10) — cost if wrong: none)
- final fix wave = I1 + I2 + M1–M10; I2 gating verified by the Task 11 shots run (fixer cannot run Playwright) — cost if wrong: one more small fix if axe still flags sign-up/start-intake
- shots fixer may run the shots harness itself (overrides "no Playwright inside tasks") and the gate becomes expect.soft + axe.json records node targets — the controller may not fix code, and an axe hit can't be located without the harness; port 3100 is free (no other run) — cost if wrong: a longer fixer turn, small harness diff
- exclude the wordmark's "monday" span (data-part="monday") from axe — WCAG 1.4.3 logotype exemption; brand colour is a CLAUDE.md decision — cost if wrong: owner wants a darker amber or no exemption; revert one exclude line
- keep the onboarding platform Wordmark at its default 24px/800 (fix-wave change made for I2 on a wrong cause theory) — matches AuthCard and sidebar; D19 allows onboarding visual change — cost if wrong: one class restore

## 16f-responsive-lock-in
- T1 done-when "total 118" holds only if no untracked files match; the implementer reports the new total if --untracked raises it — cost if wrong: none (measurement)
- T8 has no overflow routes — T8 keeps P5 Competitors rows + adds one sanity check that the gate fires (temporarily widen a page locally, observe, revert; no commit) — cost if wrong: a measurement bug hides real phone overflow
- costs manual series keeps var(--chart-rival-2) — platform chart has no competitor series, validated, non-amber/non-danger — cost if wrong: owner/13a renames to a neutral series alias
- final fix wave waits for the running unit → E2E → shots sequence (fixer edits would race the E2E/shots builds); failures from that run join the one fix wave; affected checks re-run once after it — cost if wrong: ~20 min of waiting
- duplicate tips are intended (caption = phone, header = desktop; jsdom renders both) — fix the test helper to accept >=1 match — cost if wrong: a real duplicate tip elsewhere goes unnoticed by this helper.
