# phase-14b — Dynamic verticals, business areas and runbooks

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-14b   **Base:** main @ f1ec9683 (rebased onto 15a 2026-10-19)
**Spec:** [2026-10-17-phase-14-dynamic-verticals-runbooks-design.md](../superpowers/specs/2026-10-17-phase-14-dynamic-verticals-runbooks-design.md). **Plans:** [14a](../superpowers/plans/2026-10-18-phase-14a-vertical-catalogue.md), [14b](../superpowers/plans/2026-10-18-phase-14b-runbooks.md). Add a Phase 14 (14a, 14b) roadmap row at merge. Assumes 13a2 (`voice_override`, `/c/[clientId]/settings/customisation`).

## Status (overwrite)
2026-10-19: 14a + 14b complete (all tasks, final reviews + fix waves). Rebased onto 15a, placed per 15 spec §3 (Platform › Content: Business types, Runbook; `/agency/settings/runbook` replaces Playbooks; Client settings Runbook tab). After rebase: test:affected 16/16, E2E 112/112 (`E2E_PORT=3101`). Migrations 0077-0079. Nothing uncommitted. Local backup branch `phase-14b-pre-15a-backup` (delete after merge).

## Next (overwrite)
Owner go-ahead → `/rm-merge phase-14b`. Then on `cs_dev`: migrate 0077-0079, `pnpm --filter @cs/worker runbook:backfill --dry-run`, then real run, then the verification steps below.

## Interfaces
- **14a:** tables `vertical`, `business_area`, `vertical_category`, `vertical_draft` (service-only RLS, seeded from YAML packs); `@cs/verticals` `createCatalog` (+ `generic()`), `assemblePack`, `similarVerticals`, `validateDraft`; tools `list_verticals`, `create_vertical`, `add_business_area`, `update_vertical`, `draft_vertical`, review/merge tools; `/platform/verticals`; `E2E_PORT` (default 3100).
- **14b tables:** `runbook` (level platform/agency/client, `tailor_status`) and `runbook_item` (key `play:`/`self_rule:`/`knob:`, `version`, `upstream_version`, `upstream_snapshot`, `customised`, `removed_upstream`); `brief_item/recommendation.playbook_version`.
- **Engine** (`runbook/`): `loadClientRunbook` (client runbook, else legacy when the agency has overrides, else agency runbook only if `packUsesGenericPlays`, else legacy), `ensure*Runbook`, `copyItems`, `legacyClientItems`, `tailorClientRunbook`, `compareWithParent`. Tools `get_runbook`, `update_runbook_item`, `set_runbook_item_enabled`, `pull_runbook_update`, `dismiss_runbook_update`, `add_runbook_item`, `remove_runbook_item`, `retailor_runbook_item`; `update_playbook` removed. Pages `/platform/runbook` (Platform › Content), `/agency/settings/runbook` (Agency settings, replaces Playbooks), `/c/[id]/settings/runbook` (Client settings tab); `/agency/playbooks` and `/agency/settings/playbooks` redirect (next.config, 308).

## Decisions taken during 14a execution
Draft calls tagged `draft:<placeId>` and re-keyed on create; categories mirrored to the row; services sort by name; 10 drafts/agency/UTC day; owners tick offered area chips only; approving a type approves its areas; merges re-key prices/suggestions; `E2E_PORT` replaces hard-coded 3100.

## Decisions taken during 14b execution
- Agency runbook applies only when `packUsesGenericPlays` (R6 false for HVAC/dental); legacy otherwise.
- `legacyClientItems` lives in Task 5 (the tailor base needs it); non-generic packs tailor from it.
- A child-added item whose key the parent later adds shows `update_available`; empty `businessAreaIds` = unrestricted.
- Platform runbook reads at operator 'viewer', writes 'staff'; `generic` passed as a dep (the catalogue refuses `packs('generic')`).
- Focus areas applied in `selectBriefItems`; tailored rows written directly (not `customised`).
- `client.score_thresholds` holds a value only when the knob is customised; `set_alert_rules` also writes the knob item.
- "Keep"/"Not now" are session-only; platform level is called "standard runbook".
- `playbookTools` stayed until Task 8; the Task 0 `test:affected --base main` re-run was skipped (14a review ran it).

## New backlog (target to item)
- Unscheduled: drop `playbook_override` (and tools/tests) after the backfill is verified in prod; new migration.
- 14b/polish: prospects are never tailored on activation; paid `retailor_runbook_item` has no rate limit; "Keep"/"Not now" not persisted; preview lacks candidate vars.
- 14b/polish: `set_alert_rules` column + item writes non-atomic; create-vs-pause race; platform thresholds knob shadows a pack's own routing; redundant runbook loads per brief.
- Platform runbook is seeded once from generic.yaml; add a "sync platform runbook" step so later generic/pack additions reach existing runbooks.
- 14b/polish: score stage needs a thresholds-only loader / per-run cache; legacy `customised` flag conflates pack-vs-generic wording with human edits ('*' then tailors fewer HVAC plays); redaction tokens can be written back from askModel; starting-point actions from tailored templates lack a fact check.
- Polish: batch theme discovery untagged; draft-cap index/atomicity; `add_business_area` has no ownership check; rename skips similarity checks; `position` column for areas; client-data check skips seed keywords; merged areas can point across verticals; generic theme `technician_professionalism`; Distillery E2E rows linger (fresh DB).

