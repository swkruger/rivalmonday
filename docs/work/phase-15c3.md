# phase-15c3 — agency management on `/platform/agencies/<id>`

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c3   **Base:** main @ e31e1255
**Plan/spec:** [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §5 (binding) · [15c-3a spec](../superpowers/specs/2026-10-25-phase-15c3a-agency-management-design.md) (owner-approved 2026-10-25) · [15c-3a plan](../superpowers/plans/2026-10-25-phase-15c3a-agency-management.md) (owner-approved 2026-10-25) · mockups `docs/design-system/mockups/agency-management/` (approved).

## Status (overwrite)
2026-10-25: 15c-3a built (Tasks 0-12) and through the final whole-branch review + one fix wave (re-review PASS). Affected tests: E2E 140/140; unit all green except the known date/DST env failures (due-pages ×3, spend-guard). Ready for owner verification and `/rm-merge`. 15c-3b not started.

## Next (overwrite)
Owner runs the verification steps below and signs `docs/archive/phase-15c3a-copy-signoff.md` -> `/rm-merge` (renumber migration if 7c2 merged first). Then phase-7b2 (uses the answers below); 15c-3b (plans) gets its own spec/plan.

## Interfaces this branch adds or changes
- Migration **0093** `agency_hold`: `agency.suspended_at/_reason/_by` (+ consistency/length CHECKs). `plan.visibility` is 15c-3b.
- 12 platform tools (`tools/platform-agency.ts`): `platform_rename_agency`, `list_agency_people`, `platform_change_member_role`, `platform_remove_member`, `platform_resend_invitation`, `platform_revoke_invitation`, `platform_invite_agency_admin`, `platform_suspend_agency`, `platform_unsuspend_agency`, `platform_retry_hold_billing`, `platform_archive_agency`, `platform_unarchive_agency`. Rows in the 8b tool-access doc; fixtures (two skipPositive, R9).
- `BillingGateway.pauseCollection/resumeCollection(subscriptionId, { stripeAccount? })` (types, fake, Stripe).
- `@cs/billing`: `onHold` on `billingAccess`, `isOnHold`, `holdMessage(role, email?)`, `HOLD_MESSAGE`; `applyHoldCollection`, `holdBillingIssue`, `pauseIfHeld` (`hold.ts`). `@cs/core`: `DEFAULT_SUPPORT_EMAIL`. `agencyServiceable` excludes held agencies.
- `@cs/tools`: `platform/archive.ts` (`archiveTenant`, `liveBilling`; worker CLI imports it, R7), `platform/hold-email.ts`, `Inviter`, `changeMemberRole`, `RESEND_TOOLS`.
- `list_platform_agencies`: `status` filter (incl. on hold / archived), counts, `onHold`. `get_platform_agency`: `hold`, `archivedAt`, `holdBillingIssue`, nullable tiles when archived, `archiveBlockers { agencyPlan, clientSubscriptions }` (R1).

## 7b2 Task 0 answers
(a) `runBillingDaily` skips `runConnectDaily` for held agencies. (b) `resumeClient` and `assertCanActivateClient` throw `service_paused` on hold. (c) Allow-list unchanged (`disable_client_billing`, `redeem_discount_code` still present). (d) Billing files touched: `connect-webhook.ts` (tolerate `service_paused` at the R14 lift + `PostCommit.pauseHeldFor`), `webhook.ts` (post-commit pause step), `types.ts`/`fake-gateway.ts`/`stripe-gateway.ts` (pause/resume), `daily.ts`, `seats.ts`, `access.ts`, new `hold.ts`/`index.ts` export. Not touched: `connect-daily.ts`, `client-billing-state.ts`, `client-pause.ts` logic (test only).

## Assumes from other branches
- **phase-7c2** (executing) ships **0093** `ops_alert`; this branch ships **0093** `agency_hold`; whichever merges second renumbers + regenerates journal/snapshot. Both edit `isolation/fixtures.ts` and `packages/tools/src/index.ts`. Its readiness uses `agencyServiceable`, so held agencies drop out once we extend it.
- **phase-7b2** (starts after we merge) expects `suspended_at`, `onHold`, `service_paused`, unchanged allow-list, gateway pause methods in `types.ts`/`fake-gateway.ts`/`stripe-gateway.ts` (it never edits those); needs Q4's answer.
- **phase-16** (docs only, code waits for us): restyles our page later; no overlap now.

## Decisions (owner-approved)
15c-3a spec A1–A9 (2026-10-25): split 3a/3b; archive refuses live billing; Archived filter + owner unarchive; hold freezes all billing work; operator invites count toward agency limits, email names the agency; On hold chip + filter; hold start/lift emails admins (generic); branding URLs → 13a; hold time counts, no deadline shift. 15c C1, C5, C6, C10, C11 bind. Q5 (`create_plan` features) deferred to 3b.

## New backlog (target -> item)
- **15c-3b** -> plans (15c spec §5.5, incl. `create_plan` features, Q5).
- **phase-16** -> extend `@cs/ui` `ConfirmDialog` (controlled open, inline error, children) and fold the page-local `ActionDialog` into it (R11).
- **15c-3 polish** -> deferred minors not fixed by the final review: billingAccess/syncSeats extra `isOnHold` query; consistency CHECK one-direction test; hold copy in `assertCanActivateClient` always default support email; duplicated hold-setting test update (helper); live-billing predicates duplicated (`liveBillingQuery`/`liveBilling`); `CLI_USER` duplicated; stale `resend_invitation` doc comments in `team.ts`; `inviteMember` unused `_o.inviter`; `assertTeamInviteBudget` runs twice; `list_platform_agencies` description lacks status/counts; unarchive of a non-archived agency is a silent ok; no resume-failure-still-lifts test; success toasts lost on unmount; `tiles as Tiles` cast; action slices 200/600 vs limits 120/500; list not revalidated after rename/hold/archive; "All" view archived rows lack chip; isolation world has no held agency (R9 skipPositive); E2E archive step could wait for Unarchive before navigating (one fresh-build flake).

## Owner verification steps
Apply migration 0093 to `cs_dev` first.
1. Put a test agency on hold: its admin gets the email, the agency UI is read-only with the banner, Stripe test subscriptions show "collection paused".
2. Lift it: the email arrives and collection resumes.
3. Try archiving an agency with a live test subscription: refused.
4. Cancel it, archive, find it under Archived, then unarchive.
5. Invite an agency admin: the email names the agency, not you.
6. Change roles and hit the last-admin refusal.
7. Sign `docs/archive/phase-15c3a-copy-signoff.md` (3 owner questions inside).

## Migration overlap
phase-7c2 also claims 0093; whichever merges second renumbers (journal + snapshot).

## Brief
### 1. Scope (roadmap row 15: "15c-3 agency management *to be planned*")
15c spec §5; core §3 roles, §8.1 registry, §10.6 billing. Platform tools (`permission:'agency'`, `audit:'skip-web'`, `operate()`, one `withPlatformAudit` row); viewer reads, staff rename/people/hold, owner archive + plans; every write behind `ConfirmDialog`.
- **§5.1 Rename** `agency.name`, 1–120 chars.
- **§5.2 People** list (`listTeam` with a service ctx for the target agency), change role (agency roles), remove, resend/revoke invite, invite agency admin; last-admin rule.
- **§5.3 Hold (C6)** read-only via `onHold` → guard `service_paused` + hold copy; schedulers/`syncSeats`/`daily.ts` skip; Stripe `pause_collection` on platform + client subs (DB first; failure → `admin_hold_pause_failed` + retry action); "On hold" chip.
- **§5.4 Archive** `requireText` = name; reuse 7a2 archive (CLI only today).
- **§5.5 Plans (C11)** `visibility`; `create_plan`; `create_plan_version` + `code`; `list_plans` by code; `platform_change_agency_plan` (swap, prorations, refused on hold); `recordCheckoutFacts` matches all plans; check `apply.ts`/`trial.ts` honour assigned plans. Split allowed.
- **§5.6 Page** Manage ▾, People card replaces Team counts, billing confirms; drop "coming soon" (+ `e2e/platform.spec.ts:74`). Tests §7; help guide; copy sign-off (C10).

### 2. Already built — reuse
- `packages/tools/src/tools/platform-billing.ts` (`operate`, `requireAgency` hides archived, plan tools + advisory lock); `platform-console.ts` `get_platform_agency`; `platform/audit.ts`.
- `packages/tools/src/billing-guard.ts`: `PLATFORM_TOOLS` built from module arrays (add new module), `PAUSED_WRITE_ALLOW_LIST`, `pausedMessage`, `assertAgencyServiceable`.
- `packages/billing/src/`: `access.ts` (`billingAccess`, `planFor`, `currentStandardPlan`, `assertCanActivateClient`), `daily.ts` (`syncSeats`, `runConnectDaily`), `apply.ts`, `trial.ts`, `webhook.ts`, `plan-sync.ts`, `client-pause.ts`, `types.ts`, `fake-gateway.ts`, `stripe-gateway.ts`. Tables `plan` (has 7a2 `features`), `agency_billing(_event)`, `client_billing`.
- `packages/db/src/filters.ts` `agencyServiceable` (29 call sites).
- `packages/tools/src/access/team.ts`: `listTeam`, `inviteMember`, `revokeMembership` (last-admin), `revokeInvitation`, `resendInvitation` (limit counts `resend_invitation` audit rows; needs ctx of the target agency); no change-role fn.
- `apps/worker/src/purge.ts` `archiveTenant` (refuses live billing; audit `userId:'cli'`), CLI `cli/archive.ts`.
- Web `app/(platform)/platform/agencies/[id]/*` (help key `page:platform.agencies.detail`), `components/shell/billing-banner.tsx`, `components/read-only.tsx`, `ConfirmDialog` `requireText`, `StatusChip`, `runTool`.
- Gates: `ISOLATION_FIXTURES`, `TABLE_CLASS` (no new table expected), help coverage, `lib/page-gates.ts`.

### 3. Binding decisions
Root CLAUDE.md: separate plans, hold = read-only + collection paused; refusals 404; writes via `runTool`; archived = deleted for tenants, purge ≥ 30 d; nothing client-facing names Rival Monday; PageHeader + help; viewer tz; status via `lib/labels.ts`; new tool ⇒ fixture; never edit migrations. 15c C5 (no "step into"), C6 (no Stripe event lifts a hold; allow-list unchanged), C10, C11, §8. Phase 9 R4/R17/R28.

### 4. Backlog to fold in (verbatim)
- "**15c-3** agency management (15c spec; separate plans, hold = read-only + collection paused); its archive button needs archive exposed as a tool (7a2 built only the worker CLI `archiveTenant`)" — *phase-15c*
- "13a/15c-3: agency privacy URL and agency site URL in branding (agency `/start/v` CTA link, intake privacy link); Team invite From address is the lead-mail from-address (rivalmonday envelope for white-label) → 13a neutral domain" — *phase-15c2a* (Q9)
- If touched: "platform overview sums keep archived agencies' daily-stat rows" (*7a*); "archived-agency clients still count as O11 trackers" (*7b1*); "agencies list silently capped at 100" (*8a*).

### 5. Open questions for the owner
1. **Split?** a) one plan; b) **15c-3a rename/people/hold/archive, then 15c-3b plans** (rec.: spec allows; 7b2 waits only on the hold); c) three parts.
2. **Archive.** a) **move `archiveTenant` into a package shared by CLI + tool; keep the live-billing refusal ("cancel in Stripe first")** (rec.); b) tool cancels subscriptions then archives; c) archive only while on hold.
3. **Unarchive surface** (archived agencies vanish). a) **"Archived" filter on `/platform/agencies` + Unarchive (owner)** (rec.); b) CLI only; c) tool, no UI.
4. **Hold in billing jobs** (7b2 needs it). a) **`runBillingDaily` skips held agencies entirely incl. `runConnectDaily`; `assertCanActivateClient`/`resumeClient` refuse `service_paused`** (rec.); b) skip timers/`syncSeats` only.
5. **`create_plan` features.** a) **input takes `features` (ask/mcp)** (rec.); b) default both; change via new version.
6. **Operator invites/resends.** a) **count toward agency limits; email names the agency, not the operator** (rec.); b) exempt; c) own limit.
7. **Held agencies on lists.** a) **"On hold" chip + filter on `/platform/agencies`** (rec.); b) detail only.
8. **Email admins on hold/lift?** a) **no, banner only** (rec., spec); b) yes.
9. **Branding URLs item.** a) **leave for 13a** (rec.); b) fold in.

