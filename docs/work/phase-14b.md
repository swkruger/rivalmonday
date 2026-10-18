# phase-14b — Dynamic verticals, business areas and runbooks

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-14b   **Base:** main @ 9bd2aab5
**Spec:** [2026-10-17-phase-14-dynamic-verticals-runbooks-design.md](../superpowers/specs/2026-10-17-phase-14-dynamic-verticals-runbooks-design.md) (covers 14a + 14b). **Plan:** none yet. No Phase 14 roadmap row and no "14a" anywhere (roadmap, BACKLOG, STATE, work files) — see Q1; add the row at merge.

## Status (overwrite)
2026-10-17: brainstorm done, design approved section by section; spec written, awaiting owner review.

## Next (overwrite)
Owner reviews the spec, then `superpowers:writing-plans` (lean format) — 14a plan first, 14b plan second.

## Interfaces this branch adds or changes
None yet. Migrations: next free at execution time (main 0073; 13b holds 0074–0076; 13a1/13a2 claim the next four).

## Assumes from other branches
- **phase-13b** (folded, awaiting merge): `@cs/core` gains `tier_change` (CHANGE_TYPES) + `map_climb` (MOVE_TYPES); both packs gain `type_weights.tier_change`, playbook `map_climb_defend`, `scoring.version: 3`; `ClientRow` moves to `@cs/db`; `ServiceAreaWrite` in `create_client`/`update_client_profile`/`save_setup_profile`; `profile-change.ts` enqueues a map refresh. A pack→DB migration must carry these keys.
- **phase-11-fixes** (in review, no migrations): `get_client_setup.vertical` gains `name`; empty suggestions show pack `discovery.seed_keywords` chips; edits `setup/lookup.ts`, `tools/setup.ts`, `onboarding/steps/profile.tsx`.
- **13a2** (planned): `client.voice_override` + `effectiveVoice` overlay; page `/c/[clientId]/settings/customisation` which 13a D7 says a runbook phase extends.
- **phase-7-planning** (parked): only its "file tracing for `packages/verticals/packs/`" item (moot if packs move to the DB).

## Decisions (owner-approved)
D1–D14 in the spec §1: 14a catalogue → 14b runbooks; business area = one-level service offers; anyone creates, usable now, operator queue reviews/merges; generic numbers + AI-drafted quoted text; rules-first GBP mapping, AI only on no match; seed HVAC/dental with same ids; per-vertical AI cost shown on /platform/costs; runbooks copy + "update available", platform → agency → client; plays + self-rules + safe knobs; AI-tailored client copies; agency-only; editors /platform/runbook, /agency/runbook, /c/[id]/settings/runbook.

## New backlog (target → item)
None yet.

## Owner verification steps
Acceptance: add a new **Distillery** client; onboarding creates its vertical and business areas where missing; the agency then customises the generic runbook for that client.

## Brief

### 1. Scope (from the owner's words)
- **Verticals as data:** a global list agencies/self-starting clients extend; auto-created in client setup/intake when missing, prefilled from DataForSEO GBP data + LLM. Same for **business areas** (service offers per vertical).
- **Runbooks:** one platform generic runbook inherited by agencies and clients; agency customises per client by vertical + business areas.
- Core spec: §4.1 (services "from vertical catalog"), §6.2–6.3 (tagging per vertical, `type_weight[vertical][type]`, versioned config, stored factors), §6.5 (themes per vertical), §8.5 (playbooks per vertical, agency-editable), §10.5 (YAML packs + per-agency DB overrides), §2.2 (more verticals was "later").

