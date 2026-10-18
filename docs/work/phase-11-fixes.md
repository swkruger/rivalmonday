# phase-11-fixes — owner-testing fix batch (pilot links, errors, lookup cards, copy)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-11-fixes   **Base:** main @ c47f6c22 (rebased after phase-13b)
**Plan/spec:** [plan](../superpowers/plans/2026-10-17-phase-11-fixes.md) (no spec: small fix batch, decisions below)

## Status (overwrite)
Built + final fix wave; ready for owner re-test. Tasks 0-7 (plan owner-approved 2026-10-17 incl. duplicate rule), final whole-branch review "with fixes", one fix wave: rebased on `main` (13b), 13b's rank-settings/scan-now errors on `ErrorNote`, `ErrorNote passive` for stored errors (Ask failed action, failed snapshot, failed competitor search on load), missing `focusKey`s, invite-link hint fixes, US phone display, sentence-case vertical name in the empty-suggestions note.

## Next (overwrite)
Owner re-test (steps below) and sign-off of the copy, then `/rm-merge` on the owner's go-ahead.

## Copy for owner sign-off
- Pilot refusal: "The pilot must end after this link expires on {date}. Choose a later pilot end date or a shorter expiry." / "The pilot end date has already passed. Choose a later date." (also shown as a quiet live hint in the form)
- Card badges: "Owner-verified"; "Possible duplicate listing"; line "Address hidden — service-area business"; phone · domain line.
- Duplicate hint: "Google shows more than one listing with the same phone number or website. Pick the owner-verified one if it's there."
- Empty suggestions: "We couldn't find suggestions in the Google profile — here are common keywords for {vertical}." ({vertical} in sentence case: "HVAC & plumbing", "dental practices")
- Phone on cards: US numbers as "(817) 286-3655"; others as Google sends them.
- R20: the onboarding profile intro naming the four required fields (agency name, contact name, contact email, phone).

## Interfaces this branch adds or changes
- **No migrations.** `SetupLookup` / `setupLookupSchema` / `intakeLookupSchema` are **unchanged** (persisted shape and the 11c intake signature canonical form stay the same).
- `@cs/core`: new pure module `invite-offer.ts` (`pilotLinkRefusal`), exported from the index **and** a new subpath export `@cs/core/invite-offer` (client-safe import for the web form).
- `@cs/tools` `setup/lookup.ts`: `collapseSameListing`, `possibleDuplicates`, `phoneKey`, `domainKey`, `haversineKm`, `DUPLICATE_DOMAIN_KM`.
- Tool outputs (web-only tools, no MCP schema change): `find_business` places gain `isClaimed: boolean | null`, `possibleDuplicate: boolean`; `get_client_setup.vertical` gains `name: string`. `intakeLookup` returns `IntakePlaceOption[]` (= `SignedIntakePlace & { isClaimed, possibleDuplicate }`, the extra fields unsigned, display only).
- `create_invite_link` refuses pilot end dates in the past or on/before the link's expiry day (`invalid_input`, user-facing copy).
- Web: `ErrorNote` in `apps/web/src/components/form-error.tsx` (FormError now uses it; danger-tinted, icon, `role="alert"`, scroll + focus on a new error; `quiet` = live hint, `passive` = stored error shown on load, both `role="status"` with no focus); `PlaceSummary` + `formatPhone` in `apps/web/src/components/place-summary.tsx`; global `cursor: pointer` for enabled buttons in `packages/ui/src/styles.css`.

## Assumes from other branches
- None: phase-13b is merged and this branch is rebased on it (13b's rank-settings and scan-now errors converted; the two rankings-page "selection/settings changed" lines stay notices).

## Decisions (owner-approved 2026-10-17)
1. **Pilot invite links:** refuse a pilot link whose pilot end date is in the past, or whose pilot end (UTC day) is on or before the link's expiry day (now + "Expires in (days)"). Binding in `create_invite_link`; the form shows the same rule live.
2. **R20 copy:** the onboarding profile intro must match validation (agency name, contact name, contact email, phone are required to save). Drafted copy in the plan, owner sign-off.
3. **Highlighted errors:** one shared error component, danger style from existing tokens (`--danger` #DC2626, soft tint, calm), icon, `role="alert"`, scroll into view + focus when a new error appears; applied to FormError, the lookup step and every trivial ad-hoc error box.
4. **Business lookup cards:** collapse identical place id / cid; show phone, website domain, category, rating + reviews, "Owner-verified" (DataForSEO `is_claimed`); "Address hidden — service-area business" when address is null; flag results as "Possible duplicate listing" when they share a phone with another result, or share a website domain and lie within 0.5 km of it (haversine; no coordinates ⇒ a domain match alone never flags — owner ruling 2026-10-17, so chain locations aren't marked), with a hint to pick the owner-verified one. Both the agency lookup step and the public intake form. Intake signing stays stable.
5. **Empty suggestions:** ready suggestions with no services and no keywords show "We couldn't find suggestions in the Google profile — here are common keywords for {vertical}." with the pack seed keywords as unticked chips.
6. **Pointer cursor:** "Enter details by hand" (and similar link-style buttons) get a pointer cursor; fixed globally for enabled buttons (Tailwind v4 dropped the default).
7. Owner test-step wording: no code change (skipped).

## New backlog (target → item)
- Polish → `DAY` literal duplicated in the invite-links form; import order in the swept files.
- Polish → agency CreateForm posts hint fields (schema strips them; tidy to SetupLookup keys); `DuplicateHint` not tied to the list via `aria-describedby`.
- Tech debt → third haversine copy (collectors `filters.ts`, intake `preview.ts`, setup `lookup.ts`): consolidate into `core/geo.ts` (13b's module has no haversine yet).
- Tech debt → collapse edge case with mixed placeId/cid (not transitive); phone extensions don't match as duplicates.
- Tests → `get_client_setup` ready with services only; no E2E for the "already passed" pilot refusal (core + tool tests cover it).
- A11y → `ErrorNote` role=alert + focus may double-announce on some screen readers (brief-mandated); document `focusKey` stability; global `scrollIntoView` stub in tests.

## Owner verification steps
1. `/platform/billing` → Pilot, pilot end = today, expiry 14 → live hint + refusal "The pilot must end after this link expires…"; pilot end = yesterday → "already passed"; pilot end = 30 days out, expiry 14 → link created.
2. `/onboarding` profile step: intro names the four required fields; save with contact blank → the error box is red-tinted with an icon and scrolls into view.
3. Any long form (e.g. client profile, agency team invite): trigger a refusal → danger-styled box, focused, scrolled into view.
4. `/agency/clients/new` on `cs_dev` with a real lookup of a known duplicate-listing business: one card per listing, phone/website/category/rating shown, "Owner-verified" on the claimed one, "Address hidden — service-area business" where Google hides it, "Possible duplicate listing" + hint on the twins.
5. Same search on the public `/start` intake page: same card details; submitting still works (signature unchanged).
6. Wizard business step for a client whose Google profile matched nothing: the note appears with unticked seed keyword chips.
7. Hover "Can't find it? Enter details by hand" (and any button): pointer cursor.
8. Sign off the copy in "Copy for owner sign-off" above.
9. Open an Ask thread with an old failed action, or a prospect with a failed snapshot: the error shows but focus stays put (no jump).