## Pre-flight (Task 0, 2026-10-25)
- Rebase on main: nothing to do (HEAD 023e6f01 current). TEST_* URLs all point at `cs_phase_15c3_test`.
- Unmerged: `phase-7c2` (executing, claims migration 0093 `ops_alert`) and `phase-16` (docs-only). main ends at 0092; this branch ships 0093 `agency_hold`; whichever merges second renumbers + regenerates journal/snapshot.
- `agencyServiceable(` non-test call count: 37 (plan expected ~29).
- `resumeClient`/`assertCanActivateClient`: all pass `role` where a ctx exists (tools client-pause/onboarding/prospects). Exception: `packages/billing/src/connect-webhook.ts:156` calls `resumeClient(sp, clientId, ACTOR)` with no role (system actor, intended).
- `archiveTenant`: only `apps/worker/src/purge.ts`, `apps/worker/src/cli/archive.ts`, `purge.test.ts` (as expected).
- Webhooks: `apps/web/src/app/api/stripe/webhook/route.ts` -> `handleStripeEvent` (`packages/billing/src/webhook.ts:162`); `.../connect-webhook/route.ts` -> `handleConnectEvent` (`packages/billing/src/connect-webhook.ts:172`). Platform handler has NO post-commit gateway step (single `db.transaction`, returns at ~l.168). Connect handler has a `PostCommit` object (`post.syncSeatsFor`, `post.expireSession`) run after commit at l.194-205: add `post.pauseHeldFor` there for the `checkout.session.completed` case (dispatch l.105-119, where `account` is the stripeAccount). Platform: add post-commit block in `handleStripeEvent` after the transaction (needs a PostCommit mirror; `recordCheckoutFacts` webhook.ts:53 is where the subscription id is recorded). `pauseIfHeld` does not exist yet.
- 8b tool-access doc: `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`. `access-marks.test.ts`: `packages/tools/src/tools/access-marks.test.ts`. `ISOLATION_FIXTURES`: `packages/tools/src/isolation/fixtures.ts:61` (test `isolation.test.ts`).
- Help guides: `docs/help/pages/platform.agencies.detail.operator.md` (detail), `docs/help/pages/platform.agencies.operator.md` (list). Pages: `apps/web/src/app/(platform)/platform/agencies/page.tsx` and `[id]/page.tsx`.
