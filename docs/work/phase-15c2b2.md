# phase-15c2b2 — client-page sweep (15c-2b part 2)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c2b2   **Base:** main @ 2fb4c106
**Plan/spec:** [lean plan](../superpowers/plans/2026-10-24-phase-15c2b2-client-page-sweep.md) (no new spec, Q1). Inputs: [2b spec](../superpowers/specs/2026-10-23-phase-15c2b-client-pages-design.md) D9–D15 · [15c-2 spec](../superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md) §4–5, §8 · [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §2–3 · pattern [15c-2a plan](../superpowers/plans/2026-10-23-phase-15c2a-page-fixes.md).

## Status (overwrite)
All 18 tasks + final review + one fix wave done (re-review clean). test:affected green; e2e:affected 136/137, the one failure (smoke ISO locator) fixed and its spec re-run green. Copy sign-off § 2b-2 approved by owner 2026-10-24 (decisions 1–10).


## Next (overwrite)
Owner verification (steps 1–9 below) -> /rm-merge on the owner's go-ahead.


## Interfaces this branch adds or changes
- `lib/labels.ts` maps: MOVE_STATUS, EVENT_ROUTE, CAPTURE_STATUS, PAGE_TYPE, CADENCE, RECOMMENDATION_STATUS, LEVEL, SETUP_STEP_STATUS, CLIENT_PLAN_STATUS, AD_STATE (all in `CLIENT_AUDIENCE_MAPS`), BRIEF_ITEM_STATUS (agency only). MEMBERSHIP_ROLE is unchanged; the Delivery page and its add-recipient select now use it ("Client owner" / "Client viewer") instead of local "Owner" / "Viewer". `components/page-skeleton.tsx` adds `SectionSkeleton` (in-card Suspense fallback).
- `lib/format`: `formatMonth`, `localDay`, `formatCount`, `formatDate` option `withYear: 'never'`; `lib/spend-copy.ts` `askQuotaText`; `@cs/engine` `ALERTS_PER_DAY` (already exported).
- `lib/page-gates.ts`: `GATED_PATHS = ['.']` (all of `src`), `GATE_EXEMPT` (only the gates file).
- Props: `MoveCard` `current` (drives `aria-current`); `timezone` on `BriefView`, `AlertView`, `ProspectLandscape`, `TrackedCompetitorsTable` (and Ads/Timeline sections). `BriefView` timezone is unused (date-only UTC).
- New components: `settings/alerts/band-bar.tsx` `BandBar`; `pricing/history-card.tsx` `PriceHistoryCard` (own read in Suspense + PageSkeleton); `competitors/[competitorId]` `TimelineCard`.
- `briefs/page.tsx` row field `kind` renamed `tag`. `alert-rules-form`: "Use the defaults" is its own sibling form; the save action treats a missing `intent` as save.
- No migration, no tool change.

## Assumes from other branches
- **phase-16** (docs only, ON HOLD until 7 + 15 merge): rebases onto us; its container sweep/client restyle wait for 2b-2 (D10). No migration; its Assumes are stale.
- **phase-7c1** (executing, base 37b028ba, no migration): edits tools `my-usage`, `recommendations`, `reports`, `alert-queue`, `settings`, `workspace/scope.ts` (`requireVisibleClient`). 2b-2 stays UI-only on those; a new/changed tool needs a 7c1 isolation fixture from whichever merges second.
- **Migrations:** main at 0092; next free **0093**; nobody claims one.

## Decisions (owner-approved 2026-10-24)
- Q1 One branch, one lean plan (~16 tasks by route group; gates ratchet per task; full-`src` gate then heatmap last). No new spec (2b spec D9–D15 covers it).
- Q2 "Fixed" bar only; DS v1 rules for new UI only (D10); existing Cards stay for phase-16.
- Q3 No mockups (D11).
- Q4 Gates 1–4 over all of `src`, explicit escapes for non-UI code.
- Q5 P6 dedupe: keep as is (stays in BACKLOG).
- Q6 Guide P17 wording approved; `privacy` tip ends "Delete a conversation with the bin icon beside it and confirm. While conversations may be reviewed, the people named in that line can still read it."
- Q7 D12(d) quota copy on both client card and agency `questions-cell.tsx`.

## New backlog (target → item)
- **Tools pass:** refusal "Google place id looks wrong" (`packages/tools/src/client-input.ts:52`) still lower-case (owner decision 2).
- **Client billing:** add an agency contact link ("contact {agency}") on the client billing page; `get_my_billing` returns no contact.
- **phase-16 (hex without tokens):** disabled `bg-[#CBD5E1]`; signal-pills unticked border `#CBD5E1`; tier chip `#E2E8F0`/`#F1F5F9`/`#4A5D73`; topic-heatmap INK/WHITE/LINE and sentiment fills. Existing Cards stay for phase-16 (Q2).
- **Found, out of scope:** `e2e/client-setup.spec.ts:127` comment says "place id"; starting-point-card `<h3>` without `<h2>`; Overview "N open" is a hand-rolled span; stale error stays after Discard in profile/features forms; defaults `<form>` outside the card (spacing); no test pins thread-list empty line or TimelineCard wiring; billing chip test asserts className not `data-tone`.
- **P6 dedupe stays** in BACKLOG as is (Q5).
- **Forms:** a stale error stays after Discard on SaveBar forms (alert rules, delivery, profile, features; also the `settings/notifications/contact-form.tsx` pattern they copy).
- **Reports:** quarterly report move dates render in UTC (`ReportView` takes no `timezone`).
- **Evidence copy:** "stored as raw saved page" reads oddly (`evidence/[evidenceId]/page.tsx:133`, lower-cased `EVIDENCE_KIND` label).

## Owner verification steps
1. As a client owner of a client in another time zone than yours, open Changes, an alert and an evidence page: times carry the client's zone label ("CT"), and no date is in ISO form.
2. Changes at phone width (390 px): landing shows the list only, no row is announced as current; tapping a change opens the sheet.
3. Settings › Alert rules: type new thresholds and watch the band bar follow; Save appears only after a change; the page says "3 a day".
4. Settings › Delivery: change the alert mode, then Discard; deactivate a recipient and press Cancel — nothing happens; confirm — the row turns Inactive.
5. Setup › Billing (agency admin, Connect ready): "Turn on billing and email the payment link" asks first ("Turn on billing?"); Cancel sends nothing.
6. Competitors: "Stop tracking" asks first and Cancel keeps the competitor; the "Since" column reads "Oct 13".
7. Ask: with review off the composer says "Only you can see your conversations."; with review on it shows the review sentence; the Privacy tip ends with the new sentences.
8. Usage (client and agency): a client whose Ask limit is 0 reads "N used · Ask turned off by limit".
9. Reviews: open "Show as table" — cells show share, sentiment word and the ▲/▼ points; on a phone the chart scrolls sideways instead of shrinking.
10. ~~Read the § 15c-2b-2 sign-off section~~ — approved 2026-10-24.

## Brief
Superseded by the approved plan (scope, reuse list, decisions): see the lean plan linked above and the 2b spec D9-D15. The planning brief and open questions were resolved as Q1-Q7.
