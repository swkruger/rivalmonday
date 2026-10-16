# Phase 11b — Client invite, competitor-review email (agency CC), billing step — design

**Status:** draft for owner review, 2026-10-16. **Branch:** `phase-11`. **Builds on:** 11a spec `2026-10-15-phase-11a-client-setup-wizard-design.md` (D1–D11, `client_setup`, `getSetupState`, wizard, `setup-reminders`) and 9b client billing. New decisions and interfaces only.

## 1. Decisions (owner-approved 2026-10-16)

- **E1 Two emails** to the business owner: `client_invite` (when staff invite) and `competitor_review` (when suggestions are ready). Both agency-branded; nothing names Rival Monday.
- **E2 Real `Cc:`** on both: `OutgoingEmail.cc`, Postmark `Cc`. Cc = the staff member who sent the invite, else the client's account manager (`replyToFor`).
- **E3 Review email trigger:** automatically once per client when the search has finished with ≥ 1 suggestion, an owner is invited (pending or accepted) and competitors are not done; staff can send it manually from the Pick step.
- **E4 Invite step** is step 4, skippable, agency staff only, clients **and prospects** (11c L7), and can be opened early from steps 1–3.
- **E5 Billing step** (step 5, agency admins, clients only) sets per-client price + setup fee and enables billing in one go (closes 9b M5). Allowed while the owner's invitation is **pending**.
- **E6 Delivery path:** the `notification` outbox; the owner's `contact` row is created at invite time **inactive** and activated on acceptance.
- **E7** Inviting any client role from `/agency/team` also sends `client_invite` (same shared function).

## 2. Data

Migration = next free number at execution time.
```sql
ALTER TABLE client_setup
  ADD COLUMN invited_contact_id uuid REFERENCES contact(id) ON DELETE SET NULL,
  ADD COLUMN invited_by uuid;            -- auth user id of the inviting staff member (Cc)
ALTER TABLE client_setup DROP CONSTRAINT client_setup_skipped_check;
ALTER TABLE client_setup ADD CONSTRAINT client_setup_skipped_check
  CHECK (skipped <@ ARRAY['search','competitors','invite','billing']::text[]);
```
- `contact` gains an **inactive** state if it has none (pre-flight: reuse an existing `active`/`status` column if present; else `ADD COLUMN active boolean NOT NULL DEFAULT true`). `recipientsFor` already filters active contacts; keep that.
- `notification` kinds: `CLIENT_KINDS += 'client_invite', 'competitor_review'`. `payload` gains optional `cc: string[]`.

## 3. Email transport

```ts
type OutgoingEmail = { /* existing */ cc?: string[] };   // ≤ 5 addresses, deduped, never equal to `to`
```
- Postmark: `Cc: cc.join(', ')` when non-empty. File/memory/console transports record `cc`.
- `notify(conn, cfg, input)` gains `contactIds?: string[]` (explicit recipients, bypassing the active filter — only for `client_invite` / `competitor_review`) and `cc?: string[]` (copied into `payload.cc`). The dispatcher passes `payload.cc` to the transport.

## 4. Invite

**Tool `invite_client_owner`** — `access: 'write'`, `permission: 'agency'`, channels `web`.
Input `{ clientId: uuid, name: string(1..120), email: email }` → `{ invitationId, expiresAt, contactId }`.
Shared function `inviteClientUser(ctx, deps, { clientId, email, name, role }, now)` (also used by `invite_member` for client roles):
1. Rights exactly as `inviteMember` (agency_admin, or account_manager whose scope covers the client).
2. `inviteMember` (the given client role, `clientId`, 14-day TTL, revokes earlier pending invite for that email).
3. Create or reuse `contact` (agency, client, email; the given role; `active = false` unless an active one exists).
4. For `client_owner` only: `client_setup.invited_contact_id`, `invited_by = ctx.userId`.
5. `notify` kind `client_invite`, `contactIds: [contactId]`, `cc: [inviter email]`, dedupe `client-invite:<invitationId>`.
All in one transaction (outbox row commits with the invitation).
**Acceptance:** `acceptInvitations` / `contactFor` links the contact and sets `active = true`.
**Prospects:** allowed (11c L7). A prospect's client owner sees the setup wizard; prospects still get no recurring work.

## 5. Competitor-review email

