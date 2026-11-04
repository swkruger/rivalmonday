# stage3-fixes — fixes found during the owner's Stage 3 click-through

**Kind:** fix   **Worktree:** ../CompetitorSpy-wt/stage3-fixes   **Base:** main @ 0c012608
**Plan/spec:** none (small decided fixes; owner said start 2026-11-03; source: "Agent to-do" in the owner guide). Later Stage 3 findings join this branch.

## Status (overwrite)
2026-11-03: items 1-6 done (f0474d1f..fa12fdd2); final review (opus) fix wave fc9d407c (I1 phone tables, M1/M2 limits guards, M3 switch value, M5 hints). test:affected: 18/19 green; @cs/web 3060/3062, the 2 failures were the fix wave's tests caught mid-edit (pass focused after the commit).

## Next (overwrite)
Owner: approve top bar screenshots; pick scorecard header fix for phones (see New backlog). Then /rm-merge.

## New backlog
- Brief scorecard headers at 375 px: 14 px "Reviews 90 d" / "Google ads" / "Meta ads" are wider than their columns and touch neighbours (numbers fixed). Options: shorter labels (`scorecard-model.ts` HEADERS), fewer columns on phones, or last-resort mid-word break. Owner pick.
- Guest views: sidebar's bottom edge sits below the viewport until the guest banner scrolls away (M4, cosmetic).

## Scope
1. **Account switcher:** two-line entries (name + role) overlap because `DropdownMenuItem` is `h-8`; those items grow (`h-auto`, vertical padding).
2. **Business search unavailable:** staging has no DataForSEO keys by design. Replace "Business search is not configured" (tools `setup.ts`, `intake/public.ts`, `platform-waitlist.ts`) with plain copy, and add a hint to the lookups (waitlist `place-lookup.tsx`, `/start` intake): search Google for the listing, or choose a business type and continue without one.
3. **Brief-style emails:** wider (brief/digest/trend: 760 px like the PDF; short transactional emails stay 640) and card/table text up from 14 px (values 16, sub-lines 14); table headers must not collide. Bump `PDF_LAYOUT_VERSION` if the PDF output changes.
4. **Client limits** (`/platform/agencies/[id]`): one Save for the whole table (SaveBar pattern, changed rows only) instead of one per row.
5. **Top bar:** full width across the page, sticky, agency logo + name at its left; the sidebar starts below it. Phone layout keeps working (390 px). Update the design-system shell docs to match.
6. **Real rank scans + maps on staging:** a staging-only switch lets rank-scan DataForSEO calls and Stadia static maps reach the real vendors (real keys, real cost in the ledger) while `VENDOR_FAKE_MODE=fixtures` keeps faking everything else. Refused in production like the other rehearsal vars. ~$2-3/week for 5 clients. Owner adds the real keys to `.env.staging`.

## Decisions (owner-approved)
1. Owner, 2026-11-03: real rank data on staging (item 6), not dev-only.
2. Owner, 2026-11-03: top bar built directly; owner approves screenshots before merge.

## Owner verification steps
- Screenshots of the top bar (desktop, 390 px) before merge.
- After merge: `pnpm staging:up`; next Sunday scan (or Scan now) shows real ranks over a real map; a brief email on a phone.
