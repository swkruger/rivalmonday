# phase-11 — Client onboarding wizard (GBP/DataForSEO prefill, competitor review emails, billing, intake leads)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-11   **Base:** main @ 63259a8
**Plan/spec:** `docs/superpowers/{specs,plans}/` — 11a (`2026-10-15-…-11a-…-design`, `2026-10-16-…-11a-…`), 11b, 11c (all `2026-10-16-phase-11{b,c}-*`).

## Status (overwrite)
2026-10-17: 11a done (0–14), 11b done (15–24), 11c built (Tasks 25–35), final 11c review pending.

## Next (overwrite)
Final whole-branch 11c review (most capable model; `pnpm test:affected --base main` + `e2e:affected --base main`), one fix wave (incl. `assign_lead` clearing decided_by/at), owner approval, `/rm-merge`. Test DB `cs_phase_11_test`.

## Interfaces this branch adds or changes
Migrations: 0067 client_setup, 0068 client_setup_rls, 0069 last_changed_by → text, 0070 client_setup_invite, 0071 invited_by → text, **0072 leads, 0073 leads_rls**. Next free: 0074.
- **11a:** `client_setup`; tools `find_business`, `get_client_setup`, `save_setup_profile`, `pick_setup_competitors`, `advance_client_setup`; `create_client` `lookup`; jobs `setup-suggestions`, `setup-reminders`; `/c/[clientId]/setup`; E2E flag `SETUP_FAKE_LOOKUP`.
- **11b:** `OutgoingEmail.cc`, `notify` `contactIds`/`cc`, dispatcher lets `client_invite`/`competitor_review` reach inactive contacts; `inviteClientUser`; tools `invite_client_owner`, `send_competitor_review`; `clientOwnerEmails` counts pending invites; 5-step setup (prospects 4); sign-in `?email=`.
- **11c (BUILT):** tables `intake_link`, `lead`, `intake_rate`; public fns `resolveIntake`/`intakeLookup`/`submitIntake`/`verifyIntake`/`getPublicPreview`; tools `list_leads`, `get_lead`, `accept_lead`, `decline_lead`, `get/update_intake_link`, `list_pool_leads`, `assign_lead`; `createClientCore`; AI task `lead_preview_summary`; jobs `lead-preview`, `leads-cleanup`; `ToolDeps.leadEmail`; routes `/start`, `/start/[slug]`, `/start/v/[leadId]`, `/start/verify/[token]`, `/agency/leads`, `/agency/settings/intake`, `/platform/leads`; E2E tag `@leads` (`intake.spec.ts`); demo `leads.ts` (`/start/demo-agency`, 3 leads + 1 pool lead).

## Rulings
- **11a:** `applyClientProfileChange` returns SearchStart|null; suggestions read GBP via `fetchGbpProfile`; reminders extend `agency_notice`; DEMO uses the lookup fixture; DATAFORSEO_LOGIN/PASSWORD on Vercel web; suggestions `pending` > 15 min read as `failed` (T6); R4 starting-point `since` stays activated_at ?? created_at; T2 `completeIfDone` never completes a dismissed row; I1 by-hand creates land in `/setup`; `find_business` vendor failure = ToolError; completed setups keep the competitors-done clock; competitors todo with nothing pending → `waitingOn 'agency'`.
- **11b:** `inviteClientUser` and `enable_client_billing` call `completeIfDone`; invite startUrl and review-email `next` follow `clientOpen`; invitee name/email masked (null) for client roles; `skip_billing` on a prospect = invalid_input; a per-client price creates the agency's Stripe product on first use; client roles see setup closed once profile/search/competitors done/skipped; `invite_client_owner` without delivery skips the email; both new tools off the paused-agency allow-list; automatic review email rides the daily 14:00 UTC `setup-reminders` (competitors `todo` only); `convert_prospect` reopens only rows with competitors_done_at; billing step skipped unless Connect is charging; re-inviting a different owner revokes the old invite; Checkout email prefers an accepted owner.
- **11c:** intake lookups/previews ledger with agency_id NULL (platform cost, bounded by `intake_rate`); resubmit of a verified lead keeps verified values, issues a new view token; leads-cleanup retries guarded sends (< 7 d) and marks previews pending/`none` > 15 min `failed`; preview job skips demo/test and non-serviceable agencies, reruns on `failed`; declined platform lead returns to the pool (re-sends pool notice, no visitor email; open pool twin → close the assigned row); accept's browser lookup JSON is validated by `setupLookupSchema`, unsigned; scoped account managers pass RLS but tools refuse; intake card at `/agency/settings/intake`; `getPublicPreview` returns resolved branding only; `resolveIntake` 404s non-serviceable agencies, slug `verify` reserved; verify links idempotent until expiry (scanner pre-open ok), each use issues a fresh view token; lookup and submit have separate 5/h per-IP budgets, lookup has no Turnstile; `?from=<slug>` on verify links; agency pages say "From the platform"; accept lands on `/c/<id>/setup`, lead becomes a `prospect`.