- Automatic: in `setup-reminders` (11a §10), alongside `setup_suggestions_ready`: when the condition in E3 holds, `notify` kind `competitor_review`, `contactIds: [invited_contact_id]`, `cc: [invited_by email ?? replyToFor]`, dedupe `competitor-review:<clientId>`.
- Manual: tool `send_competitor_review` (`write`, `agency`) `{ clientId }` → `{ queued: boolean }`; requires an invited contact and ≥ 1 suggestion; dedupe `competitor-review:<clientId>:<UTC yyyy-mm-dd>`.
- Props: `businessName`, up to 5 top-rival names (tier `top`, then `watch`, by `overlap_score` desc) — **names only**, `reviewUrl`.

## 6. Templates (`@cs/email`, agency branding via `resolveBranding`)

| Template | Subject (binding) | Body (binding core; implementer may add one line of context) | Button |
|---|---|---|---|
| `client_invite` | "{agencyName} invited you to see your competitors" | "{agencyName} is setting up weekly competitor reports for {businessName}. Sign in to see who you're up against and what they're changing." | "Get started" → `${appUrl}/sign-in?email=<enc>&next=/c/<id>/setup` |
| `competitor_review` | "Review the competitors we found for {businessName}" | "We found these businesses competing with you: {list}. Tick the ones you want us to watch and untick any that aren't real competitors." | "Review competitors" → same URL shape |

Footer as other client mails (agency sign-off; no Rival Monday). The sign-in page must honour `next` only for same-origin relative paths (pre-flight: check the existing `next`/`callbackURL` handling; add the check if missing).

## 7. Billing step

- Visible to agency admins for clients (not prospects). Hidden with a note when `billing_not_eligible` ("Billing for clients starts once your plan is active.") or Connect not ready ("Connect Stripe in Settings → Billing to bill this client."); in that case step 5 counts as `skipped`.
- Fields prefilled: monthly price = stored per-client price ?? agency default; setup fee = agency default, 0 if the client has paid before (existing rule). Button "Turn on billing and email the payment link" → `enable_client_billing({ clientId, priceCents, setupFeeCents })` via `runTool`.
- Step state from `client_billing.state`: none/off → `todo`; invited/paying/payment-needed → `done`.
- **`clientOwnerEmails(db, clientId, now)`** returns accepted `client_owner` membership emails **∪** emails of pending, unexpired, unrevoked `client_owner` invitations for that client (deduped, lower-cased). Used by `enable_client_billing` and the `client-payment-link` sender in `billing-notices.ts`. `no_client_owner` copy → "Invite the business owner first."

## 8. Setup state changes (amends 11a §4)

- Steps for clients: `profile, search, competitors, invite, billing`; for prospects: the first four (no billing). Badge "n of 5" / "n of 4".
- `invite`: `done` when an invitation exists for `invited_contact_id` (pending or accepted; UI shows "Invited" / "Accepted"); `skipped` if in `skipped`; else `todo`.
- `billing`: §7; `skipped` when ineligible.
- `completeIfDone` uses the client's step list. `convert_prospect` reopens setup (`completed_at = NULL`) when the row exists and was completed after only four steps.
- Starting-point clock unchanged (11a §9).

## 9. Tests

- Unit: `invite_client_owner` rights (out-of-scope account manager refused; client roles refused); creates inactive contact; activation on acceptance; `client_invite` dedupe and re-send (new invitation id); team-page client invite also queues `client_invite`; prospect invite allowed.
- Review email: not sent when competitors done; once only; manual send dedupe per day; props carry names only (no `overlap_score`/`signals`/`ad_matches`).
- Transport: Postmark request has `Cc`; file transport records `cc`; `cc` never contains `to`.
- Billing: `clientOwnerEmails` includes pending, excludes expired/revoked; `enable_client_billing` with price + setup fee for a pending owner; step hidden + skipped when ineligible.
- State: 5-step completion; `convert_prospect` reopens; `recipientsFor` skips inactive contacts (no brief before acceptance); `next` redirect rejects absolute URLs.
- E2E: wizard invite → outbox JSON has `cc` → follow link → sign in → `/c/<id>/setup`; billing step with `BILLING_FAKE_GATEWAY` → payment-link email to the pending owner.

## 10. Out of scope

Client-facing reminder emails; per-agency sending domains (`fromEmail`); intake links / lead pool (11c).
