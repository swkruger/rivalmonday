# phase-11 — Client onboarding wizard (GBP/DataForSEO prefill, competitor review emails, billing)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-11   **Base:** main @ 63259a8
**Plan/spec:** `docs/superpowers/{specs,plans}/` — 11a (`2026-10-15-…-11a-…-design`, `2026-10-16-…-11a-…`), 11b, 11c (all `2026-10-16-phase-11{b,c}-*`).

## Status (overwrite)
2026-10-16: execution started (11a pre-flight done). Specs/plans approved: 11a (D1–D11, Tasks 0–14), 11b (E1–E7, 15–24), 11c (L1–L8, 25–35). Pre-flight patched the 11a plan for drift and rulings R1–R6 (see Assumes).

## Next (overwrite)
11a Task 1 (`client_setup` table, migrations 0067/0068) via `superpowers:subagent-driven-development`, then Tasks 2–14 → 11b 15–24 → 11c 25–35 (each sub-phase has its own pre-flight). One final whole-branch review at the end. Test DB `cs_phase_11_test` (pgboss schema created).


## Interfaces this branch adds or changes
(planned, not built; migrations = next free at execution, after phase-10)
- **11a:** table `client_setup`; tools `find_business`, `get_client_setup`, `save_setup_profile`, `pick_setup_competitors`, `advance_client_setup`; `create_client` + optional `lookup`; `applyClientProfileChange`, `getSetupState`, engine `startingPointClockStart`; collector `mapsSearchByText`, `collectGbpProfile` real scope + description; AI task `setup_suggestions`; jobs `setup-suggestions`, `setup-reminders`; routes `/c/[clientId]/setup`, rebuilt `/agency/clients/new`; E2E flag `SETUP_FAKE_LOOKUP`.
- **11b:** `OutgoingEmail.cc`, `notify` `contactIds`/`cc`, dispatcher lets `client_invite`/`competitor_review` reach inactive contacts; `inviteClientUser` (also used by `invite_member` for client roles), tools `invite_client_owner`, `send_competitor_review`; `clientOwnerEmails` includes pending invites; `LINK_TARGETS += 'setup'`; sign-in `?email=` prefill.
- **11c:** tables `intake_link`, `lead`, `intake_rate`; public fns `resolveIntake`/`intakeLookup`/`submitIntake`/`verifyIntake`/`getPublicPreview`; tools `list_leads`, `get_lead`, `accept_lead`, `decline_lead`, `get/update_intake_link`, `list_pool_leads`, `assign_lead`; `createClientCore`; AI task `lead_preview_summary`; jobs `lead-preview`, `leads-cleanup`; routes `/start`, `/start/[slug]`, `/start/v/[leadId]`, `/start/verify/[token]`, `/agency/leads`, `/platform/leads`.


## Assumes from other branches
- **phase-10 (merged into main @ 63259a8):** migrations 0065/0066 (next free **0067**); `create_client` stamps `first_client_at` in its service tx, reduced-trial refusal is in `assertCanActivateClient`; checklist `first_client` → `/agency/clients/new`; `OutgoingEmail.stream/headers`; job factories in `main.ts`; `(app)` layout redirects only suspended agencies + a never-redirected admin once.
- **Pre-flight drift 2026-10-16:** 11a plan patched for drift and rulings R1-R6 (detail in the plan and `.superpowers/sdd/.../progress.md`); `LINK_TARGETS += 'setup'` landed in 11a Task 9, setup notices reuse `agency_notice`.

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
Listed in the final task of each plan: 11a Task 14, 11b Task 24, 11c Task 35 (real lookup + suggestions, setup to starting point, Postmark Cc, pending-owner billing in Stripe test mode, intake + preview on `cs_dev`, copy sign-offs). Deploy: the web app (Vercel) needs `DATAFORSEO_LOGIN`/`_PASSWORD` for the business lookup (11a Task 4).
- **Copy sign-off: setup notice lines** (11a Task 9, drafted in `apps/worker/src/jobs/setup.ts` `linesFor`; subjects are binding). Ready: "We found competitors that look like a fit for {client}." / "Pick the ones to track so their first brief can start." Changed: "{client}'s owner made changes to their setup." / "Take a look and finish what is left." Idle: "{client}'s setup has been waiting on you for 3 (or 7) days." / "A few quick choices are left before their first brief can start."


## Brief

### 1. Scope
Roadmap row 11 (GBP + DataForSEO prefill, competitor review emails, agency CC'd, billing). Core spec §4.1, §3, §5.2 item 11, §9.4, §12. Split into 11a/11b/11c (see specs).

### 2. Already built — reuse, don't rebuild
`create_client`/`update_client_profile` (`tools/onboarding.ts`), `client-input.ts`, `client-profile-form.tsx`; `collectors/local/maps.ts`, `gbp/collect-gbp.ts`, `local/self.ts`; discovery `tools/rival-search.ts` + `tools/competitors.ts`, `discovery_run`; starting point `engine/briefs/readiness.ts`; `invite_member`, `/agency/team`; 9b `enable_client_billing`, `assertCanActivateClient`, `postCommitSeatSync`; `@cs/email`, `notification`/`billing_notice` outboxes (`OutgoingEmail` has no cc).

### 3. Binding decisions (do not re-open)
- Public data only; vendor APIs only for discovery (12a D1); $3/run cap, 5 runs/agency/day, auto-run once on profile completion, then 1 manual search/client/week + monthly refresh (12a D4/D7, root CLAUDE.md). AM confirms competitors; top rivals pre-ticked (D5). 
- One starting-point brief per client, ready-or-48 h, normal AM approval (D10/D11).
- 9b f4/f7/f8/f13: billing turned on by agency admin, email to client owner, Connect Standard direct charges, **nothing client-facing names Rival Monday**; paused clients get no recurring work.
- Phase 10 f3: agency staff and client users stay **invitation-only**; self-serve SMB never. f6: "Add your first client" is a checklist item, not a Phase 10 step. f12: open trial = 1 active client, weekly.
- Web reads via registered tools, writes via `runTool`; refusals → 404; prospects/schedulers filter `client.status='active'` + `clientServiceable`; no jobs in DEMO/TEST; new env vars need owner approval + `turbo.json`. New screens → `packages/demo/src/coverage.ts`.

### 4. Backlog to fold in
9b M5 (per-client price at enable) → folded into 11b. CS Dev Verification Agency/Client clean-up → before real onboarding (owner).

### 5. Open questions
All answered 2026-10-15 — see Decisions and the 11a spec §2. 11b/11c questions (CC mechanism, billing step, intake/lead pool) go to their own brainstorms.
