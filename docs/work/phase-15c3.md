# phase-15c3 — agency management on `/platform/agencies/<id>`

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c3   **Base:** main @ e31e1255
**Plan/spec:** [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §5 (binding) · [15c-3a spec](../superpowers/specs/2026-10-25-phase-15c3a-agency-management-design.md) (awaiting owner review) · mockups `docs/design-system/mockups/agency-management/` (approved); plan to be written.

## Status (overwrite)
2026-10-25: kickoff, open questions answered, mockups approved, 15c-3a spec drafted + builder-checked. Nothing built.

## Next (overwrite)
Owner reviews the 15c-3a spec → writing-plans (lean) → approval → SDD. 15c-3b (plans, §5.5) gets its own spec/plan after 3a merges.

## Interfaces this branch adds or changes
Per 15c spec §5: migration (next free) `agency.suspended_at/_reason/_by`, `plan.visibility`; 13 platform tools (§5.1–5.5); `BillingGateway` += `pauseCollection`/`resumeCollection`/`swapSubscriptionPlan`; `billingAccess().onHold`; `agencyServiceable` excludes held agencies.

## Assumes from other branches
- **phase-7c2** (executing) claims **0093** (`ops_alert`); we take the next free (likely 0094); second to merge renumbers + regenerates snapshot/journal. Both edit `isolation/fixtures.ts` and `packages/tools/src/index.ts`. Its readiness uses `agencyServiceable`, so held agencies drop out once we extend it.
- **phase-7b2** (starts after we merge) expects `suspended_at`, `onHold`, `service_paused`, unchanged allow-list, gateway pause methods in `types.ts`/`fake-gateway.ts`/`stripe-gateway.ts` (it never edits those); needs Q4's answer.
- **phase-16** (docs only, code waits for us): restyles our page later; no overlap now.

## Decisions (owner-approved)
15c-3a spec A1–A9 (2026-10-25): split 3a/3b; archive refuses live billing; Archived filter + owner unarchive; hold freezes all billing work; operator invites count toward agency limits, email names the agency; On hold chip + filter; hold start/lift emails admins (generic); branding URLs → 13a; hold time counts, no deadline shift. 15c C1, C5, C6, C10, C11 bind. Q5 (`create_plan` features) deferred to 3b.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

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