## Owner verification steps
Acceptance: add a Distillery client; onboarding creates its vertical and areas; its runbook is tailored from the generic one. On `cs_dev` after migrating 0077-0079:
1. 14a: look up and draft a real distillery (quotes match the profile), create it, finish setup; a second distillery preselects it; approve it in `/platform/verticals`; merge a duplicate; `/platform/costs` shows the draft cost.
2. Run the backfill; existing clients' next briefs are unchanged.
3. A Distillery client's runbook is tailored and the quotes make sense.
4. Customise a play; the next brief uses it.
5. An agency edit shows "Update available" on the client.
6. A platform runbook edit reaches agencies as an update.

## Copy for owner sign-off
**generic.yaml** (reworded from HVAC): themes "Staff professionalism", "Quality of work"; plays `price_cut_bundle` "a free add-on or priority scheduling", `price_war_hold_position` "a repeat-customer offer", `hiring_push_capacity`, `ask_for_reviews`, `consider_search_ads`, `fix_theme`, `improve_map_rank`; service "General service".
**Costs table:** "AI by business type (last 30 days)", "Drafts not yet created", empty "No AI calls with a business type in the last 30 days."
**Refusals/limits:** "Names cannot include a client's business name, phone number, email or web address."; "Use a more specific business type name."; "A similar business type already exists: {name}."; "Add at least one Google category that no other business type uses."; "Clients use {name}. Ask the platform team to merge it instead."; "You've drafted 10 new business types today. Try again tomorrow."
**New business type / setup:** "We can draft it from the Google profile. You review it before anything is saved."; "Draft it"; "Did you mean {name}?"; "Create business type"; "Created {name}. Our team reviews new business types; you can use it now."; chip "New", "Not in our list yet. Tick to add it as a service; our team reviews new ones."
Also: "Drafting from the Google profile..."; "We couldn't draft this business type. Enter a name and its main services."; "Add a service"/"Add a keyword"; "Left out {list}: already used by another business type."; "Another business type just claimed one of those categories. Try again."; setup refusal "Pick new services from the suggestions."
**/platform/verticals:** nav/h1 "Business types"; intro "New business types and services agencies added. Approve what is right, fix what is not, or merge duplicates into an existing entry."; "New business types", "New services"; Approve, Rename, Edit, "Merge into...", "Save name", "Save changes", Merge, Cancel; "Move (keep as a new service)"; column "Becomes"; "Added by {agency} - N clients - draft cost $x.xxx"; "Evidence (n)"; "No evidence recorded."; results Approved/Renamed/Saved/Merged "X"; errors "Choose the business type to merge into.", "Choose the service to merge into.", "Could not read the changes. Try again.", "A business type cannot be merged into itself.", "The generic business type cannot be merged.", "Both business types must be live (not already merged)."
**Tailoring prompt (Task 5, system message):** "Rewrite each play's title and template so it fits a {vertical} serving {audience}. Keep every {{placeholder}} exactly as written, add no new placeholders, keep titles under 200 characters with no placeholders, keep the advice practical and specific to the listed services. Optionally limit a play to the service ids it is about (businessAreaIds, or null for no limit). Return JSON."
**Owner to consider:** a "no facts, prices or claims about competitors" clause in the tailoring prompt; the banner "This client uses the agency runbook." also shows for legacy-pack (HVAC/dental) clients.
**Runbook pages, decided (Task 8):** badges Inherited, Customised, Update available, New, Removed upstream; Use the update / Keep mine; "Tailored for this client", Use as is; "New play available" Add / Not now; "No longer in the agency runbook" Keep / Remove; "This client uses the agency runbook." + "Create a runbook for this client"; "Tailoring plays for {vertical}..."; "We couldn't tailor these plays. They match the agency runbook; edit them as needed."
**Invented (Task 8):** "A newer version is available from the {agency|standard} runbook." / "Review update" / "What changed in the {...}" / "New {play|rule|setting} available"; "Approve"; "We couldn't tailor this update for the client. You can use the agency runbook text as it is."; "Effort: Low/Medium/High"; "Only for these services" + "Leave all unticked to use this play for every service."; "Unknown placeholder {{x}}. Use one of ..."; "The title cannot contain placeholders."; knobs "Alert and brief thresholds", "Focus services", "Competitor tiers"; "Switch it off to leave it out of the starting-point brief."; page intros.