### 2. Already built — reuse, don't rebuild
- **Pack** `packages/verticals/src/schema.ts`: id, name, version, `audience_noun`, `services[]` {id,name,aliases} (= today's business areas), `themes`, `type_weights` (strict over CHANGE_TYPES), `move_thresholds`, `playbooks` (trigger, title, template, effort/impact), `scoring`, `self_rules` (12b), `discovery` (seed keywords, GBP `categories`/`related_categories`, grid, $3 cap, tiers). Read from disk `packs/*.yaml` (`loader.ts`); caches `createPackLoader` (`engine/src/tag/tag-stage.ts`), `packsOf` (`tools/src/deps.ts`), `apps/web/src/server/verticals.ts`.
- **DB:** `client.vertical_id`/`services` (pack ids)/`keywords`/`score_thresholds` (`db/schema/tenancy.ts`); `playbook_override` (agency × vertical × playbook; `briefs.ts`) = only agency override; `agency_profile.verticals` (`onboarding.ts`). Global per-vertical rows: `event.services` `{verticalId: serviceId}`, `review_analysis`, review cache, `theme_proposal` (operator queue `/platform/themes` — a moderation pattern to copy), `price_point`; `event_score.pack_version`.
- **"Runbook" today:** none. Closest: pack playbooks + `playbook_override` (`tools/src/tools/playbooks.ts`, `/agency/playbooks`, `engine/src/briefs/playbooks.ts`), `self_rules` (`briefs/self-rules.ts`, `starting-point.ts`), `client.score_thresholds`.
- **Setup:** `find_business` → `preselectVertical` exact match on `discovery.categories` then `related_categories` (`tools/src/setup/lookup.ts`, `tools/setup.ts`); `packFor` refuses unknown ids (`setup/profile-change.ts`); `clientInputProblems` checks services vs pack (`client-input.ts`); worker `setup-suggestions` (`apps/worker/src/jobs/setup.ts`) proposes services + keywords with quotes; leads `suggestedVerticalId`, `accept_lead`/`assign_lead` (`tools/leads.ts`, `platform-leads.ts`); select in `agency/clients/new/lookup-step.tsx`, `client-profile-form.tsx`.
- **DataForSEO:** `serp/google/maps/live/advanced`, `business_data/google/my_business_info/live` (category, `category_ids`, `additional_categories`, `services[]`, `place_topics`, `people_also_search`; research doc §1b), reviews, ads, jobs. Category-catalogue and keyword-ideas endpoints unused and unverified.
- **Consumers:** tagging asks per vertical of every client tracking a competitor (`competitorVerticals`, `tag/{questions,structured}.ts`) — cost scales with verticals; `reviews/{themes,discovery,complaints,benchmark}.ts`; `score/score.ts`; `moves/rules.ts`; `prices/`; `briefs/{gather,generate,recommendations}.ts`, `alerts/`; `collectors/src/rivals/{run,score}.ts`, `signals/tracked.ts`; workspace tools (`events`, `pricing`, `reputation`, `themes`, `moves`, `overview`, `portfolio`).
- **Hard-coded HVAC/dental:** `apps/web/src/app/(app)/agency/page.tsx:18` `VERTICAL_LABELS`; `(app)/onboarding/steps/profile.tsx:20-21`; `packages/tools/src/tools/agency-onboarding.ts:14` `VERTICALS` zod enum; `packages/ask/src/turn.ts:66` prompt; `collectors/src/evidence/model-privacy.ts:6` (vertical terms kept unredacted — review per vertical); `apps/web/src/server/setup-lookup.ts` fake dentists. Fixtures default `hvac_plumbing` (`db/test/helpers.ts`, `tools/workspace-fixtures.ts`, `engine/test/seed.ts`); `packages/demo` seeds both.

### 3. Binding decisions
Root `CLAUDE.md` § Decisions (pilot verticals extended, not replaced; Jev cascade, τ 0.85; discovery $3/tiers; Phase 11 wizard + clock; deterministic starting point; white-label). Spec §6.3 versioned config + factors; 13a D6/D7.

### 4. Backlog to fold in
- [ ] Let agencies add their own verticals and services (feature-sized) — *from phase5-polish*
- [ ] Agencies add their own business types (verticals) and services, not just built-in packs — *from end-of-Phase-5 owner request*
- [ ] Generic runbook with per-client customisation (replaces per-vertical packs; merge with the custom-verticals item above) — own future phase — *owner idea 2026-10-17*
- [ ] Vercel file tracing for `packages/ai/config/ai.yaml` and `packages/verticals/packs/` — *from Phase 1 review*
- [ ] Late-added vertical doesn't re-analyse already-analysed reviews; theme approved mid-window not asked of older reviews — *from 3c (decisions 4, 8)*
- [ ] Review-spike thresholds (`REVIEW_SPIKE_Z`, `REVIEW_SPIKE_MIN`, `REVIEW_BASELINE_WEEKS`) not pack-tunable; `review_spike` reuses one z-score for velocity and complaint Poisson — *from 3b/3c*
- [ ] Automatic lead routing to agencies (vertical/area/capacity/opt-in) on the 11c platform pool - *phase-11*
- [ ] Playbook disable/enable intents submit the current (unsaved) title/template fields (`agency/playbooks/actions.ts`) — *from 5b-2 Minor 5*
- [ ] Playbook titles aren't checked for placeholders (`packages/tools/src/tools/playbooks.ts`); refuse `{{` in titles — *from 5b-2 Minor 6*

### 5. In-flight workstreams
See **Assumes from other branches** (13b + phase-11-fixes merge first).

### 6. Open questions (by design impact)
1. **Split / naming** (no 14a exists). (a) 14a dynamic verticals + business areas, then 14b runbooks, planned on this branch; (b) one go here, "14a" reserved for something else — which?; (c) no split. **Rec (a)**: runbooks reference the catalogue; 14a touches every engine consumer.
2. **"Business area" =** (a) service offers in a vertical (pack `services`, one level); (b) vertical → areas → offers; (c) a client's Google categories. **Rec (a)**, GBP categories as mapping input only.
3. **Runbook model.** (a) overlay platform → vertical → agency → client, sparse patches resolved at read, version-stamped (like `playbook_override`/`effectiveVoice`); (b) copy-on-write, no updates flow down; (c) copy + "update available" pull. **Rec (a)**.
4. **New vertical contents.** (a) generic defaults for numeric knobs + LLM-drafted, quoted text (name, audience noun, areas, aliases, seed keywords, categories, themes, playbook wording) reviewed in the wizard; (b) LLM drafts all incl. weights; (c) defaults, hand-typed rest. **Rec (a)**.
5. **Governance.** (a) any agency user (intake: draft) creates, usable at once, "unreviewed" until an operator approves/merges/renames (like `theme_proposal`); (b) agency-private until promoted; (c) platform-only via requests. Dedup by GBP category id, slug, name similarity. **Rec (a)**; no client data in names.
6. **GBP → vertical/areas.** (a) deterministic: primary category id + matched list; no match ⇒ draft vertical; areas from GBP `services[]` + rivals' categories; (b) LLM/Jev maps or proposes; (c) import DataForSEO's catalogue as fixed taxonomy. **Rec (a), (b) on no match**; verify endpoints live.
7. **Runbook contents.** (a) playbooks + self-rules; (b) whole pack per client; (c) (a) + safe knobs (thresholds, focus areas, tier limits, playbook on/off). **Rec (c)**.
8. **HVAC/dental migration.** (a) seed DB from YAML with same ids, `playbook_override` → agency layer, YAML as fixtures; (b) YAML + DB side by side; (c) fold into generic. **Rec (a)**.
9. **Visibility.** (a) agency-only, clients see effects; (b) owner views; (c) owner edits. **Rec (a)**; platform text never names Rival Monday.
10. **Per-vertical AI cost.** (a) accept, show on `/platform/costs`; (b) cap verticals per competitor/share answers; (c) tag generic areas only. **Rec (a)**.
11. **Editor location.** (a) extend 13a2 Customisation page; (b) `/c/[clientId]/settings/runbook`; (c) `/agency/runbooks`. **Rec (a)** if 13a2 lands first, else (b).
