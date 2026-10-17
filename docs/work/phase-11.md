# phase-11 — Client onboarding wizard (GBP/DataForSEO prefill, competitor review emails, billing)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-11   **Base:** main @ 63259a8
**Plan/spec:** `docs/superpowers/{specs,plans}/` — 11a (`2026-10-15-…-11a-…-design`, `2026-10-16-…-11a-…`), 11b, 11c (all `2026-10-16-phase-11{b,c}-*`).

## Status (overwrite)
2026-10-16: 11a built (Tasks 0–13, each reviewed); final 11a review pending; 11b next. Specs/plans approved: 11a (D1–D11), 11b (E1–E7, 15–24), 11c (L1–L8, 25–35).

## Next (overwrite)
11a final whole-branch review (`--base main`) + one fix wave (fold deferred minors, e.g. whitespace-only quote in suggestions.ts) → 11b Task 15 pre-flight → 11b 15–24 → 11c 25–35 (own pre-flight each). Test DB `cs_phase_11_test`.

## Interfaces this branch adds or changes
(11a built; 11b/11c planned. Migrations used by 11a: 0067 client_setup, 0068 client_setup_rls, 0069 last_changed_by → text; 11b/11c take next free, ≥ 0070)
- **11a (BUILT):** table `client_setup`; tools `find_business`, `get_client_setup`, `save_setup_profile`, `pick_setup_competitors`, `advance_client_setup`; `create_client` + optional `lookup`; `applyClientProfileChange`, `getSetupState`, engine `startingPointClockStart`; collector `mapsSearchByText`, `collectGbpProfile` real scope + description; AI task `setup_suggestions`; jobs `setup-suggestions`, `setup-reminders`; routes `/c/[clientId]/setup`, rebuilt `/agency/clients/new`; E2E flag `SETUP_FAKE_LOOKUP`.
- **11b:** `OutgoingEmail.cc`, `notify` `contactIds`/`cc`, dispatcher lets `client_invite`/`competitor_review` reach inactive contacts; `inviteClientUser` (also used by `invite_member` for client roles), tools `invite_client_owner`, `send_competitor_review`; `clientOwnerEmails` includes pending invites; `LINK_TARGETS += 'setup'`; sign-in `?email=` prefill.
- **11c:** tables `intake_link`, `lead`, `intake_rate`; public fns `resolveIntake`/`intakeLookup`/`submitIntake`/`verifyIntake`/`getPublicPreview`; tools `list_leads`, `get_lead`, `accept_lead`, `decline_lead`, `get/update_intake_link`, `list_pool_leads`, `assign_lead`; `createClientCore`; AI task `lead_preview_summary`; jobs `lead-preview`, `leads-cleanup`; routes `/start`, `/start/[slug]`, `/start/v/[leadId]`, `/start/verify/[token]`, `/agency/leads`, `/platform/leads`.


## Rulings made during execution (11a)
- R1 `applyClientProfileChange` returns SearchStart|null; `save_setup_profile` surfaces refusal; `advance_client_setup` gains `start_search` (auto-trigger rules, not weekly limit).
- R2 suggestions read GBP via `fetchGbpProfile` (no capture): prefill, not claims.
- R3 setup reminders extend the `agency_notice` union (no new template); Task 9: branded via `loadBranding(agency)`, not platform branding.
- R4 `starting-point.ts` evidence `since` stays activated_at ?? created_at; setup clock drives only readiness/due.
- R5 DEMO uses the lookup fixture, never a paid call. R6 DATAFORSEO_LOGIN/PASSWORD on Vercel web (existing vars).
- T2 `completeIfDone` never completes a dismissed row. T6 `get_client_setup` reports suggestions `pending` > 15 min as `failed`; wizard falls back to pack seed keywords.
- T7 migration 0069 (last_changed_by text) rather than editing 0067; `get_client_setup` gains client-safe `search` field.
- T10 `find_business` vendor failure = user-facing ToolError (copy below). T13 client owner closing setup navigates to `/c/<id>` (closed setup is 404 for client roles).
- Deferred minors: final fix wave/backlog (ledger in `.superpowers/sdd/…11a…/progress.md`).

