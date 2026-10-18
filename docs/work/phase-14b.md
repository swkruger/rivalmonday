# phase-14b — Dynamic verticals, business areas and runbooks

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-14b   **Base:** main @ 9bd2aab5
**Spec:** [2026-10-17-phase-14-dynamic-verticals-runbooks-design.md](../superpowers/specs/2026-10-17-phase-14-dynamic-verticals-runbooks-design.md) (14a + 14b). **Plans:** [14a](../superpowers/plans/2026-10-18-phase-14a-vertical-catalogue.md), [14b](../superpowers/plans/2026-10-18-phase-14b-runbooks.md). Add a Phase 14 (14a, 14b) roadmap row at merge.

## Status (overwrite)
2026-10-18: 14a implemented (Tasks 0-12); final review fix wave done. Migrations 0077 (`vertical_catalog`) and 0078 (`llm_call_vertical`). 14b (runbooks, 10 tasks) not started.

## Next (overwrite)
Owner runs the verification steps below; then 14b Task 0 on the 14b plan.

## Interfaces this branch adds or changes
- **Tables (service-only RLS):** `vertical`, `business_area`, `vertical_category`, `vertical_draft` (0077, seeded from the YAML packs + `generic`); `llm_call.vertical_id` (0078, unconstrained text; drafts use `draft:<placeId>`). Merged rows keep `status='merged'` + `merged_into`, so old ids resolve.
- **`@cs/verticals`:** `createCatalog`/`Catalog`, `assemblePack`, `splitPack`, `GENERIC_VERTICAL_ID`, `similarVerticals`, `verticalDraftSchema`/`validateDraft`/`normaliseQuote`. Packs are seed + fixtures only.
- **`@cs/tools`:** `catalogOf(deps)`, `packsOf`, `catalogPacks`; `ToolDeps.catalog`, `ToolDeps.verticalDrafter`; `CallScope.verticalId`; `refuseClientData`/`hasClientData` (`catalog/client-data.ts`).
- **Tools:** `list_verticals` (web/mcp/ask), `create_vertical` (+ optional `businessName`, D3), `add_business_area`, `update_vertical`, `draft_vertical` (web, agency staff), `list_catalog_review` (platform viewer), `count_catalog_review`, `review_vertical`, `review_business_area`, `merge_vertical`, `merge_business_area` (staff). `list_platform_costs.aiByVertical`; `save_setup_profile.newAreas`; `SetupSuggestions.newAreas`; lead summaries gain `placeId`, `category`.
- **Web:** `/platform/verticals` (nav "Business types", pending badge); "New business type" panel in the lookup step and lead accept; "New" service chips in the setup business step; AI-by-business-type table on `/platform/costs`.
- **Env/CI:** `E2E_PORT` (default 3100) for parallel worktrees; truncateAll re-seeds the catalogue.

## Assumes from other branches
- 13b, phase-11-fixes and 13a2 were assumed and re-checked at Task 0; 14b re-checks 13a2 (`voice_override`, `/c/[clientId]/settings/customisation`).

## Decisions taken during execution (overrule here)
1. Draft cost: drafter tags calls `draft:<placeId>`; `create_vertical` re-keys them (agency-scoped) to the new id; `aiByVertical` folds leftover drafts into "Drafts not yet created". Why: owner step 6 needs draft cost under the type.
2. Categories also written to `vertical.gbp_categories`/`gbp_related_categories`; merges append the source's categories to the target's related list. Why: `assemblePack` and preselect read the row.
3. Assembled packs sort services by name (no order column). Overrule: add a `position` column.
4. `truncateAll` re-seeds the catalogue so existing tests run unchanged.
5. AI calls carry a vertical only when exactly one is in hand; multi-vertical and batch theme-discovery calls stay untagged (splitting cost is a guess).
6. `list_verticals` is also on `ask` (repo invariant); names never hold client data (D3). The check uses contact/URL detection plus the agency's client names, not `redactForModel` (it would refuse "Cancer Care").
7. Draft cap = 10 attempts per agency per UTC day (llm_call rows, null drafts count, cache hits free). Overrides "counted when stored": failures cost DataForSEO + Sonnet.
8. Draft cache is global by place; evidence copy is not agency-scoped (public profile text only); cost re-key is.
9. `save_setup_profile.newAreas` must match a stored suggestion and pass the client-data check: owners can tick offered chips, not type free text. New areas are created in a short transaction before the profile write (not atomic; worst case an orphan unreviewed area shown in the queue).
10. `list_catalog_review` is platform 'viewer'; writes 'staff'. Approving a type also approves its unreviewed areas.
11. Merge also re-keys `price_block_map` and stored setup suggestions, dedupes open `price_point` rows, flattens `merged_into` chains; staff `update_vertical` checks D3 against the creator agency. Catalogue lock order: catalogue -> vertical -> client rows. A catalogue miss older than 1.5 s reloads once (cross-process).
12. Agency onboarding validates ids via `catalogOf(deps).resolveId` (stores the target id).
13. E2E port 3100 is hard-coded upstream; made `E2E_PORT`-driven (other session holds 3100).

