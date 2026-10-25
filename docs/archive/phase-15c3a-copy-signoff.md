# 15c-3a copy sign-off (agency management)

Owner: tick or edit each table. Status column: **decided** = fixed in the spec/brief (shown for completeness, change only on purpose); **draft** = written by an implementer, needs your approval. `{x}` is filled in live. Staff-only surfaces (platform console) are operator copy; the hold email and the hold/needs-attention bars are seen by agency people and clients.

## 1. Emails (agency admins; Rival Monday branded)

Source: `packages/email/src/templates/agency-hold.tsx`. Never carries the operator's hold reason.

| Message | Copy | Status |
|---|---|---|
| Subject, hold started | "Your {agency} account is on hold" | decided |
| Body, hold started | "Your {agency} account is on hold. Your team can still sign in and see everything, but changes and scheduled work are paused, and so is billing." + "To restore it, reply to this email or contact {supportEmail}." | decided |
| Subject, hold lifted | "Your {agency} account is active again" | decided |
| Body, hold lifted | "The hold on your {agency} account has been lifted. Your team can make changes again, and scheduled work and billing resume today." | decided |

## 2. What the agency and its clients see while on hold

| Where | Copy | Status |
|---|---|---|
| Bar for agency admins and account managers (`packages/billing/src/access.ts` `HOLD_MESSAGE`, `components/shell/billing-banner.tsx`) | "This account is on hold. Contact {supportEmail} to restore it." Suppresses the Stripe banners | decided |
| Bar for client roles (`ACCOUNT_NEEDS_ATTENTION_MESSAGE`) | "Your agency's account needs attention." | decided (existing line) |
| Refusal on any write while held (`packages/tools/src/billing-guard.ts`) | The same two sentences as the bar, by role | decided |

## 3. Platform console: agencies list (`/platform/agencies`)

| Where | Copy | Status |
|---|---|---|
| Status filters (`page.tsx` FILTERS) | "Active", "On hold {n}", "Archived {n}", "All" | draft |
| Held row | Danger chip "On hold" (`lib/labels.ts` `AGENCY_LIFECYCLE`) | decided |
| Archived table (`agency-table.tsx`) | Columns Agency, Status, Clients, Archived; date followed by " · purge possible" at 30 days or more; owner-only button "Unarchive" | draft |
| Search with no result | "No agencies match “{query}”." | existing |
| Row Unarchive dialog (`unarchive-row-button.tsx`) | Title "Unarchive {agency}?"; body "The agency and its clients come back as they were. Paused billing doesn't restart on its own."; button "Unarchive" | draft |

## 4. Platform console: agency detail (`/platform/agencies/{id}`)

### Manage menu and dialogs (`manage-menu.tsx`)

| Where | Copy | Status |
|---|---|---|
| Menu | "Manage"; items "Rename agency", "Put on hold" / "Lift hold", "Archive agency" (owner only) | draft |
| Rename | Title "Rename agency"; label "Agency name"; button "Rename" | draft |
| Hold dialog | Title "Put {agency} on hold?"; intro "While on hold:"; bullets "Its team can sign in and see everything, but can't change anything." / "Scheduled work stops: no collection, briefs or alerts." / "Billing pauses on its plan and on its clients' subscriptions. Invoices during the hold aren't charged later." / "Its agency admins get an email saying the account is on hold."; label "Reason (staff only)"; hint "Never shown to the agency. 3–500 characters."; button "Put on hold" | decided (spec 4.2) |
| Lift dialog | Title "Lift the hold on {agency}?"; body "Changes, scheduled work and billing resume now, and its admins get an email."; button "Lift hold" | decided (spec 4.2) |
| Archive dialog | Title "Archive {agency}?"; body "The agency, its team and its clients disappear for everyone outside the platform. Nothing is deleted: evidence stays, and an owner can unarchive it from the Archived filter. After 30 days it can be purged."; type-to-confirm label "Type {agency} to confirm"; button "Archive agency" | decided (spec 4.4) |
| Unarchive dialog | Title "Unarchive {agency}?"; body "The agency and its clients come back as they were. Paused billing doesn't restart on its own."; button "Unarchive" | draft |

### Archive refusals (R1) (`platform-agency.ts` `ARCHIVE_BILLING_MESSAGE` + the page's blocker sentence)

Every variant starts with the decided sentence "This agency still has active billing. Cancel it in Stripe first, then archive." followed by one of the draft sentences:

| Case | Sentence | Status |
|---|---|---|
| Plan and 2 or more client subscriptions | "Its plan and {n} client subscriptions are still active." | draft |
| Plan and 1 client subscription | "Its plan and 1 client subscription are still active." | draft |
| Plan only | "Its plan is still active." | draft |
| 2 or more client subscriptions | "{n} client subscriptions are still active." | draft |
| 1 client subscription | "1 client subscription is still active." | draft |

### Hold chip, banner and results

