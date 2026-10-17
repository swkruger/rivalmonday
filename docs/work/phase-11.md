# phase-11 — Client onboarding wizard (GBP/DataForSEO prefill, competitor review emails, billing)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-11   **Base:** main @ 63259a8
**Plan/spec:** `docs/superpowers/{specs,plans}/` — 11a (`2026-10-15-…-11a-…-design`, `2026-10-16-…-11a-…`), 11b, 11c (all `2026-10-16-phase-11{b,c}-*`).

## Status (overwrite)
2026-10-17: 11a done (Tasks 0–14). 11b built (Tasks 15–24), final 11b review pending; 11c next (own pre-flight). Plans approved: 11a (D1–D11), 11b (E1–E7), 11c (L1–L8, 25–35).

## Next (overwrite)
Final 11b whole-branch review (`pnpm test:affected --base main`, `e2e:affected --base main`), one fix wave → 11c Tasks 25–35. Test DB `cs_phase_11_test`.

## Interfaces this branch adds or changes
Migrations used: 0067 client_setup, 0068 client_setup_rls, 0069 last_changed_by → text, 0070 client_setup_invite, 0071 invited_by → text. **11c next free: 0072.**
- **11a (BUILT):** `client_setup`; tools `find_business`, `get_client_setup`, `save_setup_profile`, `pick_setup_competitors`, `advance_client_setup`; `create_client` `lookup`; jobs `setup-suggestions`, `setup-reminders`; `/c/[clientId]/setup`; link target `setup`; E2E flag `SETUP_FAKE_LOOKUP`.
- **11b (BUILT):** `OutgoingEmail.cc`, `notify` `contactIds`/`cc`, dispatcher lets `client_invite`/`competitor_review` reach inactive contacts; `inviteClientUser` (also `invite_member` for client roles); tools `invite_client_owner`, `send_competitor_review`; `clientOwnerEmails` includes pending invites; 5-step setup (prospects 4); sign-in `?email=` prefill.
- **11c (planned):** tables `intake_link`, `lead`, `intake_rate`; public fns `resolveIntake`/`intakeLookup`/`submitIntake`/`verifyIntake`/`getPublicPreview`; tools `list_leads`, `get_lead`, `accept_lead`, `decline_lead`, `get/update_intake_link`, `list_pool_leads`, `assign_lead`; `createClientCore`; AI task `lead_preview_summary`; jobs `lead-preview`, `leads-cleanup`; routes `/start`, `/start/[slug]`, `/start/v/[leadId]`, `/start/verify/[token]`, `/agency/leads`, `/platform/leads`.

## Rulings (11a)
R1 `applyClientProfileChange` returns SearchStart|null. R2 suggestions read GBP via `fetchGbpProfile`. R3 reminders extend `agency_notice`, branded via `loadBranding(agency)`. R4 starting-point `since` stays activated_at ?? created_at. R5 DEMO uses the lookup fixture. R6 DATAFORSEO_LOGIN/PASSWORD on Vercel web. T2 `completeIfDone` never completes a dismissed row. T6 suggestions `pending` > 15 min read as `failed`. T7 migration 0069. T10 `find_business` vendor failure = ToolError. I2 D8 wins over spec §9: completed setups keep the competitors-done clock. I1 by-hand creates land in `/setup`. M3 competitors todo with nothing pending → `waitingOn 'agency'`.

## Rulings (11b)
- Client roles see setup closed once profile/search/competitors are done/skipped; staff keep 5 steps (4 prospects).
- `invite_client_owner` without delivery creates invitation + contact, skips the email (warning logged).
- `invite_client_owner`/`send_competitor_review` stay off the paused-agency allow-list.
- Automatic review email rides the daily 14:00 UTC `setup-reminders` job (≤ ~24 h delay); only when competitors is `todo`, not `skipped`; manual send ignores the step.
- Migration 0071 (invited_by uuid → text) instead of editing 0070.
- `inviteClientUser` (owner) and `enable_client_billing` call `completeIfDone`; invite startUrl and review-email `next` follow `clientOpen`; `convert_prospect` reopens only rows with competitors_done_at; invitee name/email null for client roles; `skip_billing` on a prospect = invalid_input.
- Billing step is skipped by derivation unless the agency's Connect account is charging; a per-client price needs the agency's Stripe product (saving defaults creates it).

## Assumes from other branches
- **phase-10 (in main @ 63259a8):** `create_client` stamps `first_client_at`; checklist `first_client` → `/agency/clients/new`; `OutgoingEmail.stream/headers`; `(app)` layout redirects only suspended agencies.

## Decisions (owner-approved)
Full lists in the specs (11a D1–D11, 11b E1–E7, 11c L1–L8). Headlines: split 11a lookup+wizard / 11b invite+review+billing (closes 9b M5) / 11c intake+preview+pool; staff and owner both run the wizard; starting-point clock starts at competitors-done (14-day cap); clients self-start only via agency intake link or platform pool (amends Phase 10 f3); prospects get the invite step (L7); billing may be enabled while the owner's invite is pending.

## New backlog (target → item)
- Polish → sign-in page uses host default branding (may show Rival Monday to white-label owners): check in verification (e).
- Polish → 11b deferred minors: `cleanCc` regex accepts `a@b..c` (Postmark 300 would lose the `to` send); wizard polish (billing-note order, no "billing on" success copy, `billingPrefill` live read on every poll); setup stuck "5 of 5" when derivation completes it (worker sweep); `clientBillingEligibility` import cycle; `invite_member` (client roles) allowed for paused agencies (queued invite sends after unpause).
- Soon → wizard billing step with no agency defaults fails with "Set a default price first…" (no Stripe product yet): prefill/explain or create the product.
- Soon → `start_search` retry bound is only the 10-min cooldown (≤ $3 each) — 11a M1; setup reminder dedupe has no cycle component.
- Watch → `@cs/billing access.test.ts` reduced-trial test failed once order-dependently.
- Phase 10 merge → root `CLAUDE.md` § Decisions: note client self-start via intake links/pool next to Phase 10's f3.

## Owner verification steps
11a (on `cs_dev`): 1 add a business via lookup; 2 suggestions within a minute, quotes match GBP; 3 search after "Save and find competitors" (≤ $3); 4 pick, Done → starting point due in 48 h; 5 invite an owner via `/agency/team`, they finish a second client's setup; 6 next day 14:00 UTC reminder for an idle setup; 7–8 set `DATAFORSEO_LOGIN/_PASSWORD` on Vercel; confirm GBP `description` on a live lookup; 9 copy sign-off (below).
11b: (a) real Postmark test send shows the Cc in the client's mail client; (b) invite → accept: contact active, first brief only after acceptance; (c) billing step with a pending owner on Stripe test mode; (d) copy sign-off for both templates (below); (e) sign-in page branding for an invited white-label owner.
11c Task 35 adds intake/preview checks.
- **Copy sign-off (11a):** setup notice lines in `jobs/setup.ts` `linesFor` (ready: "We found competitors that look like a fit for {client}." / "Pick the ones to track so their first brief can start."; changed: "{client}'s owner made changes to their setup." / "Take a look and finish what is left."; idle: "{client}'s setup has been waiting on you for 3 (or 7) days." / "A few quick choices are left before their first brief can start."); `find_business` outage, `setup/refusal-copy.ts`, place-id help line.
- **Copy sign-off (11b):** email footers "Invitation from {agency}" / "Sent by {agency}" (Task 18); web strings "Invite sent.", "Nothing new to send right now.", "Owner's name", "Owner's email", price/fee errors, "An agency admin turns on billing." (Task 23).