## Assumes from other branches
- **11c pre-flight:** `verifyTurnstile`, `hashIp(ip, authSecret)`, `PUBLIC` = RegExp array; platform roles owner|staff|viewer (assign = staff); web enqueue throws in demo/test (verify enqueue non-fatal).
- **phase-10 (in main @ 63259a8):** `create_client` stamps `first_client_at`; checklist `first_client` → `/agency/clients/new`; `OutgoingEmail.stream/headers`; `(app)` layout redirects only suspended agencies.

## Decisions (owner-approved)
Lists in the specs (11a D1–D11, 11b E1–E7, 11c L1–L8). Headlines: 11a lookup+wizard / 11b invite+review+billing / 11c intake+preview+pool; staff and owner both run the wizard; starting-point clock starts at competitors-done (14-day cap); clients self-start only via agency intake link or platform pool (amends Phase 10 f3); `/start` shows Rival Monday until an agency is assigned (L4); prospects get the invite step (L7); billing may be enabled while the owner's invite is pending.

## New backlog (target → item)
- Unscheduled → automatic lead routing to agencies (vertical/area/capacity/opt-in) on the 11c pool.
- Phase 13 → sign-in page uses host default branding (breaks white-label once a second agency onboards clients): check in verification (e).
- Polish → 11c: partial index on `lead.verify_token_hash`; `validateSummary` checks digits only; each verify use rotates the view token (a second tab/late scanner invalidates an earlier tab's link); intake snippet button hard-codes #47A8E7 (agency primary?).
- Polish → 11b: no "billing on" success copy, `billingPrefill` live read per poll; setup stuck "5 of 5" (worker sweep); `clientBillingEligibility` import cycle; `invite_member` (client roles) allowed for paused agencies.
- Soon → `@cs/billing access.test.ts` reduced-trial test order-dependent; `start_search` retry bound is only the 10-min cooldown (≤ $3); setup idle reminder has no cycle component; concurrent double "Done picking" errors; starting-point card shows checks pending during setup hold.
- Phase 10 merge → root `CLAUDE.md` § Decisions: client self-start via intake links/pool next to Phase 10's f3.

## Owner verification steps
11a (`cs_dev`): 1 add a business via lookup; 2 suggestions within a minute, quotes match GBP; 3 search after "Save and find competitors" (≤ $3); 4 pick, Done → starting point due in 48 h; 5 invite an owner via `/agency/team`, they finish a second client's setup; 6 14:00 UTC reminder next day; 7–8 `DATAFORSEO_LOGIN/_PASSWORD` on Vercel, GBP `description` on a live lookup; 9 copy sign-off (`phase-11-copy.md`).
11b: (a) real Postmark send shows the Cc; (b) invite → accept: contact active, first brief only after acceptance; (c) billing step with a pending owner on Stripe test; (d) copy sign-off (`phase-11-copy.md`); (e) sign-in branding for an invited white-label owner.
11c: (a) real Turnstile on `cs_dev`; (b) real preview for a dental business, summary numbers match; (c) accept → prospect → owner invite; (d) platform `/start` branding; (e) set the agency's slug; (f) copy sign-off (`phase-11-copy.md`). Before real onboarding: clean up the CS Dev Verification Agency/Client.
- **Copy sign-off (all of Phase 11):** every string quoted in `docs/work/phase-11-copy.md`; approve or edit there.
