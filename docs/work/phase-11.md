# phase-11 — Client onboarding wizard (GBP/DataForSEO prefill, competitor review emails, billing)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-11   **Base:** main @ 4b1fb82
**Plan/spec:** `docs/superpowers/{specs,plans}/` — 11a (`2026-10-15-…-11a-…-design`, `2026-10-16-…-11a-…`), 11b, 11c (all `2026-10-16-phase-11{b,c}-*`).

## Status (overwrite)
2026-10-16: specs approved for 11a (D1–D11), 11b (E1–E7), 11c (L1–L8; L7 amended 11a/11b: prospects get the invite step). Plans: 11a Tasks 0–14 ✅ approved, 11b 15–24 ✅ approved, 11c 25–35 owner approval pending. Nothing built; execution waits for phase-10 merge.

## Next (overwrite)
After phase-10 merges: plan Task 0 pre-flight (rebase, pnpm install, own test DB `cs_phase_11_test`), then `superpowers:subagent-driven-development` Tasks 1–14, then 11b Tasks 15–24 (one final whole-branch review at the end). Meanwhile: brainstorm 11c if the owner wants.

## Interfaces this branch adds or changes
(planned, 11a) Table `client_setup`; tools `find_business`, `get_client_setup`, `save_setup_profile`, `pick_setup_competitors`, `advance_client_setup`; `create_client` + optional `lookup`; shared `applyClientProfileChange`, `getSetupState`, `startingPointClockStart` (readiness clock); collector `mapsSearchByText`, `collectGbpProfile` takes a real scope + parses description; AI task `setup_suggestions`; jobs `setup-suggestions`, `setup-reminders`; route `/c/[clientId]/setup`, `/agency/clients/new` rebuilt.

## Assumes from other branches
- **phase-10** (executing, not merged; spec/plan already on `main`): migrations from **0065** (`pending_signup`, `agency_profile`, `agency_onboarding`) → Phase 11 takes the **next free number at execution time** (≥ 0066). Edits `create_client` (`first_client_at` in its tx; reduced-trial refusal → `/onboarding?step=plan`), 9a `billingAccess` (+`reducedTrial`, `maxActiveClients`), `OutgoingEmail` (+`stream`/`headers`), `(app)` layout redirect to `/onboarding`. Adds `/onboarding?step=…` (agency steps only), `/agency` checklist with a `first_client` item, tools `get_onboarding_status`/`mark_onboarding_step`/`dismiss_onboarding_checklist`, emails via `billing_notice` outbox, daily `onboarding-nudges` job. Collisions: `/onboarding` route, `first_client` link target, `create_client` tx.
- **phase-7-planning** (parked, docs only): sender `mail.rivalmonday.app`, reply-to `support@`; no code overlap.

## Decisions (owner-approved)
11a spec D1–D11 (2026-10-15). Headline: split 11a (lookup/AI prefill/resumable wizard) / 11b (invite, competitor-review email + agency CC, billing step) / 11c (agency intake links + platform lead pool, manual assignment; amends Phase 10 f3 for clients); staff + client owner both run the wizard; DataForSEO Maps lookup on agency ledger; starting-point clock from competitors done (14-day cap).

Plus 11b spec E1–E7 (2026-10-16): two agency-branded emails (invite, competitor review) with real `Cc:`; invite step 4 any time; billing step 5 with per-client price, allowed with a pending invite; notification outbox + inactive contact at invite.

## New backlog (target → item)
- Later phase → automatic lead routing to agencies (vertical/area/capacity/opt-in) on the 11c lead pool.
- Backlog → sign-in page uses host default branding (may show Rival Monday to white-label clients) — check in 11b Task 24.
- 11c → neutral brand for platform-site client sign-up (nothing client-facing names Rival Monday).

## Owner verification steps
TBD.

## Brief

### 1. Scope
Roadmap row 11: "Multi-day GBP + DataForSEO prefill, competitor review emails, agency CC'd, billing"; plan *to be written*, **cites no spec §, no estimate**. Relevant: core **§4.1** (AM enters business/services/area → discovery → AM confirms 3–5 → page discovery), **§3** (roles; client owner `manage_competitors`), **§5.2 item 11** (client settings), **§9.4** (single sending domain), **§12** (E2E for onboarding). Build: guided client set-up that (a) finds the business on Google (DataForSEO) and prefills profile + place id, (b) is resumable over days while discovery/reviews/rank scan land, (c) emails the client to review competitors, agency CC'd, (d) ends in client invite + 9b billing.