## New backlog (target → item)
- Unscheduled → Drop `playbook_override` (and tools/tests) after the 14b runbook backfill is verified in prod; new migration.
- 14b/polish → Batch theme-discovery spend (`discovery.ts` `collectBatch`) is untagged; per-result scope.
- Polish → unused `vertical_draft_agency_day_idx`; index `llm_call(agency_id, task, created_at)` for the cap query; draft cap not atomic; stale cached draft repeats paid misses.
- Polish → Test 0077's embedded seed equals `VERTICAL_CATALOG_SEED`; guard YAML pack use in prod paths.
- Polish → `add_business_area` has no ownership check (creator's `update_vertical` can delete another agency's areas); staff edits create areas attributed to the operator's agency.
- Polish → `update_vertical`/`review_vertical` rename skip similarity checks; no-op update bumps version; generic-only area names normalise to ''; `slugOf` drops non-ASCII.
- Polish → `position` column for area order.
- Polish → Client-data check skips seed keywords/audience noun/theme text; `save_setup_profile` stale `current` services on concurrent edit; GBP `services` read only for array shape.
- Polish → Panel: fixed `nbt-*` DOM ids collide with two open lead cards; quotes only in title tooltips (not keyboard/touch).
- Polish → Distillery E2E leaves rows in the shared E2E DB and is re-runnable only on a fresh DB; confirm no order dependence in the full run at `/rm-merge`.
- Polish → Generic theme id `technician_professionalism` keeps an HVAC noun (id kept stable; name is neutral).

## Owner verification steps
Acceptance: add a new **Distillery** client; onboarding creates its vertical and business areas where missing; the agency then customises the generic runbook for that client (14b).
On `cs_dev`, after migrating 0077-0078:
1. Look up a real distillery and draft it; the quotes match the Google profile.
2. Create it and finish setup.
3. A second distillery preselects the type.
4. Approve the type in `/platform/verticals`.
5. Merge a test duplicate.
6. `/platform/costs` shows the draft cost under the type.
7. Set a real distillery's Google profile and check the "New" service chips on a matched type.
Note: the Distillery E2E leaves rows in the shared E2E DB; the full E2E runs at `/rm-merge`.

## Copy for owner sign-off
**`packages/verticals/packs/generic.yaml`** (rewritten from HVAC wording; rest identical): `response_time` "the business ... shows up"; `technician_professionalism` name "Staff professionalism", "... conduct of the staff"; `fix_quality` name "Quality of work"; dropped cleanliness, upsell_pressure, scheduling themes; `price_cut_bundle` "a free add-on or priority scheduling"; `price_war_hold_position` "a repeat-customer offer"; `hiring_push_capacity` "early renewals or repeat-customer offers"; `ask_for_reviews` "right after the visit"; `consider_search_ads` "your main service"; `fix_theme` "tell your team"; `improve_map_rank` "photos of your work"; service `general` "General service"; category "Service establishment", no seed keywords.
**`platform/costs/_components/ai-by-vertical-table.tsx`:** "AI by business type (last 30 days)"; columns "Business type", "Calls", "Cost"; row "Drafts not yet created"; empty "No AI calls with a business type in the last 30 days."
**`tools/tools/verticals.ts` + `catalog/client-data.ts` (refusals):** "Names cannot include a client’s business name, phone number, email or web address."; "Another business type just claimed one of those categories. Try again."; "Use a more specific business type name."; "A similar business type already exists: {name}."; "Add at least one Google category that no other business type uses."; "Clients use {name}. Ask the platform team to merge it instead."
**Draft limit:** "You've drafted 10 new business types today. Try again tomorrow."
**`components/new-business-type.tsx`:** "We can draft it from the Google profile. You review it before anything is saved."; "Draft it"; "Drafting from the Google profile…"; "Did you mean {name}?"; "We couldn’t draft this business type. Enter a name and its main services."; "Add a service"/"Add a keyword"; "Create business type"; "Created {name}. Our team reviews new business types; you can use it now."; "Left out {list}: already used by another business type."
**Setup business step (`c/[clientId]/setup/steps/business-step.tsx`):** chip tag "New"; help "Not in our list yet. Tick to add it as a service; our team reviews new ones."; refusal "Pick new services from the suggestions."
**`/platform/verticals` (`catalog-queue.tsx`, `page.tsx`), invented by Task 11:** h1 and nav "Business types"; intro "New business types and services agencies added. Approve what is right, fix what is not, or merge duplicates into an existing entry."; headings "New business types", "New services"; buttons Approve, Rename, Edit, "Merge into…", "Save name", "Save changes", Merge, Cancel; merge option "Move (keep as a new service)"; column "Becomes"; card "Added by {agency} · N clients · draft cost $x.xxx"; "Evidence (n)"; "No evidence recorded."; results `Approved “X”.`, `Renamed to “X”.`, `Saved “X”.`, `Merged “X”.`; errors "Choose the business type to merge into.", "Choose the service to merge into.", "Could not read the changes. Try again."; merge refusals "A business type cannot be merged into itself.", "The generic business type cannot be merged.", "Both business types must be live (not already merged)."
