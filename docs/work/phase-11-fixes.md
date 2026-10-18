# phase-11-fixes — owner-testing fix batch (pilot links, errors, lookup cards, copy)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-11-fixes   **Base:** main @ 9bd2aab5
**Plan/spec:** [plan](../superpowers/plans/2026-10-17-phase-11-fixes.md) (no spec: small fix batch, decisions below)

## Status (overwrite)
Built, Tasks 0-7 (plan owner-approved 2026-10-17 incl. duplicate rule). E2E added: pilot refusal (`signup.spec.ts`), lookup card badge + phone (`client-setup.spec.ts`), intake card badge and submit (`intake.spec.ts`). Final whole-branch review pending.

## Next (overwrite)
Final whole-branch review (most capable model, `test:affected` + `e2e:affected --base main`), one fix wave (deferred minors below), owner sign-off of the copy below, then `/rm-merge` on the owner's go-ahead.

## Copy for owner sign-off
- Pilot refusal: "The pilot must end after this link expires on {date}. Choose a later pilot end date or a shorter expiry." / "The pilot end date has already passed. Choose a later date." (also shown as a quiet live hint in the form)
- Card badges: "Owner-verified"; "Possible duplicate listing"; line "Address hidden — service-area business"; phone · domain line.
- Duplicate hint: "Google shows more than one listing with the same phone number or website. Pick the owner-verified one if it's there."
- Empty suggestions: "We couldn't find suggestions in the Google profile — here are common keywords for {vertical}."
- R20: the onboarding profile intro naming the four required fields (agency name, contact name, contact email, phone).

## Interfaces this branch adds or changes
- **No migrations.** `SetupLookup` / `setupLookupSchema` / `intakeLookupSchema` are **unchanged** (persisted shape and the 11c intake signature canonical form stay the same).
- `@cs/core`: new pure module `invite-offer.ts` (`pilotLinkRefusal`), exported from the index **and** a new subpath export `@cs/core/invite-offer` (client-safe import for the web form).
- `@cs/tools` `setup/lookup.ts`: `collapseSameListing`, `possibleDuplicates`, `phoneKey`, `domainKey`, `haversineKm`, `DUPLICATE_DOMAIN_KM`.
- Tool outputs (web-only tools, no MCP schema change): `find_business` places gain `isClaimed: boolean | null`, `possibleDuplicate: boolean`; `get_client_setup.vertical` gains `name: string`. `intakeLookup` returns `IntakePlaceOption[]` (= `SignedIntakePlace & { isClaimed, possibleDuplicate }`, the extra fields unsigned, display only).
- `create_invite_link` refuses pilot end dates in the past or on/before the link's expiry day (`invalid_input`, user-facing copy).
- Web: `ErrorNote` in `apps/web/src/components/form-error.tsx` (FormError now uses it; danger-tinted, icon, `role="alert"`, scroll + focus on a new error); `PlaceSummary` in `apps/web/src/components/place-summary.tsx`; global `cursor: pointer` for enabled buttons in `packages/ui/src/styles.css`.

## Assumes from other branches
- **phase-13b** (in flight) also edits `packages/core/src/index.ts` (adds `geo`), `client-profile-form.tsx`, `webhook-controls.tsx`, `rankings/page.tsx`: all additive / textual neighbours. 13b adds four new old-style `role="alert"` boxes (rankings page, rank-settings sheet, scan-now button); whichever branch merges second converts them to `ErrorNote` (or a notice style for the two "selection/settings changed" lines).

## Decisions (owner-approved 2026-10-17)
1. **Pilot invite links:** refuse a pilot link whose pilot end date is in the past, or whose pilot end (UTC day) is on or before the link's expiry day (now + "Expires in (days)"). Binding in `create_invite_link`; the form shows the same rule live.
2. **R20 copy:** the onboarding profile intro must match validation (agency name, contact name, contact email, phone are required to save). Drafted copy in the plan, owner sign-off.
3. **Highlighted errors:** one shared error component, danger style from existing tokens (`--danger` #DC2626, soft tint, calm), icon, `role="alert"`, scroll into view + focus when a new error appears; applied to FormError, the lookup step and every trivial ad-hoc error box.
4. **Business lookup cards:** collapse identical place id / cid; show phone, website domain, category, rating + reviews, "Owner-verified" (DataForSEO `is_claimed`); "Address hidden — service-area business" when address is null; flag results as "Possible duplicate listing" when they share a phone with another result, or share a website domain and lie within 0.5 km of it (haversine; no coordinates ⇒ a domain match alone never flags — owner ruling 2026-10-17, so chain locations aren't marked), with a hint to pick the owner-verified one. Both the agency lookup step and the public intake form. Intake signing stays stable.
5. **Empty suggestions:** ready suggestions with no services and no keywords show "We couldn't find suggestions in the Google profile — here are common keywords for {vertical}." with the pack seed keywords as unticked chips.
6. **Pointer cursor:** "Enter details by hand" (and similar link-style buttons) get a pointer cursor; fixed globally for enabled buttons (Tailwind v4 dropped the default).
7. Owner test-step wording: no code change (skipped).

## New backlog (target → item)
- Polish → convert phase-13b's new ad-hoc `role="alert"` boxes after both branches merge (if not done at merge).
- Polish → blank expiry days hides the live pilot hint though the server defaults to 14 (use `toInt(days || '14')`); `DAY` literal duplicated in the form.
- Polish → missing `focusKey` on action-state errors (review-queue, theme-queue, knowledge editor Notice, intake-link-card `saved.error`, ad-match-chips, sign-up-form); dropped `text-sm` in disconnect-dialog + ad-match-chips.
- Polish → agency CreateForm posts hint fields (schema strips them; tidy to SetupLookup keys); duplicate ternary classes in the address line; `DuplicateHint` not tied to the list via `aria-describedby`.
- Tech debt → third haversine copy (collectors `filters.ts`, intake `preview.ts`, setup `lookup.ts`): consolidate into 13b's `core/geo.ts`.
- Tech debt → collapse edge case with mixed placeId/cid; phone extensions don't match as duplicates.
- Tests → `get_client_setup` ready with services only; pack-name test asserts non-empty, not exact.
- Note: `ErrorNote` role=alert + focus may double-announce on some screen readers (brief-mandated).

## Owner verification steps
1. `/platform/billing` → Pilot, pilot end = today, expiry 14 → live hint + refusal "The pilot must end after this link expires…"; pilot end = yesterday → "already passed"; pilot end = 30 days out, expiry 14 → link created.
2. `/onboarding` profile step: intro names the four required fields; save with contact blank → the error box is red-tinted with an icon and scrolls into view.
3. Any long form (e.g. client profile, agency team invite): trigger a refusal → danger-styled box, focused, scrolled into view.
4. `/agency/clients/new` on `cs_dev` with a real lookup of a known duplicate-listing business: one card per listing, phone/website/category/rating shown, "Owner-verified" on the claimed one, "Address hidden — service-area business" where Google hides it, "Possible duplicate listing" + hint on the twins.
5. Same search on the public `/start` intake page: same card details; submitting still works (signature unchanged).
6. Wizard business step for a client whose Google profile matched nothing: the note appears with unticked seed keyword chips.
7. Hover "Can't find it? Enter details by hand" (and any button): pointer cursor.
8. Sign off copy marked "owner sign-off" in the plan.