### 2. Already built — reuse, don't rebuild
- **Client create/profile:** `create_client`, `update_client_profile` (`packages/tools/src/tools/onboarding.ts`; both call `startFirstAutoSearch` once keywords + service area + place id exist); `get_client_profile` (`tools/clients.ts`); `client-input.ts` validation; form `apps/web/src/components/client-profile-form.tsx` (place id is a **manual text field** today), pages `/agency/clients/new`, `/c/[clientId]/settings/profile`. Prospects: `convert_prospect`.
- **Google lookup building blocks:** `collectors/src/local/maps.ts` (`mapsSearch`, `parseMapsItems` → `MapsPlace`), `collectors/src/gbp/collect-gbp.ts`, `local/self.ts` (`ensureSelfCompetitor`, `SELF_SOURCES` gbp/reviews/ads_google). No business-search tool exists.
- **Discovery (12a):** `startCompetitorSearch`/`startFirstAutoSearch` in `tools/src/rival-search.ts` (refusals `missing_profile|cooldown|running|daily_cap|weekly_limit|service_paused|enqueue_failed`); tools `request_competitor_suggestions`, `get_competitor_search_status`, `list_competitor_suggestions`, `accept_competitor_suggestion(s)`, `dismiss_competitor_suggestion`, `add_competitor`, ad-match confirm/remove (`tools/competitors.ts`); `discovery_run`.
- **Starting point (12b):** `engine/src/briefs/readiness.ts` (`startingPointReadiness` checks profile/reviews/rankings/competitors; `STARTING_POINT_WAIT_HOURS` 48 after `activated_at`), jobs `starting-point-schedule`/`-client`
- **People:** `invite_member` (role `client_owner|client_viewer` + `clientId`; `tools/access/invitations.ts`, 14-day TTL), `/agency/team`; `add_client_recipient`/`contact` for brief emails; client feature flags (`manage_competitors`).
- **Billing (9b):** `enable_client_billing` (needs a client owner email, active client, Connect `charges_enabled`, 9a state `active|pilot`), UI `/agency/settings/billing/client-billing`; `assertCanActivateClient`, `postCommitSeatSync`.
- **Email:** `@cs/email` (`client-billing-notice.tsx` = agency-branded client mail), `notification` + `billing_notice` outboxes; `OutgoingEmail` has **no cc**.

### 3. Binding decisions (do not re-open)
- Public data only; vendor APIs only for discovery (12a D1); $3/run cap, 5 runs/agency/day, auto-run once on profile completion, then 1 manual search/client/week + monthly refresh (12a D4/D7, root CLAUDE.md). AM confirms competitors; top rivals pre-ticked (D5). 
- One starting-point brief per client, ready-or-48 h, normal AM approval (D10/D11).
- 9b f4/f7/f8/f13: billing turned on by agency admin, email to client owner, Connect Standard direct charges, **nothing client-facing names Rival Monday**; paused clients get no recurring work.
- Phase 10 f3: agency staff and client users stay **invitation-only**; self-serve SMB never. f6: "Add your first client" is a checklist item, not a Phase 10 step. f12: open trial = 1 active client, weekly.
- Web reads via registered tools, writes via `runTool`; refusals → 404; prospects/schedulers filter `client.status='active'` + `clientServiceable`; no jobs in DEMO/TEST; new env vars need owner approval + `turbo.json`. New screens → `packages/demo/src/coverage.ts`.

### 4. Backlog to fold in
9b M5 (per-client price at enable) → folded into 11b. CS Dev Verification Agency/Client clean-up → before real onboarding (owner).

### 5. In-flight workstreams
See **Assumes from other branches**.

### 6. Open questions
All answered 2026-10-15 — see Decisions and the 11a spec §2. 11b/11c questions (CC mechanism, billing step, intake/lead pool) go to their own brainstorms.
