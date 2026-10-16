# phase-11 — Client onboarding wizard (GBP/DataForSEO prefill, competitor review emails, billing)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-11   **Base:** main @ 4b1fb82
**Plan/spec:** 11a spec `docs/superpowers/specs/2026-10-15-phase-11a-client-setup-wizard-design.md` (owner review pending)

## Status (overwrite)
2026-10-15: brainstorm done; 11a spec written, awaiting owner review. 11b/11c not brainstormed.

## Next (overwrite)
Owner reviews 11a spec → `superpowers:writing-plans` (lean) → approval. Execution waits for phase-10 merge (or owner-approved stacking).

## Interfaces this branch adds or changes
(planned, 11a) Table `client_setup`; tools `find_business`, `get_client_setup`, `save_setup_profile`, `pick_setup_competitors`, `advance_client_setup`; `create_client` + optional `lookup`; shared `applyClientProfileChange`, `getSetupState`, `startingPointClockStart` (readiness clock); collector `mapsSearchByText`, `collectGbpProfile` takes a real scope + parses description; AI task `setup_suggestions`; jobs `setup-suggestions`, `setup-reminders`; route `/c/[clientId]/setup`, `/agency/clients/new` rebuilt.

## Assumes from other branches
- **phase-10** (executing, not merged; spec/plan already on `main`): migrations from **0065** (`pending_signup`, `agency_profile`, `agency_onboarding`) → Phase 11 takes the **next free number at execution time** (≥ 0066). Edits `create_client` (`first_client_at` in its tx; reduced-trial refusal → `/onboarding?step=plan`), 9a `billingAccess` (+`reducedTrial`, `maxActiveClients`), `OutgoingEmail` (+`stream`/`headers`), `(app)` layout redirect to `/onboarding`. Adds `/onboarding?step=…` (agency steps only), `/agency` checklist with a `first_client` item, tools `get_onboarding_status`/`mark_onboarding_step`/`dismiss_onboarding_checklist`, emails via `billing_notice` outbox, daily `onboarding-nudges` job. Collisions: `/onboarding` route, `first_client` link target, `create_client` tx.
- **phase-7-planning** (parked, docs only): sender `mail.rivalmonday.app`, reply-to `support@`; no code overlap.

## Decisions (owner-approved)
11a spec D1–D11 (2026-10-15). Headline: split 11a (lookup/AI prefill/resumable wizard) / 11b (invite, competitor-review email + agency CC, billing step) / 11c (agency intake links + platform lead pool, manual assignment; amends Phase 10 f3 for clients); staff + client owner both run the wizard; DataForSEO Maps lookup on agency ledger; starting-point clock from competitors done (14-day cap).

## New backlog (target → item)
- Later phase → automatic lead routing to agencies (vertical/area/capacity/opt-in) on the 11c lead pool.
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
`docs/BACKLOG.md` has **no Phase 11 / client onboarding heading**. Related (fold in only if the owner agrees):
- [ ] Per-client price/setup fee at enable time in the UI (today: enable at default, then change price → second link) — *9b M5*
- [ ] Review/rename/remove the `CS Dev Verification Agency`/`Client` (`aaf5e009-…`/`25f99947-…`) before real onboarding — *from HANDOVER §5 item 5*

### 5. In-flight workstreams
See **Assumes from other branches**. `phase-10` diff today: sharp dep + work file. `phase-7-planning`: 7a docs only.

### 6. Open questions for the owner
1. **Split?** (a) one phase; (b) **11a** lookup/prefill + resumable wizard + discovery step, **11b** client invite + competitor-review email (agency CC) + billing step; (c) three (prefill / wizard / emails+billing). *Rec: (b)* — 11a is useful alone; 11b needs email changes.
2. **Who runs it?** (a) agency staff only; (b) staff start it, client owner finishes a short "confirm your business + review competitors" part via the invite; (c) both full. *Rec: (b)* — matches "competitor review emails"; client stays invitation-only (f3).
3. **Relation to Phase 10.** (a) separate route `/agency/clients/new` becomes the wizard, Phase 10's `first_client` checklist item links to it; (b) extend `/onboarding` with client steps; (c) both. *Rec: (a)* — keeps `/onboarding` agency-only, no collision.
4. **Steps.** Proposed: find business on Google → confirm prefilled profile (services/keywords/area) → discovery running (wait/leave, come back) → pick competitors → invite client owner (+ competitor review email) → billing (optional). Prospects skip invite/billing? *Rec:* that order; every step after the profile skippable; progress stored per client (new `client_onboarding` table).
5. **"Multi-day" meaning.** (a) resumable wizard + reminder emails to the AM while data lands; (b) also client-facing nudges; (c) no reminders, just a status card. *Rec: (a)*, reuse Phase 10 nudge pattern.
6. **Agency CC.** (a) real `Cc:` (add `cc` to `OutgoingEmail`/Postmark); (b) separate copy to the AM; (c) reply-to AM only. *Rec: (a)* for the competitor-review email only.
7. **When things fire.** Discovery: unchanged (auto on profile completion). Starting point: (a) unchanged 48 h clock; (b) start the clock when competitors are confirmed. Billing: (a) optional last step calling `enable_client_billing` (needs client owner first; trial agencies can't bill, 9b f8); (b) leave on the billing settings page. *Rec:* starting point (b), billing (a) with per-client price (folds 9b M5).
8. **Prefill cost/source.** (a) DataForSEO Maps search by name + city (cheap, one call) then GBP info; (b) Google Places autocomplete (new vendor, key). *Rec: (a)* — no new vendor; cost to the client's ledger.