## Assumes from other branches
- **phase-10 (merged into main @ 63259a8):** migrations 0065/0066 (next free **0067**); `create_client` stamps `first_client_at` in its service tx, reduced-trial refusal is in `assertCanActivateClient`; checklist `first_client` → `/agency/clients/new`; `OutgoingEmail.stream/headers`; job factories in `main.ts`; `(app)` layout redirects only suspended agencies + a never-redirected admin once.

## Decisions (owner-approved)
Full lists in the specs: 11a D1–D11, 11b E1–E7, 11c L1–L8 (+ plan-local P1–P6, Q1–Q5, R1–R4). Headlines:
1. Split 11a (lookup, AI prefill, resumable wizard) / 11b (owner invite, review email with real Cc, billing step with per-client price — closes 9b M5) / 11c (intake links, free preview, platform lead pool).
2. Staff and client owner both run the wizard; staff always do the lookup; client owner may edit profile/pick competitors while setup is open.
3. Starting-point clock starts when competitors are done (14-day cap).
4. Clients may self-start only via an agency intake link or the platform pool (amends Phase 10 f3 for clients); `/start` shows Rival Monday until an agency is assigned (explicit exception to the white-label rule).
5. Prospects get the invite step (L7, amends 11a D4 / 11b E4); billing stays clients-only.
6. Billing can be enabled while the owner's invite is pending.


## New backlog (target → item)
- Unscheduled → automatic lead routing to agencies (vertical/area/capacity/opt-in) on the 11c pool.
- Polish → sign-in page uses host default branding (may show Rival Monday to white-label client owners) — verify in 11b Task 24.
- Phase 10 merge → root `CLAUDE.md` § Decisions: note client self-start via intake links/pool (11c L1/L4) next to Phase 10's f3 change.


## Owner verification steps
11b Task 24 and 11c Task 35 add theirs (Postmark Cc, pending-owner billing in Stripe test mode, intake + preview on `cs_dev`, copy sign-offs). 11a, on `cs_dev`:
1. Add a real HVAC/dental business via lookup → client created with place id.
2. Suggestions arrive within a minute; quotes match the GBP.
3. Search runs after "Save and find competitors" (cost ≤ $3).
4. Pick, Done → starting point due 48 h later.
5. Invite a client owner via `/agency/team`; they finish a second client's setup.
6. Next day 14:00 UTC: reminder email for an idle setup.
7. Copy sign-off: setup notice lines (below).
8. Set `DATAFORSEO_LOGIN`/`_PASSWORD` on the Vercel web project (R6).
9. Confirm GBP `description` is populated on a live lookup (only a synthetic fixture covers it).
10. Copy sign-off also for: find_business outage message "Business search isn't available right now. Try again, or enter the details by hand.", the wizard's refusal-code copy (Task 11), the place-id help line.
- **Copy sign-off: setup notice lines** (drafted in `apps/worker/src/jobs/setup.ts` `linesFor`; subjects binding). Ready: "We found competitors that look like a fit for {client}." / "Pick the ones to track so their first brief can start." Changed: "{client}'s owner made changes to their setup." / "Take a look and finish what is left." Idle: "{client}'s setup has been waiting on you for 3 (or 7) days." / "A few quick choices are left before their first brief can start."

## Brief

### 1. Scope
Roadmap row 11 (GBP + DataForSEO prefill, competitor review emails, agency CC'd, billing). Core spec §4.1, §3, §5.2 item 11, §9.4, §12. Split into 11a/11b/11c (see specs).

### 3. Binding decisions (do not re-open)
- Public data only; vendor APIs only for discovery (12a D1); $3/run cap, 5 runs/agency/day, auto-run once on profile completion, then 1 manual search/client/week + monthly refresh (12a D4/D7, root CLAUDE.md). AM confirms competitors; top rivals pre-ticked (D5). 
- One starting-point brief per client, ready-or-48 h, normal AM approval (D10/D11).
- 9b f4/f7/f8/f13: billing turned on by agency admin, email to client owner, Connect Standard direct charges, **nothing client-facing names Rival Monday**; paused clients get no recurring work.
- Phase 10 f3: agency staff and client users stay **invitation-only**; self-serve SMB never. f6: "Add your first client" is a checklist item, not a Phase 10 step. f12: open trial = 1 active client, weekly.

### 4. Backlog to fold in
9b M5 (per-client price at enable) → folded into 11b. CS Dev Verification Agency/Client clean-up → before real onboarding (owner).