| Where | Copy | Status |
|---|---|---|
| Chip (`hold-banner.tsx`) | "On hold"; tooltip "Reason: {reason}" and "Since {date} · by {name}" | decided (spec 4.2) |
| Banner, pause failed | "On hold since {date} by {name}. Billing pause failed for some subscriptions. The hold still applies." | decided (spec 4.2) |
| Banner, resume failed | "Billing resume failed for some subscriptions." | decided (spec 4.2) |
| Retry button and dialog | "Retry billing pause" / "Retry billing resume"; title "Retry the billing pause?" / "Retry the billing resume?"; body "Stripe is asked again to pause billing on the agency's plan and its clients' subscriptions." (resume: "...to resume billing..."); button "Retry". Owners and staff only | draft |
| Retry result | "{n} subscription(s) updated."; if some still fail: "{n} subscription(s) updated. {m} still failed. Try again later." | draft |
| Hold result | "On hold. Billing paused for {n} subscription(s); {n} admin(s) emailed." + " {n} could not be paused." | draft (shape decided, pluralised) |
| Lift result | "Hold lifted. Billing resumed for {n} subscription(s); {n} admin(s) emailed." + " {n} could not be resumed." | draft (shape decided, pluralised) |
| Reason too short | "Give a reason of 3 to 500 characters." | draft |
| Already held / not held | "This agency is already on hold." / "This agency isn't on hold." | draft |
| Archived detail | Chip "Archived"; description "Archived {date}."; owner button "Unarchive" | draft |
| Results | "Agency renamed." / "Agency archived." / "Agency unarchived." | draft (Archived / Unarchived are rarely seen: the page re-renders and the component unmounts) |

### People (`people-section.tsx`)

| Where | Copy | Status |
|---|---|---|
| Heading and counts | "People" + counts line (zero counts left out); "No people yet" | draft |
| Tabs | "Agency team", "Client people", "Pending invites" (each with a count) | draft |
| Empty tabs | "No one on the agency team." / "No client people yet." / "No pending invites." | draft |
| Tables | Team: Name, Email, Role, Clients ("All clients" when none assigned); Invites: Email, Role, Client, Sent, Expires | draft |
| Row menu | "Make account manager" / "Make agency admin"; "Remove from agency" | draft |
| Role dialog | Title "Make {name} an account manager?" / "Make {name} an agency admin?"; bodies "{first} will only see the clients assigned to them and can't manage the team, billing or settings." / "{first} will see every client and can manage the team, billing and settings."; button "Change role"; result "Role changed." | draft |
| Remove dialog | Title "Remove {name} from {agency}?"; body "{first} loses access to the agency and its clients right away. Their past activity stays."; button "Remove"; result "Removed from the agency." | draft |
| Last admin refusal (`access/team.ts` `LAST_ADMIN_MESSAGE`) | "An agency needs at least one admin." | decided (existing) |
| Invite dialog | Button "Invite agency admin"; title "Invite an agency admin"; body "They get an email from {agency} with a link to join as an agency admin."; button "Send invite" | draft |
| Invite results | "Invite sent." / "Invite created, but the email couldn't be sent. Resend it from Pending invites." (rarely seen: the page re-renders) | draft |
| Resend dialog | Title "Resend the invite to {email}?"; body "They get a new email with a link to join. An invite can be resent 3 times a day."; button "Resend"; result "Invite resent." (rarely seen: the page re-renders) | draft |
| Resend refusal (`access/team.ts`) | "You can resend this invite again tomorrow." | decided (existing, shared with the agency's own Resend) |
| Daily invite refusal (`access/team.ts`) | "You've sent a lot of invites today. Try again tomorrow." | decided (existing) |
| Revoke dialog | Title "Revoke the invite to {email}?"; body "The link in their email stops working."; button "Revoke"; result "Invite revoked." | draft |

## 5. Help tips (`apps/web/src/help/copy/platform.ts`, operator audience)

| Tip | Copy | Status |
|---|---|---|
| `platform.agencies.detail.people` ("About people") | "Everyone on this agency and its clients, plus invites that haven't been accepted. Staff can change agency roles, remove people and resend invites. Invites count toward the agency's daily limits." | draft |
| `platform.agencies.detail.hold` ("About holds") | "A hold makes the agency read-only, stops its scheduled work and pauses its billing. Its admins get an email when a hold starts and ends. Payments don't lift a hold; only staff can." | draft |
| `platform.agencies.detail.archive` ("About archiving") | "Archiving hides the agency and its clients from everyone outside the platform. Nothing is deleted, and an owner can unarchive it from the Archived filter. You can't archive while billing is active." | draft |
| `platform.agencies.status` ("About the status filters") | "Active includes agencies on hold. Archived agencies can be restored by an owner, and purged after 30 days." | draft |
| Removed | The old team-counts tip (`platform.agencies.detail.team`) | n/a |

## 6. Guides (`docs/help/pages/`)

- `platform.agencies.detail.operator.md`: the Team bullet became "People"; new sections "Managing people", "Putting an agency on hold" and "Archiving".
- `platform.agencies.operator.md`: new section "Status filters".

## Decisions for the owner

1. Resend limit wording: the dialog says "3 times a day" while the refusal says "tomorrow"; the limit is 3 per rolling 24 hours. OK, or reword the dialog to "3 times in 24 hours"?
2. Filter label "On hold {n}" / "Archived {n}": counts appended to the label. OK?
3. Approve the "draft" rows above, or mark the edits in place.
