# phase-15b2 - agency help copy for owner sign-off (batches A and B)

**Status: ready for owner sign-off (Task 8, 2026-10-20). Agency batches A and B are complete.** Batch A: Portfolio, Add a client, Approvals, Review a brief, Alert review, Prospects, Add a prospect, Prospect, Leads. Batch B: the agency settings pages AI connections, Billing, Branding & voice, Intake link, Platform access, Runbook, Slack & Teams, Team, Usage & limits.

- **Audience**: every page here is reachable by agency roles only (client roles get a "not found" page), so all copy and all eighteen guides are `agency`. Agency copy may name seats, the review queue, limits and costs where they are true. It never names operator-only things (platform costs or margins, verifier thresholds, Jev, other agencies) and never names Rival Monday.
- **Placeholders**: short copy uses `{assistant}` (the agency's assistant name); guides use `{{assistant}}`. No agency guide uses `{{product}}`; the lead-pool wording says "the platform" because the lead card itself says "From the platform", and the Platform access copy says "platform support".
- **Sources**: short copy cites the code beside each string in `apps/web/src/help/copy/agency.ts`; the "Source" column repeats it. Guide numbers are listed in "Numbers in the batch A guides and tips" and "Numbers in the batch B guides and tips".
- **Wiring**: each page passes `helpKey` + `guide={guides.has(KEY)}` to `PageHeader` (guides read once with `helpGuides(ctx, 'agency')`) and renders `PAGE_COPY['agency.<page>'].description` through `HelpText`.
- **Who can open what (batch B)**: Billing, Branding & voice, Intake link, Platform access and Slack & Teams are agency admins only (account managers get "not found"). AI connections, Runbook (read-only for account managers), Team and Usage & limits are open to admins and account managers.

## Owner checklist

Review the copy page by page, then spot-check it in the app as an agency admin. About 25 minutes for both batches.

**Batch A (nine pages, as before)**

1. On each of the nine pages the sentence under the title reads naturally and says what the page is for.
2. Click **Guide** on each page: three parts (What this page tells you, How to use it, Common questions), written for agency staff.
3. Click each **?**: the tip is short and plain. Check the Portfolio **Competitive pressure** tip against a real row (High pressure (70 and above), Medium pressure (40 to 69), Low pressure (1 to 39), Quiet (0)).
4. Empty states: a new agency's Portfolio ("No clients yet" with **Add client**), Approvals, Alert review, Prospects and each Leads tab each say what the place is for and the next step.
5. Sign in as an account manager scoped to some clients: **Add a client**, **Add a prospect** and **Leads** give a "not found" page; Portfolio shows the "Ask an agency admin" empty state.
6. In white-label, with the agency's own display name set: no page, tip or guide says Rival Monday, and the assistant carries the agency's chosen name.

**Batch B (agency settings, nine pages)**

7. Open each page under Agency settings. The sentence under the title says what the page is for, and **Guide** opens a guide with the three standard parts.
8. **Billing**: click the **?** next to the plan name and the status badge. Check the copy against the plan card on your own account: the copy never states a price, so the card's figures must be the ones you expect. Check the status wording (Pilot, Trial, Active, Payment overdue, Paused, Suspended, Cancelled) and the 7-day and 30-day steps.
9. **Intake link**: read **Link name**. Rename the link on a test agency and confirm the old address shows "page not found" and does not redirect, as the copy says.
10. **Platform access**: read **Support sessions** (60 minutes, read-only, audit log) and **End reasons**. Confirm they match what you want agencies to be told.
11. **Usage & limits**: read **Cap and limits**, **Near cap and over cap** and **Questions**. Confirm that the cap being a warning level (only map rank scans check it) is what you want agencies told.
12. **Slack & Teams**: follow **Getting a webhook URL** once for Slack and once for Teams.
13. **Branding & voice**: with no display name set, check that the **Display name** tip matches what a client sees ("your agency's registered name").
14. Empty states: AI connections (tokens, apps), Billing (invoices), Platform access, Slack & Teams, Team (members, invitations) and Usage & limits each say what the place is for.

### Decisions for the owner

| # | Decision | Where | Current state |
|---|---|---|---|
| 1 | The **"Vertical" and "Service type" labels were renamed "Business type"** in three forms: the Add a client lookup form, `ClientProfileForm` (also shown to client owners on their Business profile page, in create mode) and the lead accept form. All three are the same `verticalId` field. | Add a client, Business profile, Leads | Kept by controller ruling (Task 7). You may revert it; only the three labels, the tips "About business types" and four E2E locators (`getByLabel('Business type', { exact: true })`) would change back. |
| 2 | Approvals and Alert review description wording (70 is "unless you changed it"). | Batch A | As written in "Notes for the owner" (batch A). |
| 3 | The "3 to 5 competitors" sentence on Add a client was dropped (no source in code). | Batch A | Dropped. |
| 4 | **Billing copy states no price.** The plan card prints the live plan values, and plans can be priced differently (the seeded default, `packages/billing/src/seed.ts`, is 22900 cents a month including 3 clients plus 9900 cents per extra client, and a 30-day trial). | Billing | Copy refers to "the plan card"; if you want the launch prices in the guide, say so and note they would go stale when a plan is edited. |
| 5 | **The Platform access page still names the platform** in its switch label ("Email me when Rival Monday support opens a session"), the table's fallback support name ("Rival Monday support", `SUPPORT_DISPLAY_NAME`) and one E2E locator. The help copy says "platform support". | Platform access | Left unchanged (existing UI strings, not help); say if you want them neutral. |
| 6 | **The monthly cap is described as a warning level, not a hard stop.** Only the map rank scan checks it. | Usage & limits | Written from the code; confirm that is the message you want. |
| 7 | The runbook editor is shared with the platform and client runbooks, so its empty lines ("No plays yet.", "No rules yet.") were not changed. | Runbook | Left as is. |

# Batch: agency A (Portfolio, Add a client, Approvals, Review a brief, Alert review, Prospects, Add a prospect, Prospect, Leads)

## Short copy (descriptions, tips, empty states)

### agency.portfolio

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Every client at a glance, and what needs you today. Clients with an alert to check or a brief to approve come first, then the highest pressure. | apps/web/src/app/(app)/agency/page.tsx:sortRows (alerts or a brief to approve first, then pressure score, then name) |
| Tip `pressure` | agency | **Competitive pressure**: How much the client's busiest competitor has been doing lately, from 0 to 100: its changes from the last 30 days that made the brief or an alert, plus its open moves. The label reads High pressure (70 and above), Medium pressure (40 to 69), Low pressure (1 to 39) or Quiet (0). The line under it names that competitor and the main reasons. | `packages/tools/src/pressure.ts:combinePressure, pressureByClient (PRESSURE_WINDOW_DAYS); packages/tools/src/tools/portfolio.ts:getPortfolio (client = its strongest competitor)` |
| Tip `budget` | agency | **Budget**: This month's AI and data spend for the client as a share of its monthly cap. It turns amber from 80% (near cap) and red at 100% (over cap). | `packages/tools/src/tools/usage.ts:spendView, packages/tools/src/limits.ts:SPEND_WARNING_RATIO (0.8), packages/db usage.ts:monthStart` |
| Tip `alertsBriefs` | agency | **Alerts and briefs**: Alerts counts the alerts held for your check (clients set to "I review alerts first"); the line under it is how many were sent to that client in the last 7 days. Brief shows the newest brief that needs review. Open either one from the table. | `packages/tools/src/tools/portfolio.ts:getPortfolio (pending_review alerts; alerts delivered in the last 7 days; newest brief with status ready)` |
| Tip `openActions` | agency | **Open actions**: Recommendations for the client that are still To do or In progress. Click the number to open them. | `packages/tools/src/tools/portfolio.ts:getPortfolio (recommendation status todo, in_progress)` |
| Tip `setup` | agency | **The setup chip**: Shows while a client's setup is still open: how many setup steps are done or skipped out of the total. Click it to continue the setup. | `apps/web/src/components/setup-badge.tsx:openSetupSteps; packages/tools/src/tools/portfolio.ts:getPortfolio (done or skipped steps of the open setup)` |
| Tip `checklist` | agency | **The checklist**: Agency admins see a getting-started card with five steps: complete your agency profile, invite your team, review your plan, add your logo and colours, and add your first client. It goes away when all five are done or when you dismiss it. | `apps/web/src/components/agency/onboarding-checklist.tsx:OnboardingChecklist (ITEMS: five steps); apps/web/src/app/(app)/agency/page.tsx (agency admins only)` |
| Empty `noClients` | agency | **No clients yet**: Add a client by searching for its business. A short setup then finds its competitors, invites the owner and sets up billing, and its first brief follows. | wording only; the condition is the page state it replaces |
| Empty `noClientsScoped` | agency | **No clients yet**: The clients you are assigned to show here. Ask an agency admin to add a client or to give you access to one. | wording only; the condition is the page state it replaces |

### agency.clients.new

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Search for the business on Google Maps and create the client from its listing. A short setup follows, where you pick the competitors to monitor. | wording; see page |
| Tip `steps` | agency | **What happens next**: Creating the client opens its setup. The steps are Your business, Finding competitors, Pick competitors, Invite the owner and Billing. The invite and billing steps can be skipped and finished later. | `apps/web/src/app/(app)/c/[clientId]/setup/page.tsx:STEP_LABEL (profile, search, competitors, invite, billing); packages/tools/src/tools/setup.ts (a prospect has no billing step)` |
| Tip `businessType` | agency | **About business types**: The kind of business, such as HVAC and plumbing or dental. It sets the topics, plays and alert levels the client starts with, and the services you can pick. If none fits, create a new business type from the listing; it is reviewed later and may be merged into an existing one. | `wording only; the condition is the page state it replaces` |
| Tip `byHand` | agency | **If the business isn't listed**: Choose "Can't find it? Enter details by hand" under the search to fill in the name, business type, time zone and service area yourself. Search first when you can: it fills in the details from the listing. | `wording only; the condition is the page state it replaces` |

### agency.approvals

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | {assistant} drafts each client's brief on Thursday night, in the client's time zone. Review and approve it for Monday 07:00. Clients set to auto-send get untouched briefs then without your approval. | packages/engine/src/briefs/schedule.ts:BRIEF_LOCAL_WEEKDAY (Thursday, client time); apps/web/src/app/(app)/agency/approvals/[briefId]/review-controls.tsx:AutoSendSwitch (Monday 07:00) |
| Tip `status` | agency | **Status**: Needs review: drafted and waiting for you. Approved: it goes out Monday 07:00. Sent: delivered to the client. Drafting: still being written. Failed — retrying: the draft failed and will run again. | `apps/web/src/app/(app)/agency/approvals/status.ts:STATUS_LABEL` |
| Tip `items` | agency | **Items and badges**: The count shows items still in the brief and items removed from it (by the fact-check or by you). Edited means someone changed the draft. Auto-send means the client gets an untouched brief on Monday 07:00 without approval. Quiet week means no significant competitor moves. | `packages/tools/src/tools/review.ts:listBriefQueue (activeItems, droppedItems, touched, autoSend, kind quiet)` |
| Empty `noBriefs` | agency | **Nothing to review this week**: Each client's brief appears here after {assistant} drafts it on Thursday night. Open it to check every item against its evidence, then approve it. | wording only; the condition is the page state it replaces |

### agency.approvals.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Check each item against its evidence, edit or remove what you do not want, then approve. The client sees only the items that remain. | wording; see page |
| Tip `confidence` | agency | **Confidence**: How sure the draft is about an item, as a percentage. At 85% and above it reads "High confidence" and gets an amber edge; below that it reads "Confidence". It is a prompt to look closer, not a verdict. | `apps/web/src/components/confidence-label.ts:confidenceLabel (HIGH_CONFIDENCE 0.85, one band)` |
| Tip `factCheck` | agency | **Fact-check**: Every sentence left in the brief was checked against saved evidence. When the check removed a sentence or an item because it could not prove it, the page says how many. | `apps/web/src/app/(app)/agency/approvals/[briefId]/page.tsx (factCheck.sentences, factCheck.items)` |
| Tip `upsell` | agency | **Upsell tag**: The upsell tag marks an item that points to a service you could sell. Only you see it: it is never part of the brief the client reads. | `packages/tools CLAUDE.md / spec §8.5: upsell_tag never reaches client-facing reads` |
| Tip `approving` | agency | **What approving does**: Approving schedules the brief for Monday 07:00 in the client's time zone, and its items become the client's recommendations. A starting-point brief is sent straight away. Send now approves it if needed and sends it to the client's recipients at once. The Monday auto-send switch is for clients whose untouched briefs you trust. | `packages/tools/src/tools/review.ts:approveBriefTool, sendBriefNowTool, setBriefAutoSend; review-controls.tsx:ReviewFooter` |
| Tip `rating` | agency | **Rating items**: Useful and Not useful record your feedback on one item. You can rate an item at any time, even after the brief is sent. | `review-controls.tsx:RateButtons, packages/tools/src/tools/review.ts (rate tool: useful or not, per item)` |

### agency.alerts

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Alerts for clients set to "I review alerts first". Approve one to send it to the client, or dismiss it with a reason. Unreviewed alerts expire after 7 days. | packages/engine/src/alerts/create.ts:ALERT_REVIEW_EXPIRY_DAYS (7); alert level default 70 (packages/verticals routing.alert, set per client under Alert rules) |
| Tip `score` | agency | **Score**: How much the change matters to the client, from 0 to 100. A change becomes an alert at the client's alert level, which is 70 unless you changed it under Alert rules. | `packages/engine/src/runbook/store.ts:defaultThresholds (alert 70 unless the agency, platform or client sets another level); packages/engine/src/alerts/route.ts (notifyAm shows the score)` |
| Tip `digest` | agency | **Held for the digest**: A client gets at most 3 instant alerts a day. When you approve one past that limit, it goes in the client's 17:00 digest (client time) instead of being sent at once. Held alerts can only be dismissed. | `packages/engine/src/alerts/route.ts:ALERTS_PER_DAY (3), releaseAlert; packages/engine/src/alerts/digest.ts:DIGEST_LOCAL_HOUR (17)` |
| Tip `template` | agency | **Evidence summary text**: {assistant} writes each alert and checks its wording against the evidence. When it can't verify the wording, the alert uses the plain evidence summary instead. It is safe to send, just less polished. | `apps/web/src/app/(app)/agency/alerts/alert-controls.tsx:AlertCard (written === 'template')` |
| Empty `noAlerts` | agency | **No alerts waiting — nice.**: Alerts appear here for clients set to "I review alerts first" when a change scores at their alert level. Clients in other alert modes get theirs without a check. | wording only; the condition is the page state it replaces |

### agency.prospects

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Businesses you're pitching. A snapshot shows how they stack up locally. Nothing is monitored until you convert them. | wording; see page |
| Tip `ready` | agency | **Ready to snapshot**: A check mark means the prospect has at least one keyword, a service area and at least one competitor, which is what a snapshot needs. "Needs setup" means one of them is missing; open the prospect to see which. | `apps/web/src/app/(app)/agency/prospects/page.tsx:isReady (keywords > 0, service area set, competitors > 0)` |
| Tip `snapshot` | agency | **Snapshot status**: Shows the latest snapshot for the prospect: running while it is being built, ready when you can open the landscape, failed if it did not finish (run it again). A dash means none has been run. | `packages/tools/src/tools/prospects.ts:listProspects (report.status), apps/web prospects/page.tsx` |
| Empty `noProspects` | agency | **No prospects yet**: Add a business you're pitching, pick its competitors and run a snapshot to show how it compares locally. Convert it to a client when it signs. | wording only; the condition is the page state it replaces |
| Empty `noProspectsScoped` | agency | **No prospects yet**: Ask an agency admin to add a prospect. Prospects you are assigned to show here. | wording only; the condition is the page state it replaces |

### agency.prospects.new

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Search for the business, then add its keywords and service area so we can find its competitors. | wording; see page |
| Tip `prospect` | agency | **What a prospect is**: A business you are pitching. A prospect has no weekly monitoring, alerts or briefs: you pick its competitors and run a one-off snapshot, then convert it to a client when it signs. | `packages/tools/src/tools/prospects.ts:convertProspect (status active starts monitoring); docs/gotchas-cross-cutting.md (prospects get no recurring work)` |
| Tip `businessType` | agency | **About business types**: The kind of business, such as HVAC and plumbing or dental. It sets which services you can pick and what the competitor search looks for. | `wording only; the condition is the page state it replaces` |
| Tip `next` | agency | **What happens next**: After you create the prospect, its setup opens: Your business, Finding competitors, Pick competitors and Invite the owner. A prospect has no billing step. Then run a snapshot from the prospect's page. | `apps/web/src/app/(app)/agency/prospects/new/actions.ts (redirects to the setup); packages/tools/src/tools/setup.ts (a prospect has no billing step)` |

### agency.prospects.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Find their competitors, run a one-off snapshot, and show the landscape. Nothing is monitored until you convert them. | wording; see page |
| Tip `steps` | agency | **The four steps**: Profile, Competitors, Snapshot, Convert. The snapshot needs at least one keyword, a service area and at least one competitor; the page lists what is missing. You can run it again later for a fresh look. | `apps/web/src/app/(app)/agency/prospects/[clientId]/page.tsx (blockers); packages/tools/src/tools/prospects.ts:runProspectSnapshotTool` |
| Tip `snapshot` | agency | **What the snapshot shows**: A Google profile and ads table, and how the business and its competitors show on Google Maps across a 3 by 3 grid of the service area. It is built from Google Business Profile, ad-library and Google Maps data with no AI-written text, and usually takes a few minutes. | `apps/web/src/components/prospect-landscape.tsx (generatedAt footer: Google Business Profile, ad-library and Google Maps data, 3x3 grid, no AI-written text)` |
| Tip `convert` | agency | **What converting does**: Converting turns the prospect into an active client: weekly monitoring, alerts and briefs start, and it counts as a client on your plan. If your plan is at its client limit, or your billing needs attention, the page says so and an agency admin can upgrade. If the setup's last step is still open, it reopens at billing. | `packages/tools/src/tools/prospects.ts:convertProspect; packages/billing/src/access.ts:assertCanActivateClient` |

### agency.leads

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Businesses that asked for a competitor snapshot, through your intake link or assigned to you from the platform. Accept one to set it up as a prospect and invite the contact. | wording; see page |
| Tip `tabs` | agency | **Lead tabs**: New holds leads whose contact has confirmed their email and that you have not decided on. Accepted and Declined hold the ones you decided on. The number is how many leads are in each tab. | `apps/web/src/app/(app)/agency/leads/page.tsx:TABS (New = verified, Accepted, Declined; counts)` |
| Tip `source` | agency | **Where leads come from**: "From your website" means the contact used your intake link. "From the platform" means the lead was assigned to you from the shared lead pool. | `apps/web/src/app/(app)/agency/leads/lead-card.tsx:sourceLabel` |
| Tip `decide` | agency | **Accepting or declining**: Accept and invite creates the business as a prospect, starts its setup and emails the contact an invitation as the client owner. Pick the business type first. Decline closes the lead; for a lead from your link you can tick "Let them know" to tell them. A declined lead from the platform goes back to the pool and the contact is not emailed. | `packages/tools/src/tools/leads.ts:acceptLead (creates a prospect, starts its setup, invites the contact as client owner), declineLead` |
| Tip `preview` | agency | **Lead snapshot**: A short preview of how the business shows locally. While it is still being built the card says so, and some leads have none. | `apps/web/src/app/(app)/agency/leads/lead-card.tsx:Preview` |
| Empty `newLeads` | agency | **No new leads**: Share your intake link to start getting them. New requests appear here once the contact confirms their email. | wording only; the condition is the page state it replaces |
| Empty `accepted` | agency | **No accepted leads yet**: Leads you accept appear here with a link to their setup. | wording only; the condition is the page state it replaces |
| Empty `declined` | agency | **No declined leads**: Leads you decline appear here. | wording only; the condition is the page state it replaces |

### Guides

Each guide is `audience: agency` (every page is agency-only), with the three standard sections. `{{assistant}}` is the agency's assistant name; no guide uses `{{product}}` or names the platform. Full text:

#### Guide: agency (`docs/help/pages/agency.alerts.agency.md`)

```markdown
---
help_key: page:agency.alerts
audience: agency
title: Alert review
---
## What this page tells you

Alerts that are waiting for you, for clients whose alert mode is **I review alerts first**. Each card shows the client, the competitor, the alert's **Score**, the headline and text, and how many evidence items back it.

- **Score** runs from 0 to 100 and says how much the change matters to the client. A change becomes an alert at the client's alert level, which is 70 unless you changed it under Alert rules.
- **Held for the 17:00 digest** marks an approved alert that is waiting for the client's digest instead of going out at once, for example because the client already had its 3 instant alerts for the day. The digest goes out at 17:00, client time. You can only dismiss it now.
- A note about **the evidence summary** means {{assistant}} could not verify its own wording, so the alert uses the plain summary of the evidence.

Alerts you do not review within 7 days expire.

## How to use it

1. **Read the alert** and open the client's page if you need more context.
2. **Approve & send** to send it to the client now. If the client has reached its daily limit, it goes in the 17:00 digest instead, and the page tells you which.
3. **Dismiss** if it should not go out. Nothing is sent, and a reason is required.

The other alert modes are set per client under Settings, Delivery: **Direct** sends alerts at once, **Digest only** sends them together in the evening digest.

## Common questions

### Why is a client's alert not here?

Only clients in **I review alerts first** mode appear here, plus alerts held for the digest. Alerts for clients on Direct or Digest only do not need your check.

### Where do I change the alert level?

On the client's Settings page under Alert rules.

### What happens to an alert I dismiss?

Nothing is sent to the client. A reason is required.
```

#### Guide: agency (`docs/help/pages/agency.approvals.agency.md`)

```markdown
---
help_key: page:agency.approvals
audience: agency
title: Approvals
---
## What this page tells you

The weekly briefs for all your clients. {{assistant}} drafts each client's brief on Thursday night, in the client's time zone. You review and approve it for Monday 07:00. The list shows this week's brief for each client, plus any older brief that is still waiting.

- **Status** is one of **Needs review** (drafted and waiting for you), **Approved** (it goes out Monday 07:00), **Sent**, **Drafting** (still being written) or **Failed — retrying**.
- **Items** shows how many items are still in the brief and how many were removed, by the fact-check or by you.
- **Edited** means someone changed the draft. **Auto-send** means the client gets an untouched brief on Monday 07:00 without your approval. **Quiet week** means no significant competitor moves.

## How to use it

1. **Open the briefs that say Needs review.** Click the client's name.
2. **Review each item** against its evidence, edit or remove what you do not want, then approve.
3. **Turn on auto-send** for a client whose briefs you trust, from the bottom of its review page.

A client's brief is only sent by approval or auto-send. You can also send one at once from its review page.

## Common questions

### What does the client get if I do nothing?

A brief that you have not approved is not sent, unless the client is set to auto-send and you have not touched the draft.

### Why is there no brief for a client?

Briefs are drafted on Thursday night in the client's time zone. A client that has just been added, or is paused, may not have one yet.

### Where do alerts that need review go?

Alerts held for your check are under Alert review, not here.
```

#### Guide: agency (`docs/help/pages/agency.approvals.detail.agency.md`)

```markdown
---
help_key: page:agency.approvals.detail
audience: agency
title: Review a brief
---
## What this page tells you

One client's brief, ready for your check before the client sees it. A banner at the top says every remaining sentence was checked against saved evidence, and how many sentences or items the fact-check removed because it could not prove them.

Each item shows what changed, why it matters and a suggested action, with chips that open the evidence. At the right of an item:

- **Confidence** is a percentage for how sure the draft is about the item. At 85% and above it reads **High confidence** and the item gets an amber edge; below that it reads **Confidence**. It is a prompt to look closer, not a verdict.
- **Upsell** appears when the item points to a service you could sell. Only you see it: it is never part of the brief the client reads.
- **Dropped** marks an item that was removed. It is left out of the brief the client sees.

A starting-point brief, the first one for a new client, also shows a **Where you stand** scorecard.

## How to use it

1. **Read each item** and open its evidence if something looks off.
2. **Edit** the headline, what changed, why it matters or the suggested action. **Remove** an item you do not want, with an optional reason. Use the arrows to reorder.
3. **Rate** items **Useful** or **Not useful**. You can do this at any time, even after the brief is sent.
4. **Approve** the brief. It is scheduled for Monday 07:00 in the client's time zone, and its items become the client's recommendations. A starting-point brief is sent as soon as you approve it.
5. **Send now** instead if it should go out at once. It approves the brief if needed and sends it to the client's recipients.
6. **Auto-send** is a switch at the bottom: with it on, untouched briefs go out on Monday 07:00 without your approval.

**Client view** opens the brief the way the client will read it.

## Common questions

### Why can I not edit this brief?

You can edit while it says **Needs review**. Once it is approved or sent, items can no longer be edited, removed or reordered.

### Does the client see what I removed?

No. Removed items are left out of the brief the client sees.

### What is a quiet week?

A week with no significant competitor moves. The page says so and the brief has few or no items.
```

#### Guide: agency (`docs/help/pages/agency.clients.new.agency.md`)

```markdown
---
help_key: page:agency.clients.new
audience: agency
title: Add a client
---
## What this page tells you

This is the first step of adding a client: find the business on Google Maps and create the client from its listing. Creating the client opens its setup, where the rest happens.

The setup steps are **Your business**, **Finding competitors**, **Pick competitors**, **Invite the owner** and **Billing**. The invite and billing steps can be skipped and finished later.

## How to use it

1. **Search.** Enter the business name and a city and state, or a ZIP code, then choose **Find business**.
2. **Pick the match.** Choose the right listing from the results. A note appears if a result looks like a business you already have.
3. **Check the business type.** The type is suggested from the listing. It sets the topics, plays and alert levels the client starts with, and the services you can pick later. If none fits, create a new business type from the listing; it is reviewed later and may be merged into an existing one.
4. **Create the client.** Choose **Create client**. You go straight to the setup.
5. **If the business is not listed,** choose **Can't find it? Enter details by hand** and fill in the name, business type, time zone and service area yourself.

Only agency admins, and account managers who cover all clients, can add a client. If your plan is at its client limit or your billing needs attention, the page tells you, and an agency admin can upgrade.

## Common questions

### How many competitors will it monitor?

You choose them in the setup, under Pick competitors. Each client has a competitor limit, which you can see on its Competitors page.

### Is the client monitored right away?

Monitoring runs for active clients. The setup page tells you when the first brief is due.

### Should this business be a prospect instead?

If you are still pitching, add it under Prospects. A prospect gets no weekly monitoring until you convert it.
```

#### Guide: agency (`docs/help/pages/agency.leads.agency.md`)

```markdown
---
help_key: page:agency.leads
audience: agency
title: Leads
---
## What this page tells you

Businesses that asked for a free competitor snapshot, through your intake link or assigned to you from the platform's shared lead pool. A lead appears under **New** once the contact has confirmed their email. Each card shows the business, the contact, any message and a short snapshot preview of how the business shows locally.

- **From your website** means the contact used your intake link. **From the platform** means the lead was assigned to you from the pool.
- The tabs **New**, **Accepted** and **Declined** hold the leads by decision, with the number in each.
- The **Snapshot** box on a card shows the preview. While it is being built the card says so, and some leads have none.

## How to use it

1. **Read the card.** Check the business, the message and the snapshot.
2. **Accept** to set the business up. Pick its **Business type**, then choose **Accept and invite** followed by the contact's name. This creates the business as a prospect, starts its setup and emails the contact an invitation as the client owner. If no type fits, create a new one from the listing.
3. **Decline** to close the lead. For a lead from your link you can tick **Let them know** to tell the contact. A declined lead from the platform goes back to the pool, and the contact is not emailed.
4. **Open setup** on an accepted lead to continue.

Only agency admins, and account managers who cover all clients, can see leads. To get leads from your own website, share your intake link, which you manage under Agency settings, Intake link.

## Common questions

### Why do I not see a lead I expected?

A lead shows under New only after the contact confirms their email. Leads from your link that were never confirmed do not appear.

### What happens after I accept?

The contact gets an invitation, and the business is a prospect in your Prospects list with its setup open.

### What happens to a lead I decline?

It moves to Declined. A lead from the platform returns to the pool for the platform to assign again.
```

#### Guide: agency (`docs/help/pages/agency.portfolio.agency.md`)

```markdown
---
help_key: page:agency.portfolio
audience: agency
title: Portfolio
---
## What this page tells you

Every active client in one table, sorted by what needs you first. A client with an alert held for your check or a brief waiting for review comes first. After that, the clients are sorted by pressure, highest first, then by name.

The four tiles at the top count your clients, the alerts waiting for your check, the briefs to approve and the clients under high pressure. The columns are:

- **Pressure** shows how much the client's busiest competitor has been doing over the last 30 days, from 0 to 100. The label reads High pressure (70 and above), Medium pressure (40 to 69), Low pressure (1 to 39) or Quiet (0). The line under it names that competitor and the main reasons.
- **Budget** is this month's AI and data spend as a share of the client's monthly cap. It turns amber from 80% (near cap) and red at 100% (over cap).
- **Alerts** counts the alerts held for your check. The line under it shows how many alerts were sent to the client in the last 7 days.
- **Brief** links to the newest brief that needs review.
- **Open actions** counts the client's recommendations that are To do or In progress.
- **Last activity** is the most recent scored change, alert or sent brief.
- **Billing** shows the client's payment state when you bill clients through your account.

A **Finish setup** chip under a client's name means its setup is still open. It shows how many setup steps are done or skipped out of the total.

## How to use it

1. **Start with the clients at the top.** Click the alert count to go to Alert review, or **Approve week of ...** to review that client's brief.
2. **Check the pressure label** to decide where to look next. Click a client's name to open its overview.
3. **Watch Budget** for clients near their cap, then raise the cap or investigate under Agency settings.
4. **Add a client** with the button at the top right. Agency admins and account managers who cover all clients see it.
5. **Use the Getting started card** if it shows. Agency admins see five steps: complete your agency profile, invite your team, review your plan, add your logo and colours, and add your first client. The card goes away when all five are done or when you dismiss it.

## Common questions

### Why do I not see some clients?

Account managers see the clients they are assigned to. Ask an agency admin to change your access.

### Why does a client show Quiet?

Quiet means no competitor of that client has had a change that made the brief or an alert in the last 30 days, and none has an open move.

### Why is a client missing from the table?

The table lists active clients. Prospects are under Prospects.

### Where do I change a client's cap or alert level?

The cap is in Agency settings under Usage. Alert levels are in the client's Settings under Alert rules.
```

#### Guide: agency (`docs/help/pages/agency.prospects.agency.md`)

```markdown
---
help_key: page:agency.prospects
audience: agency
title: Prospects
---
## What this page tells you

The businesses you are pitching. A prospect has no weekly monitoring, alerts or briefs. You pick its competitors and run a one-off snapshot to show how it stacks up locally, then convert it to a client when it signs.

The table shows each prospect's number of competitors, whether it is ready, the state of its latest snapshot and when you added it.

- **Ready?** A check mark means the prospect has at least one keyword, a service area and at least one competitor, which is what a snapshot needs. **needs setup** means one is missing.
- **Snapshot** shows the latest snapshot: **running** while it is built, **ready** when you can open the landscape, **failed** if it did not finish. A dash means none has been run.

## How to use it

1. **Choose New prospect** and search for the business.
2. **Open the prospect** to finish its profile, pick competitors and run a snapshot.
3. **Convert it** from its page when it signs. It then moves to your Portfolio as a client.

Leads from your intake link are under Leads. Accepting a lead creates a prospect here.

## Common questions

### Who can add a prospect?

Agency admins and account managers who cover all clients. Other account managers see the prospects they are assigned to.

### Does a prospect cost anything?

A prospect itself is not monitored. Running a snapshot has a small data cost, which the prospect's page shows before you run it.

### Where did a converted prospect go?

It is now an active client. Open it from the Portfolio.
```

#### Guide: agency (`docs/help/pages/agency.prospects.detail.agency.md`)

```markdown
---
help_key: page:agency.prospects.detail
audience: agency
title: Prospect
---
## What this page tells you

One prospect's hub, in four steps: **Profile**, **Competitors**, **Snapshot** and **Convert**. Nothing is monitored until you convert the prospect.

- **Profile** shows how many keywords the prospect has and whether a service area is set.
- **Competitors** shows how many competitors are picked, out of the prospect's limit, and their names.
- **Snapshot** runs a one-off check. It builds a Google profile and ads table, and shows how the business and its competitors appear on Google Maps across a 3 by 3 grid of the service area. It uses Google Business Profile, ad-library and Google Maps data, with no AI-written text, and usually takes a few minutes. The page shows the cost per snapshot.
- **Landscape** appears under the snapshot when it is ready.

## How to use it

1. **Complete the profile.** Choose **Edit business profile** to add at least one keyword and a service area.
2. **Pick competitors.** Choose **Find and pick competitors** and pick at least one.
3. **Run the snapshot.** The button is off until the profile and competitors are complete, and the page lists what is missing. While it runs, the page updates by itself. **Run snapshot again** gives a fresh look.
4. **Convert to client** when the prospect signs. Weekly monitoring, alerts and briefs start, and it counts as an active client on your plan.

## Common questions

### What if converting is refused?

If your plan is at its client limit, or your billing needs attention, the page says so. An agency admin can upgrade the plan.

### What happens to the setup when I convert?

If the setup's last step is still open, it reopens at billing.

### Why did the snapshot fail?

The page shows the reason. Run it again; if it keeps failing, check that the profile has a service area and that the competitors are right.
```

#### Guide: agency (`docs/help/pages/agency.prospects.new.agency.md`)

```markdown
---
help_key: page:agency.prospects.new
audience: agency
title: Add a prospect
---
## What this page tells you

The first step of adding a business you are pitching. Search for it on Google Maps and create the prospect from its listing. A prospect has no weekly monitoring, alerts or briefs: you pick its competitors and run a one-off snapshot, then convert it to a client when it signs.

After you create the prospect, its setup opens with **Your business**, **Finding competitors**, **Pick competitors** and **Invite the owner**. A prospect has no billing step.

## How to use it

1. **Search.** Enter the business name and a city and state, or a ZIP code, then choose **Find business**.
2. **Pick the match** and check the business type. It sets which services you can pick and what the competitor search looks for. If none fits, create a new business type from the listing.
3. **Choose Create prospect.** You go to the setup, where you add keywords and a service area so the competitor search can run.
4. **If the business is not listed,** choose **Can't find it? Enter details by hand**.

Only agency admins, and account managers who cover all clients, can add a prospect.

## Common questions

### What is the difference between a prospect and a client?

A client is monitored every week and gets alerts and briefs. A prospect is not monitored. Converting it makes it a client.

### Why do I need keywords and a service area?

They tell the competitor search where to look and what to look for. A snapshot needs at least one keyword, a service area and at least one competitor.
```

## Numbers in the batch A guides and tips

| Number or label | Where it appears | Source |
|---|---|---|
| Pressure bands 70 / 40 / 1 / 0 and labels High pressure, Medium pressure, Low pressure, Quiet | Portfolio tip and guide | `packages/tools/src/pressure.ts:combinePressure`; labels `apps/web/src/components/pressure-badge.tsx` (Task 3) |
| 30-day pressure window | Portfolio tip and guide | `packages/tools/src/pressure.ts:PRESSURE_WINDOW_DAYS` |
| Pressure of a client = its strongest competitor | Portfolio tip and guide | `packages/tools/src/tools/portfolio.ts:getPortfolio` (`comps[0]`) |
| Sort order: alerts or a brief to approve first, then pressure, then name | Portfolio description and guide | `apps/web/src/app/(app)/agency/page.tsx:sortRows`, `isUrgent` |
| Budget amber at 80%, red at 100% (near cap, over cap) | Portfolio tip and guide | `packages/tools/src/limits.ts:SPEND_WARNING_RATIO`, `usage.ts:spendLevel`, `spend-badge.tsx` |
| Alerts sent in the last 7 days | Portfolio tip and guide | `portfolio.ts:getPortfolio` (`weekAgo`) |
| Five checklist steps, admins only | Portfolio tip and guide | `apps/web/src/components/agency/onboarding-checklist.tsx:ITEMS`; `agency/page.tsx` (`agency_admin`) |
| Setup steps Your business, Finding competitors, Pick competitors, Invite the owner, Billing (a prospect has no billing step) | Add a client, Add a prospect | `apps/web/src/app/(app)/c/[clientId]/setup/page.tsx:STEP_LABEL`; `packages/tools/src/tools/setup.ts` (skip_billing refused for a prospect) |
| Thursday night drafting, client time | Approvals description, tip and guide | `packages/engine/src/briefs/schedule.ts:BRIEF_LOCAL_WEEKDAY` |
| Monday 07:00 delivery and auto-send | Approvals, Review a brief | `packages/engine/src/briefs/deliver.ts:DELIVERY_LOCAL_HOUR`; `review.ts:setBriefAutoSend` |
| Brief queue: this week's brief plus any older brief still ready | Approvals guide | `packages/tools/src/tools/review.ts:briefQueueWhere` |
| Status labels Needs review, Approved, Sent, Drafting, Failed — retrying | Approvals tip and guide | `apps/web/src/app/(app)/agency/approvals/status.ts:STATUS_LABEL` |
| Confidence: one band, 85% and above reads "High confidence" | Review a brief tip and guide | `apps/web/src/components/confidence-label.ts:HIGH_CONFIDENCE` |
| A starting-point brief is sent when approved | Review a brief tip and guide | `packages/tools/src/tools/review.ts:approveBriefTool` |
| Items editable only while the brief is ready | Review a brief guide | `approvals/[briefId]/page.tsx` (`editable = brief.status === 'ready'`) |
| Alert level 70 unless changed | Alert review tip and guide | `packages/engine/src/runbook/store.ts:defaultThresholds` (pack routing `alert: 70`, `packages/verticals/src/packs.test.ts`) |
| 3 instant alerts a day, then the digest | Alert review tip and guide | `packages/engine/src/alerts/route.ts:ALERTS_PER_DAY`, `releaseAlert` |
| Digest at 17:00, client time | Alert review tip and guide | `packages/engine/src/alerts/digest.ts:DIGEST_LOCAL_HOUR` |
| Alerts expire after 7 days unreviewed | Alert review description and guide | `packages/engine/src/alerts/create.ts:ALERT_REVIEW_EXPIRY_DAYS` |
| Alert queue = alerts waiting for review plus approved alerts held for the digest | Alert review guide | `packages/tools/src/tools/alert-queue.ts:listAlertQueue` |
| Ready = a keyword, a service area and a competitor | Prospects tip and guide | `apps/web/src/app/(app)/agency/prospects/page.tsx:isReady`; `packages/tools/src/tools/prospects.ts:runProspectSnapshotTool` |
| Snapshot states running / ready / failed | Prospects tip and guide | `prospects.ts:listProspects`, `snapshot-controls.tsx` |
| Snapshot content: Google profile and ads table, Maps visibility on a 3 by 3 grid, no AI text, usually a few minutes | Prospect tip and guide | `apps/web/src/components/prospect-landscape.tsx` (footer); `prospects.ts` ("usually takes a few minutes") |
| Convert: starts monitoring, alerts and briefs; counts toward the plan's client limit; reopens the setup at billing | Prospect tip and guide | `prospects.ts:convertProspect`; `packages/billing/src/access.ts:assertCanActivateClient` |
| Accept and invite: creates a prospect, starts its setup, invites the contact as client owner | Leads tip and guide | `packages/tools/src/tools/leads.ts:acceptLead` (description), `lead-card.tsx:AcceptForm` |
| Decline: a platform lead returns to the pool and nobody is emailed; for an own-link lead "Let them know" is optional | Leads tip and guide | `leads.ts:declineLead`, `lead-card.tsx:DeclineForm` |
| Lead tabs New (verified), Accepted, Declined with counts | Leads tip and guide | `apps/web/src/app/(app)/agency/leads/page.tsx:TABS` |

## UI strings changed outside `PAGE_COPY`

| Page | Was | Now | Why |
|---|---|---|---|
| Add a client / Add a prospect form, Business profile form | Label "Vertical"; option "Choose a vertical" | "Business type"; "Choose a business type" | One user-facing name (brief rulings): vertical and service type both read "business type". E2E specs and unit tests that found the field by its label were updated (`getByLabel('Business type', { exact: true })`). |
| Lead card accept form | Label "Service type" | "Business type" | Same. |
| Portfolio | Description "Every client at a glance — what needs you today." | See the Portfolio description | Now states the sort order. |
| Add a client | "Next you'll pick 3–5 competitors to monitor." | See the Add a client description | The "3 to 5" had no source in the code (the default competitor limit is 5, `packages/tools/src/limits.ts:DEFAULT_COMPETITOR_LIMIT`), so it was dropped. |
| Approvals | Empty "Nothing to review this week." | Teaching empty state, same title | `EmptyState`. |
| Alert review | Description "High-priority alerts (score 70+) for clients set to “after my check”..." | See the Alert review description | The mode is called "I review alerts first" on Delivery; 70 is the default level, not a fixed number. Empty text "No alerts waiting — nice." is kept as the title (an E2E reads it). |
| Prospects, Leads | One-line empty text | Teaching empty states | `EmptyState`. |
| Prospect | Description "...and share the landscape..." | "...and show the landscape..." | The page does not share anything. |
| Short-copy lint (`help/copy/copy.test.ts`) | The "client-visible copy never says upsell, seats, routing, prospect" check applied to every entry without `audience: 'agency'` | It skips pages under `agency.` and `platform.` | Those pages return 404 to client roles; their copy is allowed to use these words. |

## Notes for the owner

1. **"Business type"** now replaces "Vertical" and "Service type" in three forms. Say if you would rather keep the old labels and only explain the term in the tips.
2. **The alert level** is described as "70 unless you changed it" because each client can have its own level (Alert rules) and the agency or platform can set another default.
3. **Lead pool**: the agency sees the pool only through "From the platform" cards and the decline note "This lead goes back to the pool." The guide uses the same words. No other pool wording appears.
4. **Prospect snapshot cost**: the Prospect page already prints a hard-coded "about $0.10 to 0.15 per snapshot". Help refers to it ("the page shows the cost per snapshot") and does not repeat the figure; its source is not in the code, so it is worth checking before launch.
5. **Convert and the plan**: the Prospect tip says converting "counts as a client on your plan" and may be refused at the client limit or for a billing state; the exact messages come from `assertCanActivateClient` and are shown by the page.
6. **Not covered**: the Portfolio **Billing** column and its controls have no tip (their states are owned by the billing batch).
7. **Add a client** describes only the search and create step; the setup wizard itself is documented in the client Setup guide (batch C).


# Batch: agency B (AI connections, Billing, Branding & voice, Intake link, Platform access, Runbook, Slack & Teams, Team, Usage & limits)

## Short copy (descriptions, tips, empty states)

Page keys are `agency.settings.<page>` (the menu href with dots, `pageIdOf` in `nav-items.ts`).

### agency.settings.ai

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Connect Claude, ChatGPT or another AI assistant to every client you can access. When it matters, it asks which client you mean. | page wording; see the page file |
| Tip `connector` | agency | **Adding the connector**: Paste the connector URL into your AI assistant, then sign in and choose this workspace. Claude and ChatGPT add it from their Connectors settings. For Claude Code, create a token first and run the command shown; its server name is made from your agency name. | `apps/web/src/components/ai-connections.tsx:ConnectorUrlCard (Claude, ChatGPT and Claude Code steps)` |
| Tip `tokens` | agency | **What a token is**: A token is a password for tools that cannot sign in, such as Claude Code or a script. It acts as you, with the access level you choose. It is shown once when you create it, so copy it straight away. Revoke it at any time and anything using it stops working. | `apps/web/src/components/ai-connections.tsx:AccessTokensCard, ShownOncePanel, RevokeTokenButton` |
| Tip `levels` | agency | **Permission levels**: Read only lets an assistant look things up. Read and feedback also lets it record feedback, such as changing a recommendation's status. Read, feedback and manage also lets it make changes that need manage permission, such as setting a client's alert levels. A token or connected app never gets more than your own role allows. | `packages/core/src/tokens.ts:grantableScopes (agency roles: read, feedback, manage), effectiveScope; packages/core/src/tools.ts:mcpScopeOf; packages/tools/src/tools/alert-rules.ts:setAlertRules (manage); apps/web/src/components/ai-connections.tsx:ACCESS_LABEL` |
| Tip `apps` | agency | **Connected apps**: Apps that were connected by signing in, rather than with a token. Each shows its access level and which workspace it can reach. Disconnect removes its access straight away, and the app has to ask again next time. Admins see everyone's tokens and apps in the agency; account managers see their own. | `apps/web/src/app/(app)/agency/settings/ai/page.tsx (admin sees every member's tokens and apps); components/ai-connections.tsx:ConnectedAppsCard, DisconnectButton` |
| Empty `noTokens` | agency | **No access tokens yet**: Create one when a tool such as Claude Code needs access. Assistants you connect by signing in, like Claude or ChatGPT, do not need a token. | wording only; the condition is the page state it replaces |
| Empty `noApps` | agency | **No connected apps yet**: Paste the connector URL into Claude or ChatGPT and sign in. The app then shows up here. | wording only; the condition is the page state it replaces |

### agency.settings.billing

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Your plan and how many clients it covers, your next invoice, and how your own clients pay you. | page wording; see the page file |
| Tip `plan` | agency | **Your plan and clients**: The plan card shows your monthly price, how many clients the plan includes and the price of each extra client. Read the figures there: plans can be priced differently. A client counts toward the included number when it is active and not paused; prospects and paused clients do not count, and the Seats line shows the count. Going over the included number bills each extra client at the price on the card (an increase is prorated at once, a decrease applies at the next renewal). If you signed up yourself, a trial allows 1 active client until you add a payment method. | `apps/web/src/app/(app)/agency/settings/billing/page.tsx (plan line and Seats line, read from get_billing_summary); packages/db filters.ts:clientServiceable (active and not paused); packages/billing/src/seats.ts:syncSeats (extra = active - included; increase prorates now, decrease at renewal); packages/billing/src/access.ts:TRIAL_ACTIVE_CLIENTS (1); plan prices come from the plan row (packages/billing/src/seed.ts holds only the seeded default)` |
| Tip `status` | agency | **Billing status**: Pilot and Trial are free periods; the end date is shown. Active: paid up. Payment overdue: a payment failed or the trial ended without a card. Everything still works, but you cannot add active clients, and service pauses 7 days after it went overdue (the page shows the date). Paused: history stays viewable, but monitoring, briefs, alerts and the assistant stop. Suspended follows 30 days later: only this page works, and your data is kept. Cancelled: access ends on the date shown. A successful payment makes the account Active again at once. | `apps/web/src/app/(app)/agency/settings/billing/page.tsx:STATE_LABEL, keyDate; packages/billing/src/state.ts:PAST_DUE_TO_READ_ONLY_DAYS (7), READ_ONLY_TO_SUSPENDED_DAYS (30); packages/billing/src/access.ts:decide; packages/tools/src/billing-guard.ts` |
| Tip `invoice` | agency | **Next invoice**: The amount and date of your next invoice: the plan price plus any extra clients, less a discount if you redeemed a code. Recent invoices lists past payments, each with a link to open the invoice. | `apps/web/src/app/(app)/agency/settings/billing/page.tsx (nextInvoice: amountDueCents, periodEnd, discountCents; recentInvoices)` |
| Tip `clientBilling` | agency | **About client billing**: Connect your own Stripe account to bill your clients for monitoring: payments go straight to you, not through your plan. Once connected, set the default monthly price and setup fee, and optionally pause unpaid clients after a number of days (1 to 90). A new price applies to new sign-ups; existing subscriptions are unchanged. A paused client is no longer monitored and stops counting toward your plan. | `apps/web/src/app/(app)/agency/settings/billing/client-billing/section.tsx, defaults-form.tsx (price, setup fee, pause unpaid clients after 1 to 90 days); packages/db filters.ts:clientServiceable` |
| Tip `discount` | agency | **Discount codes**: If you have a discount code, enter it and choose Redeem code. The discount then shows on the plan card and in the amount of your next invoice. | `apps/web/src/app/(app)/agency/settings/billing/redeem-form.tsx; page.tsx (discount line, nextInvoice.discountCents)` |
| Empty `noInvoices` | agency | **No invoices yet**: Invoices appear here after the first payment, each with a link to open it. | wording only; the condition is the page state it replaces |

### agency.settings.branding

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Make the app and your emails look like your agency. Set the name, logo and colours your clients see, who emails come from, and what the assistant is called. | page wording; see the page file |
| Tip `displayName` | agency | **Display name**: The name your clients see in the app, on your intake page and in emails. Leave it blank and they see your agency's registered name. Up to 80 characters. | `packages/email/src/branding.ts:resolveBranding (displayName falls back to the agency name; 80 characters); packages/tools/src/settings.ts:getAgencyBranding, LIMITS` |
| Tip `logo` | agency | **Logo**: Paste an https link to your logo, or upload a PNG, JPEG, WebP or SVG up to 512 KB; an upload is resized to fit 512 by 512 pixels and saved as a PNG. With no logo, your display name is shown as text instead. | `apps/web/src/components/agency/branding-editor.tsx (logo URL, upload types, Mark fallback); apps/web/src/server/logo.ts:LOGO_MAX_BYTES (512 KB), MAX_SIDE (512)` |
| Tip `colours` | agency | **Colours**: Primary and secondary colour take a six-digit hex code such as #47A8E7. A value that is not a valid code falls back to the default. The amber accent is fixed and can't be changed. | `packages/email/src/branding.ts:resolveBranding (color: six-digit hex else the default); branding-editor.tsx (amber accent note)` |
| Tip `sender` | agency | **Email sender**: The from-name is the name on the emails your clients receive. If you leave it blank it is your display name. The sign-off is a line added at the end of those emails, up to 300 characters. The sending address is not set on this page. | `packages/email/src/branding.ts:resolveBranding (fromName falls back to displayName; signOff 300 characters); branding-editor.tsx (no sending address field)` |
| Tip `assistant` | agency | **Naming your assistant**: What your clients call the Ask assistant, up to 30 characters. Leave it blank to use the default name shown in the box. | `packages/tools/src/settings.ts:LIMITS (assistantName 30); apps/web/src/server/theme.ts:themeForViewer (default name when blank)` |

### agency.settings.intake

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | A public page where businesses ask for a free competitor snapshot. New requests appear under Leads. | page wording; see the page file |
| Tip `link` | agency | **Your link**: The public page for your agency, at the address shown. Visitors search for their business and ask for a free competitor snapshot; once they confirm their email you decide under Leads. Copy link gives you the address, and Copy button HTML gives a ready-made button for your website in your primary colour. | `apps/web/src/components/agency/intake-link-card.tsx (Copy link, Copy button HTML, buttonHtml uses the primary colour); packages/tools/src/tools/leads.ts (leads are listed once the contact confirms their email)` |
| Tip `name` | agency | **Link name**: The last part of your address: 3 to 40 lowercase letters, digits or hyphens. If you leave it empty the first time, it is made from your agency name. If you rename it, the old address stops working: visitors to it see a "page not found", and the old address does not redirect to the new one. Update the link on your website, and copy the button HTML again. A name that is taken or reserved is refused. | `packages/tools/src/tools/leads.ts:SLUG_RE (3-40 characters), updateIntakeLink (rename replaces the slug in place; first creation derives it from the agency name; RESERVED_SLUGS, slug_taken); packages/tools/src/intake/public.ts:resolveIntake (looks up the current slug only); apps/web/src/app/start/[slug]/page.tsx (unknown slug is a 404)` |
| Tip `switch` | agency | **Switching the link off**: Turn off the switch and the address shows a "page not found" page. Leads you already have stay under Leads. Switch it back on whenever you like; the address does not change. | `apps/web/src/components/agency/intake-link-card.tsx (switch, "Switched off" line); packages/tools/src/intake/public.ts:resolveIntake (enabled = true required)` |
| Tip `counts` | agency | **Lead counts**: New this month counts leads from this link whose contact confirmed their email since the start of the month (UTC). Accepted counts every lead from this link that you have accepted. | `packages/tools/src/tools/leads.ts:intakeLinkState (newThisMonth = leads from this link verified since the start of the UTC month; accepted = accepted leads from this link)` |

### agency.settings.platform-access

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Every time platform support opened a read-only session on your agency, and why. | page wording; see the page file |
| Tip `sessions` | agency | **What a support session is**: A support session is when platform support opens your agency to help with a problem. A session lasts at most 60 minutes, is read-only so nothing can be changed, and starts with a reason you can read in this list. Everything done in a session is recorded in your agency's audit log. | `packages/tools/src/platform/support.ts:SUPPORT_SESSION_MINUTES (60), startSession; packages/tools/src/tools/support.ts:startSupportSession (reason 5 to 300 characters, audited into the target agency); packages/core/src/tools.ts:READ_ONLY_SESSION_MESSAGE, AuditEvent (role platform_support)` |
| Tip `notify` | agency | **Email alerts**: Switch this on to get an email whenever platform support opens a session on your agency. The emails go to your agency admins. It is off until you turn it on. | `packages/tools/src/tools/support.ts:setSupportAccessNotify (emails the agency admins); packages/db/src/schema/tenancy.ts:notifySupportAccess (default off)` |
| Tip `endReasons` | agency | **End reasons**: Exited: support ended the session. Timed out: it reached 60 minutes. Replaced by a new session: support opened another one. Access revoked: the support person's platform access was removed during the session. Open means it has not ended yet. | `apps/web/src/components/support-sessions-table.tsx:END_REASON; packages/tools/src/platform/support.ts:resolveSession, startSession` |
| Empty `noSessions` | agency | **No support sessions**: Platform support has not opened a session on your agency. If it does, the date, the person, the reason and how it ended are listed here. | wording only; the condition is the page state it replaces |

### agency.settings.runbook

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | How {assistant} words its recommendations, which starting-point rules apply and the settings behind them. Clients start from this runbook and can customise their own copy. | page wording; see the page file |
| Tip `sections` | agency | **Plays, rules and settings**: Plays are the recommendations a brief can suggest, each with a trigger and a template. Starting-point rules shape a client's first brief. Settings cover the alert and brief thresholds, focus services and competitor tiers. Switch an item off to leave it out. | `apps/web/src/components/runbook/runbook-editor.tsx (Plays, Starting-point rules, Settings); knob-card.tsx:KNOB_TITLE; item-card.tsx:EnabledSwitch` |
| Tip `badges` | agency | **Customised and inherited**: Each item has a badge that compares it with the standard runbook that came with the platform. Inherited means it matches; Customised means someone on your team changed it. Edit changes a play's title and template. | `apps/web/src/components/runbook/item-card.tsx:badgeFor, parentName (the platform level is called "standard runbook")` |
| Tip `updates` | agency | **Updates from the standard runbook**: When the standard runbook changes an item you inherited, it shows Update available. Review update shows what changed, and your own version if you customised it. Use the update takes the new text; Keep mine leaves yours as it is. A New item offers Add or Not now; one the standard runbook dropped offers Keep or Remove. | `apps/web/src/components/runbook/item-card.tsx:UpdatePrompts (Review update, Use the update, Keep mine, Add, Not now, Keep, Remove)` |
| Tip `edit` | agency | **Who can edit**: Only agency admins can change the agency runbook. Account managers can read it. | `apps/web/src/app/(app)/agency/settings/runbook/page.tsx (canEdit = agency_admin); packages/tools runbook tools (admin gate)` |
| Tip `clients` | agency | **How clients get it**: Clients whose business type has no built-in plays use this runbook directly. HVAC and dental clients keep the built-in plays until they get a runbook of their own. A client runbook is a copy of this one, with the plays tailored to the client. Changing this runbook does not rewrite a client's copy: the client shows Update available and chooses. | `packages/engine/CLAUDE.md § Runbooks (loadClientRunbook order: client runbook, then legacy overrides, then the agency runbook for business types without their own plays, HVAC and dental stay legacy); apps/web/src/components/runbook/item-card.tsx:UpdatePrompts` |

### agency.settings.slack-teams

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Post agency notices, such as a brief ready for review, to a Slack or Teams channel. | page wording; see the page file |
| Tip `how` | agency | **Getting a webhook URL**: A webhook URL is a private web address that lets notices be posted to one channel. In Slack, create an incoming webhook for the channel and copy its URL (it starts with https://hooks.slack.com/). In Teams, create a Workflows or incoming webhook for the channel and copy its URL (the address ends in webhook.office.com, logic.azure.com or environment.api.powerplatform.com). Choose the matching Kind, paste the URL and choose Add webhook. Only https addresses on those hosts are accepted. | `packages/engine/src/delivery/settings.ts:webhookUrlProblem (https only, hooks.slack.com; Teams *.webhook.office.com, *.logic.azure.com, *.environment.api.powerplatform.com); apps/web/src/app/(app)/agency/settings/slack-teams/webhook-controls.tsx:AddWebhookForm` |
| Tip `kinds` | agency | **Which notices**: Tick the notices a channel should get, or tick none to send it all agency notices. The notices are: client alerts (agency), brief ready for review, brief failed, brief overdue, competitor suggestions ready, client updated their setup, setup waiting on you, quarterly report and rank scan skipped. | `apps/web/src/app/(app)/agency/settings/slack-teams/webhook-controls.tsx:AGENCY_KIND_OPTIONS (mirrors packages/db AGENCY_KINDS); page.tsx ("All agency notices")` |
| Tip `secret` | agency | **Your webhook URL is private**: The URL works like a password, so it is saved but never shown again: the table lists only its host. To change a URL, add a new webhook and switch the old one off. | `packages/tools/src/settings.ts:listWebhooks (url never returned; host only)` |
| Tip `off` | agency | **Turning one off**: The Active switch stops posts to that channel without deleting the webhook. Switch it on again whenever you like. | `apps/web/src/app/(app)/agency/settings/slack-teams/webhook-controls.tsx:WebhookToggle; packages/tools/src/settings.ts:setWebhookActive` |
| Empty `noWebhooks` | agency | **No webhooks yet**: Add one below to post agency notices, such as a brief ready for review, to a Slack or Teams channel. | wording only; the condition is the page state it replaces |

### agency.settings.team

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | Who can work in your agency and what they can do. Invite people by email and choose a role. | page wording; see the page file |
| Tip `roles` | agency | **Roles**: Admin: runs the agency, including billing, branding and the team. Account manager: works with clients, and can be limited to chosen clients. Client owner and Client viewer: people at one client; an owner can do more than a viewer, and both see only their own client. Admins manage everyone. Account managers manage the client owners and viewers of the clients they cover, so that is all they see here. | `apps/web/src/app/(app)/agency/settings/team/invite-form.tsx:ROLE_LABELS; packages/tools/src/access/team.ts:canManage, inviteMember (admins manage everyone; account managers manage client roles of clients they cover)` |
| Tip `scope` | agency | **Assigned clients**: When you invite an account manager, tick the clients they cover, or tick none to cover all clients. An account manager who covers only some clients sees only those clients, and cannot add clients or prospects or see leads. | `apps/web/src/app/(app)/agency/settings/team/invite-form.tsx (Assigned clients, none ticked = all clients); team/page.tsx:scopeLabel; apps/web/src/app/(app)/agency/clients/new/page.tsx and leads/page.tsx (clientScope all)` |
| Tip `invitations` | agency | **Invitations**: An invitation is an emailed link that works for 14 days; the Expires column shows the date. Revoke cancels it. Someone who already has access at that level cannot be invited again: remove them first to change their role. | `packages/tools/src/access/invitations.ts:INVITATION_TTL_DAYS (14); packages/tools/src/access/team.ts:inviteMember (already has access at that scope)` |
| Tip `removing` | agency | **Removing someone**: Removing a person ends their access to this agency at once, and links already sent to them stop working. An agency needs at least one admin, so the last admin cannot be removed. | `apps/web/src/app/(app)/agency/settings/team/invite-form.tsx:RemoveMemberButton (dialog text); packages/tools/src/access/team.ts:revokeMembership (an agency needs at least one admin)` |
| Empty `noMembers` | agency | **No members yet**: The people you can manage appear here. Invite someone below with their email and a role. | wording only; the condition is the page state it replaces |
| Empty `noInvites` | agency | **No pending invitations**: Invitations you send appear here until they are accepted or expire after 14 days. | wording only; the condition is the page state it replaces |

### agency.settings.usage

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | agency | This month's AI and data spend for each client against its monthly cap, and the limits you set for it. Months run on UTC. | page wording; see the page file |
| Tip `spend` | agency | **What spend includes**: The AI and data costs tied to the client so far this month, against its monthly cap. The month is a UTC calendar month. Shared monitoring of competitors (Google profile, reviews, ads) and the intelligence engine's shared work are not split across clients yet, so they are not in these figures. If you cover all clients, spend that is not tied to a client is listed under the table. | `packages/tools/src/tools/usage.ts:getUsage (llm_call and vendor_call cost tied to the client since packages/db monthStart, UTC; agencyLevelSpend); apps/web/src/app/(app)/agency/settings/usage/page.tsx (footnote)` |
| Tip `share` | agency | **Near cap and over cap**: The share is spend divided by the client's cap. It turns amber, labelled near cap, from 80% and red, labelled over cap, at 100% or more; the two tiles count the clients in each state. The cap is a warning level, not a hard stop: the only thing that checks it is the map rank scan, which skips a scan that would take the client over. | `packages/tools/src/limits.ts:SPEND_WARNING_RATIO (0.8); packages/tools/src/usage.ts:spendLevel; apps/web/src/components/spend-badge.tsx; packages/collectors/src/rankings/budget.ts (the only cap check: a map rank scan that would go over the cap is skipped)` |
| Tip `competitors` | agency | **Competitor limit**: How many competitors the client tracks now, out of the most it may track. "Over limit" shows when it tracks more than its limit, for example after you lowered the limit. | `apps/web/src/app/(app)/agency/settings/usage/page.tsx (competitors of competitorLimit, Over limit); packages/tools/src/tools/usage.ts:getUsage` |
| Tip `questions` | agency | **Question quota**: The Ask questions the client's people have asked this UTC month, against the client's monthly quota. Only questions from client owners and viewers count; your own team's questions use none. At quota, the client's people cannot ask more until next month. | `apps/web/src/app/(app)/agency/settings/usage/questions-cell.tsx; packages/ask/src/quota.ts:beginTurn (client roles only; agency users are never counted nor stopped); packages/tools/src/tools/usage.ts:getUsage (counts_toward_quota, this UTC month)` |
| Tip `limits` | agency | **Cap and limits**: Admins set three limits for each client. Cap is the monthly spend in dollars ($1 to $10,000; new clients start at $15). Limit is how many competitors the client may track (1 to 10; new clients start at 5). Questions per month is the Ask quota (0 to 100,000; new clients start at 100). Save applies the three to that client. | `packages/tools/src/limits.ts:DEFAULT_MONTHLY_CAP_USD (15), MAX_MONTHLY_CAP_USD (10000), DEFAULT_COMPETITOR_LIMIT (5), MAX_COMPETITOR_LIMIT (10); packages/tools/src/tools/usage.ts:setClientLimits (quota 0 to 100000); packages/db/src/schema/tenancy.ts:askMonthlyQuota (default 100); limits-form.tsx` |
| Empty `noClients` | agency | **No clients to show yet**: Clients and prospects appear here with their spend, competitors and questions once you add them. | wording only; the condition is the page state it replaces |

### Guides

Each guide is `audience: agency` (every page is agency-only), with the three standard sections. `{{assistant}}` is used in the Runbook guide only; no guide uses `{{product}}` or names the platform. Full text:

#### Guide: agency (`docs/help/pages/agency.settings.ai.agency.md`)

```markdown
---
help_key: page:agency.settings.ai
audience: agency
title: AI connections
---
## What this page tells you

The ways your team can use an AI assistant such as Claude or ChatGPT with the competitor data of every client you can access. When a question could be about more than one client, the assistant asks which client you mean.

- **Connector URL** is the address you paste into the assistant. The page lists the steps for Claude, ChatGPT and Claude Code. The Claude Code command uses a server name made from your agency name.
- **Access tokens** are for tools that cannot sign in, such as Claude Code or a script. Each shows its access level, when it was created and when it was last used.
- **Connected apps** are assistants that were connected by signing in. Each shows its access level and the workspace it can reach.

As an admin you see everyone's tokens and apps in the agency. An account manager sees their own.

## How to use it

1. **Connect an assistant that can sign in.** In Claude or ChatGPT, add a custom connector, paste the connector URL, sign in and choose this workspace. The app then appears under Connected apps.
2. **Connect a tool that cannot sign in.** Create a token: give it a name, choose an access level and copy it straight away, because it is shown only once. Then run the command shown for Claude Code, with your token in place of `YOUR_TOKEN`.
3. **Choose the lowest level that does the job.**
   - *Read only* lets an assistant look things up.
   - *Read and feedback* also lets it record feedback, such as changing a recommendation's status.
   - *Read, feedback and manage* also lets it make changes that need manage permission, such as setting a client's alert levels.
4. **Revoke or disconnect** anything you no longer use or do not recognise. It stops working straight away. The buttons are hidden in a read-only support session.

## Common questions

### Can an assistant do more than I can?

No. A token or connected app never gets more than your own role allows, whatever level it was created with.

### I lost a token. Can I see it again?

No. A token is shown once. Revoke it and create a new one.

### Where do my clients connect an assistant?

Client owners create their own tokens on their client's AI connection page, with Read only or Read and feedback. You see those under the client's settings, but you do not create tokens there.

### Is there a limit on assistant calls?

Yes. Requests are rate limited per minute and per day. A limit that is hit shows as an error in the assistant, not on this page.
```

#### Guide: agency (`docs/help/pages/agency.settings.billing.agency.md`)

```markdown
---
help_key: page:agency.settings.billing
audience: agency
title: Billing
---
## What this page tells you

Your agency's plan, what it covers, what you will be invoiced next, and how your own clients pay you. Only agency admins can open it.

- **The plan card** names your plan and its state (Pilot, Trial, Active, Payment overdue, Paused, Suspended or Cancelled), with the key date for that state. Under it, one line spells out your price: the monthly price, how many clients the plan includes, and the price of each extra client. Plans can be priced differently, so read your figures from that line.
- **Seats** counts your active clients against the clients the plan includes. A seat is an active client that is not paused. Prospects do not count, and a paused client stops counting. *Download seat report (CSV)* lists each active client and the date it was added.
- **Next invoice** shows the amount and date, less any discount. It is the plan price plus any extra clients.
- **Client billing** is separate from your plan: it is how your own clients pay you through your Stripe account.
- **Discount code** and **Recent invoices** are at the bottom.

## How to use it

1. **Check the plan line and Seats.** If Seats shows more clients than the plan includes, each extra client is billed at the extra-client price on the plan card. An increase is prorated at once; a decrease applies at the next renewal.
2. **Add a payment method** while you are on a pilot or trial. The button reads *Add payment method*; after that it reads *Manage billing* (or *Subscribe* if your subscription has ended). If you signed up yourself, your trial allows 1 active client until you add a payment method.
3. **Bill your own clients.** Under Client billing choose *Connect Stripe* and finish Stripe's setup. Then set the default monthly price, the setup fee and, if you want, how many days (1 to 90) before an unpaid client is paused. A new price applies to new sign-ups; existing subscriptions are unchanged. Payments go straight to you.
4. **Redeem a discount code** in the Discount code box. The discount then shows on the plan card and in the next invoice amount.

## Common questions

### What does "payment overdue" mean for me?

A payment failed, or the trial ended without a card. Everything still works, but you cannot add active clients, and service pauses 7 days after it went overdue. The plan card shows the date. Update your payment method with *Manage billing* and the account is Active again as soon as the payment goes through.

### What happens when the account is Paused or Suspended?

Paused: your history stays viewable, but monitoring, briefs, alerts and the assistant stop. Suspended follows 30 days later: only this page works, and your data is kept. Your clients' people see a notice that the workspace is temporarily unavailable.

### Why does the plan say "includes 3 clients" when it counts seats?

They are the same number. The plan's included seats are the clients you can have active before extra clients are billed. The number on your plan card is the one that applies to you.

### Does pausing a client lower my bill?

A paused client is no longer monitored and stops counting toward your seats. The lower count reaches your invoice at the next renewal.

### Why can I not open this page?

Billing is for agency admins. Account managers and client roles get a "not found" page.
```

#### Guide: agency (`docs/help/pages/agency.settings.branding.agency.md`)

```markdown
---
help_key: page:agency.settings.branding
audience: agency
title: Branding & voice
---
## What this page tells you

How your agency looks and sounds to your clients: the name, logo and colours they see in the app and in emails, the name emails come from, and what the Ask assistant is called. Only agency admins can open it. The **Live preview** on the right shows a dashboard and an email as you type, and nothing changes for clients until you save.

- **Display name** is the name clients see in the app, on your intake page and in emails. Up to 80 characters.
- **Logo** is an https link, or an upload.
- **Primary** and **secondary colour** set the buttons, links and highlights.
- **Email from-name** and **Email sign-off** shape the emails clients receive.
- **Assistant name** is what your clients call the Ask assistant.

## How to use it

1. **Set the display name.** If you leave it blank, your clients see your agency's registered name. The grey text in the box shows what that is.
2. **Add a logo.** Paste an https link, or choose a PNG, JPEG, WebP or SVG up to 512 KB. An upload is resized to fit 512 by 512 pixels and saved as a PNG. With no logo, your display name is shown as text.
3. **Pick colours** as six-digit hex codes such as #47A8E7, or use the colour picker. A value that is not a valid code falls back to the default. The amber accent is fixed and cannot be changed.
4. **Set the sender.** The from-name is the name on emails; if you leave it blank it is your display name. The sign-off is a line added at the end of those emails, up to 300 characters. The sending address is not set on this page.
5. **Name your assistant**, up to 30 characters. If you leave it blank, clients see the default name shown in the box.
6. **Save changes.** Check the preview first.

## Common questions

### What do clients see if I set nothing?

The app uses your agency's registered name in place of a display name, the default colours, no logo (your name is shown as text), the same name as the email from-name, and the default assistant name.

### Why did my colour not change?

Only six-digit hex codes with a leading # are accepted. Anything else is ignored and the default is used, and the preview shows the result.

### Can I change the address emails are sent from?

Not on this page.
```

#### Guide: agency (`docs/help/pages/agency.settings.intake.agency.md`)

```markdown
---
help_key: page:agency.settings.intake
audience: agency
title: Intake link
---
## What this page tells you

Your agency's public page where a business can ask for a free competitor snapshot. Visitors search for their business, fill in their details and confirm their email. They then appear under **Leads**, where you decide who to accept. Only agency admins can open this page.

- **The link** is the address of your page. *Copy link* copies it; *Copy button HTML* copies a ready-made "Get your free competitor snapshot" button for your website, in your primary colour.
- **Accepting new leads** is the on/off switch for the page.
- **Link name** is the last part of the address.
- **New this month** counts leads from this link whose contact confirmed their email since the start of the month (UTC). **Accepted** counts every lead from this link you have accepted.

## How to use it

1. **Create the link.** Choose a name, or leave it empty and the link is made from your agency name. A name is 3 to 40 lowercase letters, digits or hyphens. A name that is taken or reserved is refused; try another.
2. **Put it on your website.** Share the link, or paste the button HTML into a page. The button is plain HTML with inline styles, so it works in any page builder.
3. **Pause it when you need to.** Turn off the switch and the address shows a "page not found" page. Leads you already have stay under Leads. Switch it back on whenever you like.
4. **Work the leads** under Leads: accept to set the business up as a prospect and invite the contact, or decline.

## Common questions

### What happens to the old link if I rename it?

The old address stops working. Anyone who opens it sees a "page not found" page, and it does not redirect to the new address. The button HTML you copied earlier also points at the old address, so update the link on your website and copy the button HTML again after renaming.

### Can I get my old name back later?

Yes, as long as nobody else has taken it in the meantime. Link names are unique across all agencies.

### Why did my save say the name is taken?

Another agency already uses it, or it is reserved. Try another name.

### Do declined leads or old leads disappear if I switch the link off?

No. Switching it off only stops new requests. Existing leads stay under Leads.
```

#### Guide: agency (`docs/help/pages/agency.settings.platform-access.agency.md`)

```markdown
---
help_key: page:agency.settings.platform-access
audience: agency
title: Platform access
---
## What this page tells you

Your agency's record of every time platform support has opened your workspace, and why. Only agency admins can open it.

A support session is how platform support looks into a problem on your account:

- **It is limited to 60 minutes.** After that it times out.
- **It is read-only.** While a session is open, support can look at your pages but cannot change anything; a write is refused with the message "Read-only support session — changes are disabled."
- **It needs a reason**, which you can read in the list.
- **It is audited.** Everything done in a session is recorded in your agency's audit log, and each session is listed here.

The **Support sessions** table shows when the session started and ended (UTC), the person from platform support, the reason, how many minutes it lasted and how it ended. A session that has not ended yet shows *Open*.

## How to use it

1. **Turn on the email** if you want to know as it happens: switch on *Email me when platform support opens a session*. The email goes to your agency admins. It is off until you turn it on.
2. **Read the list** after a support conversation to see which session matches and what the reason was.
3. **Use Older sessions** at the bottom to page back through the history.

## Common questions

### What do the end reasons mean?

*Exited*: support ended the session. *Timed out*: it reached 60 minutes. *Replaced by a new session*: support opened another one. *Access revoked*: the support person's platform access was removed during the session.

### Can support change my data or settings?

No. A support session is read-only. Writes are refused, and email addresses on the Team page are partly hidden from support.

### Can I stop support opening a session?

Not from this page. The page is your record and your notice, not a switch. If a session looks wrong, contact the platform.

### Why is the list empty?

Platform support has not opened a session on your agency.
```

#### Guide: agency (`docs/help/pages/agency.settings.runbook.agency.md`)

```markdown
---
help_key: page:agency.settings.runbook
audience: agency
title: Runbook
---
## What this page tells you

Your agency's runbook: how {{assistant}} words its recommendations, which starting-point rules apply, and the settings behind them. Clients start from this runbook and can customise their own copy. Agency admins and account managers can open this page; only admins can change it.

The page has three sections:

- **Plays** are the recommendations a brief can suggest, each with a trigger (the kind of change that fires it), a title and a template.
- **Starting-point rules** shape a client's first brief. Switch one off to leave it out.
- **Settings** cover the alert and brief thresholds, focus services and competitor tiers.

Each item has a badge that compares it with the standard runbook that came with the platform: **Inherited** (the same), **Customised** (someone on your team changed it), **Update available**, **New**, or **Removed upstream**. Every item has an on/off switch.

## How to use it

1. **Customise a play** with **Edit**: change the title or template. Saving marks the item *Customised*. **Preview** shows how the template reads.
2. **Switch items off** that you do not want clients to inherit.
3. **Handle updates from the standard runbook.** *Review update* shows what changed, and your own version if you customised it. *Use the update* takes the new text; *Keep mine* leaves yours. A *New* item offers **Add** or **Not now**. One that is *Removed upstream* offers **Keep** or **Remove**.
4. **Open a client's Runbook tab** (Client settings) to give that client its own copy. A client runbook is a copy of this one, with the plays tailored to the client's business.

## Common questions

### Which clients use this runbook?

Clients whose business type has no built-in plays use it directly. HVAC and dental clients keep using the built-in plays until they get a runbook of their own.

### Does a change here reach a client that already has its own copy?

Not automatically. The client's item shows *Update available* and its team chooses to take the new text or keep theirs.

### Why are the controls disabled?

Only agency admins can edit the agency runbook, and nobody can in a read-only support session. Account managers can read it.

### Where are the alert levels for one client?

On that client's Alert rules tab, under Client settings.
```

#### Guide: agency (`docs/help/pages/agency.settings.slack-teams.agency.md`)

```markdown
---
help_key: page:agency.settings.slack-teams
audience: agency
title: Slack & Teams
---
## What this page tells you

Where your agency's own notices are posted to a Slack or Teams channel, so your team sees them without opening the app. Only agency admins can open this page.

The **Webhooks** table lists each channel connection with its kind (Slack or Teams), the host of its address, the notices it receives, and an **Active** switch. The web address itself is never shown again after you save it.

A notice is an agency message such as a brief ready for review. The kinds you can send are: client alerts (agency), brief ready for review, brief failed, brief overdue, competitor suggestions ready, client updated their setup, setup waiting on you, quarterly report and rank scan skipped.

## How to use it

1. **Get a webhook URL.** A webhook URL is a private web address that lets notices be posted to one channel.
   - *Slack:* create an incoming webhook for the channel and copy its URL. It starts with `https://hooks.slack.com/`.
   - *Teams:* create a Workflows webhook, or an incoming webhook, for the channel and copy its URL. The address ends in `webhook.office.com`, `logic.azure.com` or `environment.api.powerplatform.com`.
2. **Add it here.** Choose the **Kind**, paste the URL into **Webhook URL** and choose **Add webhook**. Only https addresses on those hosts are accepted.
3. **Choose the notices.** Tick the ones this channel should get, or tick none to send it all agency notices.
4. **Turn one off** with its **Active** switch. It stops posting without deleting the webhook, and you can switch it back on.

## Common questions

### Why was my URL refused?

It must be an https address on a Slack or Teams host, with no sign-in details or port number in it. The message names the host it did not accept. Check that the Kind matches the URL: a Slack URL under Teams is refused.

### Can I change or remove a webhook?

You can switch it off. To use a different URL, add a new webhook and switch the old one off. The old URL cannot be viewed again.

### Who sees these posts?

Everyone in the Slack or Teams channel. The URL works like a password, so share it only with people you trust.

### Do clients get these messages?

No. These are your agency's notices only; clients get their own alerts and briefs separately.
```

#### Guide: agency (`docs/help/pages/agency.settings.team.agency.md`)

```markdown
---
help_key: page:agency.settings.team
audience: agency
title: Team
---
## What this page tells you

The people who can work in your agency, and what each of them can do. Agency admins and account managers can open this page; what you see depends on your role.

- **Members** lists name, email, role and the client each person is tied to. *All clients* means no restriction.
- **Pending invitations** lists invitations that have been sent but not yet accepted, with the date each one expires.

The roles:

- **Admin** runs the agency, including billing, branding and the team.
- **Account manager** works with clients. An account manager can be limited to chosen clients, or cover all clients.
- **Client owner** and **Client viewer** are people at one client. An owner can do more than a viewer, and both see only their own client.

Admins manage everyone. Account managers manage the client owners and viewers of the clients they cover, so that is all they see on this page.

## How to use it

1. **Invite someone.** Enter their email, choose a role and, for a client role, choose the client. Admins can invite any role; account managers can invite client owners and viewers only.
2. **Limit an account manager.** After choosing *Account manager*, tick the clients they cover, or tick none to cover all clients. An account manager who covers only some clients sees only those clients, and cannot add clients or prospects or see leads.
3. **Check pending invitations.** An invitation works for 14 days; the Expires column shows the date. *Revoke* cancels it.
4. **Remove a person** with *Remove*. Their access ends at once and links already sent to them stop working.

## Common questions

### How do I change someone's role?

Remove them, then invite them again with the new role. Someone who already has access at that level cannot be invited again.

### Why can I not remove the last admin?

An agency needs at least one admin. Invite another admin first.

### An invitation expired. What now?

An expired invitation drops off the pending list. Send a new one to the same email.

### Does adding a team member cost extra?

Your plan counts active clients, not people. See Billing for how clients are counted.
```

#### Guide: agency (`docs/help/pages/agency.settings.usage.agency.md`)

```markdown
---
help_key: page:agency.settings.usage
audience: agency
title: Usage & limits
---
## What this page tells you

This month's AI and data spend for each client against the monthly cap you set for it, plus the other limits you set. The month runs on UTC. Agency admins and account managers can open it; only admins can change the limits.

- The two tiles count the clients **Near cap** and **Over cap**.
- **Spend** is the AI and data cost tied to the client so far this month, as dollars of its cap.
- **Share** is that spend as a percentage of the cap. It turns amber, labelled *near cap*, from 80% and red, labelled *over cap*, at 100% or more.
- **Competitors** is how many competitors the client tracks now, out of the most it may track. *Over limit* shows when it tracks more than its limit.
- **Questions** is the number of Ask questions the client's people have asked this month, out of the client's monthly quota. *At quota* shows when they have used it all.
- **Limits** (admins only) holds the editable **Cap**, **Limit** and **Questions per month** for each client.

Prospects are listed too, with a Prospect badge.

## How to use it

1. **Scan the tiles and the Share column** for clients that are near or over their cap.
2. **Raise or lower a limit.** In the Limits column, edit one of the three numbers and choose **Save**:
   - **Cap** is the monthly spend in dollars, $1 to $10,000. New clients start at $15.
   - **Limit** is how many competitors the client may track, 1 to 10. New clients start at 5.
   - **Questions per month** is the Ask quota, 0 to 100,000. New clients start at 100.
3. **Read the note under the table.** Shared monitoring of competitors (Google profile, reviews, ads) and the intelligence engine's shared work are not split across clients yet, so they are not in these figures. If you cover all clients, spend that is not tied to a client is shown there too.

## Common questions

### What happens when a client goes over its cap?

The cap is a warning level, not a hard stop. The one place that checks it is the map rank scan, which skips a scan that would take the client over the cap. Other work carries on, and the client shows as over cap here and on the Portfolio.

### Whose questions count toward the quota?

Only questions from the client's owners and viewers. Questions your own team asks use none and are never stopped. At quota, the client's people cannot ask more until next month.

### Why is the spend lower than I expected?

Only costs tied to a client are included. Shared work is not split across clients yet.

### Why does a client show Over limit under Competitors?

It tracks more competitors than its current limit, for example after you lowered the limit. Remove competitors from the client's Competitors page, or raise the limit.
```

## Numbers in the batch B guides and tips

| Number or label | Where it appears | Source |
|---|---|---|
| Plan price, included clients and extra-client price are **read from the plan card**, never stated | Billing tip and guide | `apps/web/src/app/(app)/agency/settings/billing/page.tsx` (plan line from `get_billing_summary`); seeded default only in `packages/billing/src/seed.ts` (22900 / 3 / 9900 cents, 30-day trial), editable per plan; `billing/page.test.tsx` renders another plan |
| A seat is an active client that is not paused; prospects do not count | Billing tip and guide | `packages/db/src/filters.ts:clientServiceable`; `packages/billing/src/access.ts:countActiveClients` |
| Extra clients = active minus included; an increase is prorated at once, a decrease applies at renewal | Billing tip and guide | `packages/billing/src/seats.ts:syncSeats` |
| An open sign-up's trial allows 1 active client until a card is added | Billing tip and guide | `packages/billing/src/access.ts:TRIAL_ACTIVE_CLIENTS`, `isReducedTrial` |
| Payment overdue: no new active clients; service pauses after 7 days | Billing tip and guide | `packages/billing/src/state.ts:PAST_DUE_TO_READ_ONLY_DAYS`; `access.ts:decide`; page `keyDate` ("Service pauses <date>") |
| Paused: history viewable, monitoring, briefs, alerts and the assistant stop; Suspended 30 days later, only the billing page works, data kept | Billing tip and guide | `state.ts:READ_ONLY_TO_SUSPENDED_DAYS`; `packages/tools/src/billing-guard.ts`; `docs/superpowers/specs/2026-10-12-phase-9a-platform-billing-design.md` e5 |
| A successful payment makes the account Active at once | Billing tip and guide | `state.ts:nextBillingState` (`subscription_active`) |
| Billing state labels Pilot, Trial, Active, Payment overdue, Paused, Suspended, Cancelled | Billing tip and guide | `billing/page.tsx:STATE_LABEL` |
| Pause unpaid clients after 1 to 90 days; a new price applies to new sign-ups only | Billing tip and guide | `billing/client-billing/defaults-form.tsx` (min 1, max 90, helper text) |
| Display name up to 80, sign-off up to 300, assistant name up to 30 characters | Branding tips and guide | `packages/tools/src/settings.ts:LIMITS` |
| Blank display name shows the agency's registered name; blank from-name shows the display name | Branding tip and guide | `packages/email/src/branding.ts:resolveBranding`; `getAgencyBranding` |
| Logo: https link or upload of PNG, JPEG, WebP or SVG up to 512 KB, resized to fit 512 by 512 and saved as PNG | Branding tip and guide | `apps/web/src/server/logo.ts:LOGO_MAX_BYTES`, `MAX_SIDE`; `branding-editor.tsx` |
| Six-digit hex colours, invalid values fall back to the default; amber accent fixed | Branding tip and guide | `resolveBranding` (`color`); `branding-editor.tsx` note |
| Link name 3 to 40 lowercase letters, digits or hyphens; reserved and taken names refused | Intake tip and guide | `packages/tools/src/tools/leads.ts:SLUG_RE`, `RESERVED_SLUGS`, `updateIntakeLink`; `packages/db/src/schema/leads.ts` (slug unique) |
| Renaming replaces the link name in place; the old address then shows "page not found" and does not redirect | Intake tip and guide | `leads.ts:updateIntakeLink` (updates the slug); `packages/tools/src/intake/public.ts:resolveIntake` (current slug and enabled only); `apps/web/src/app/start/[slug]/page.tsx` (`notFound()`) |
| Switching the link off: the address shows "page not found"; existing leads stay | Intake tip and guide | `resolveIntake` (`enabled = true`); `leads.ts:agencyLeadsWhere` |
| New this month = leads from the link verified since the start of the UTC month; Accepted = accepted leads from the link | Intake tip and guide | `leads.ts:intakeLinkState` |
| Support session: 60 minutes, read-only, reason required, audited into the agency | Platform access tip and guide | `packages/tools/src/platform/support.ts:SUPPORT_SESSION_MINUTES`; `packages/tools/src/tools/support.ts:startSupportSession`; `packages/core/src/tools.ts:READ_ONLY_SESSION_MESSAGE`, `AuditEvent` |
| End reasons Exited, Timed out, Replaced by a new session, Access revoked | Platform access tip and guide | `apps/web/src/components/support-sessions-table.tsx:END_REASON`; `support.ts:resolveSession` |
| The notification email is off by default and goes to the agency admins | Platform access tip and guide | `packages/db/src/schema/tenancy.ts:notifySupportAccess`; `support.ts:setSupportAccessNotify` |
| Team emails are partly hidden from support | Platform access guide | `apps/web/src/server/support-mask.ts:maskTeamForSupport` |
| Only agency admins edit the agency runbook; account managers read it | Runbook tip and guide | `apps/web/src/app/(app)/agency/settings/runbook/page.tsx` (`canEdit`) |
| Clients of business types without built-in plays use the agency runbook; HVAC and dental keep the built-in plays until they have their own | Runbook tip and guide | `packages/engine/CLAUDE.md` § Runbooks (`loadClientRunbook` order) |
| Runbook badges and prompts (Inherited, Customised, Update available, New, Removed upstream; Review update, Use the update, Keep mine, Add, Not now, Keep, Remove); the platform level is called "standard runbook" | Runbook tip and guide | `apps/web/src/components/runbook/item-card.tsx:badgeFor`, `parentName`, `UpdatePrompts` |
| Webhook hosts: `hooks.slack.com`; Teams `webhook.office.com`, `logic.azure.com`, `environment.api.powerplatform.com`; https only, no credentials, no port | Slack & Teams tip and guide | `packages/engine/src/delivery/settings.ts:webhookUrlProblem` |
| Nine notice kinds | Slack & Teams tip and guide | `webhook-controls.tsx:AGENCY_KIND_OPTIONS`; `packages/db/src/schema/delivery.ts:AGENCY_KINDS` |
| The webhook URL is never shown again (host only); webhooks are switched off, not deleted | Slack & Teams tip and guide | `packages/tools/src/settings.ts:listWebhooks`, `setWebhookActive` |
| Invitations work for 14 days | Team tip and guide | `packages/tools/src/access/invitations.ts:INVITATION_TTL_DAYS` |
| Admins manage everyone; account managers manage client roles of clients they cover; the last admin cannot be removed; no re-invite at the same level | Team tip and guide | `packages/tools/src/access/team.ts:canManage`, `inviteMember`, `revokeMembership` |
| A scoped account manager cannot add clients or prospects or see leads | Team tip and guide | batch A pages `clients/new`, `prospects/new`, `leads` (`ctx.clientScope !== 'all'` gates) |
| Roles Admin, Account manager, Client owner, Client viewer | Team tip and guide | `settings/team/invite-form.tsx:ROLE_LABELS` |
| Near cap from 80%, over cap from 100% | Usage tip and guide | `packages/tools/src/limits.ts:SPEND_WARNING_RATIO`; `packages/tools/src/usage.ts:spendLevel`; `components/spend-badge.tsx` |
| The cap is checked only by map rank scans | Usage tip and guide | `packages/collectors/src/rankings/budget.ts`; `packages/tools/src/rank-scan.ts` (the only users of `monthly_cap_usd` besides display) |
| Cap $1 to $10,000, default $15; competitor limit 1 to 10, default 5; questions 0 to 100,000, default 100 | Usage tip and guide | `packages/tools/src/limits.ts`; `packages/tools/src/tools/usage.ts:setClientLimits`; `packages/db/src/schema/tenancy.ts` (column defaults) |
| Spend = AI and data cost tied to the client this UTC month; shared monitoring and engine work are not split across clients; agency-level spend shown to all-client roles | Usage tip and guide | `packages/tools/src/tools/usage.ts:getUsage`; `packages/tools/CLAUDE.md` ("get_usage counts only client-attributed ledger rows") |
| Only client owners' and viewers' questions count toward the quota; agency users are never counted or stopped | Usage tip and guide | `packages/ask/src/quota.ts:beginTurn`; `usage.ts:getUsage` (`counts_toward_quota`) |
| Permission levels Read only, Read and feedback, Read, feedback and manage; a token never exceeds the role | AI connections tip and guide | `packages/core/src/tokens.ts:grantableScopes`, `effectiveScope`; `components/ai-connections.tsx:ACCESS_LABEL`; `packages/tools/src/tools/alert-rules.ts:setAlertRules` (manage example) |
| Admins see every member's tokens and apps; account managers their own | AI connections tip and guide | `settings/ai/page.tsx` (`showOwner={admin}`) |

## UI strings changed outside `PAGE_COPY` (batch B)

| Page | Was | Now | Why |
|---|---|---|---|
| Billing | Page had no description; "No invoices yet." as a plain line | Description from `PAGE_COPY`; teaching empty state titled "No invoices yet" | `EmptyState`. The E2E `billing.spec` now reads `getByText('No invoices yet', { exact: true })`. |
| Branding & voice | "Make Rival Monday look like your agency. Your clients never see our name." | Neutral description (see the table) | Help never names the platform; the promise that clients never see the platform's name cannot be made by this page alone (system emails keep a fallback). |
| Platform access | Description and empty text named "Rival Monday support" | "platform support" | Same rule. The notification switch label and the table's fallback support name still say Rival Monday (see Decision 5). The page test was updated for the new empty text. |
| Slack & Teams | "Post agency notices to a Slack or Teams channel." and "No webhooks yet." | Description adds "such as a brief ready for review"; teaching empty state "No webhooks yet" | `EmptyState`. |
| Team | No description; plain "No members yet." and "No pending invitations." | Description; teaching empty states with the same titles | `EmptyState`. |
| Runbook | Description built in the page from `assistantNameFor` | Same sentence from `PAGE_COPY` with `{assistant}` | The help provider already carries the assistant name. |
| Usage & limits | Description "Spend this month (2026-10, UTC) — AI and data costs tied to each client." | "This month's AI and data spend ... Months run on UTC." followed by "Showing 2026-10." | States what the numbers are against. A "No clients to show yet" teaching empty state was added above the table. |
| AI connections | Description unchanged | Same text, from `PAGE_COPY` | Wiring. |
| Intake link | Description unchanged | Same text, from `PAGE_COPY` | Wiring. |
| Portfolio guide (batch A) | "The cap is in Agency settings under Usage." | "...under Usage & limits." | The menu label is Usage & limits. |
| Client billing card | Title only | Title plus a **?** tip (`help` prop on `ClientBillingSection`) | Wiring. |

## Notes for the owner (batch B)

1. **Billing prices**: see Decision 4. The Billing guide says "includes N clients" in the plan card's own words and explains that a seat is an active client that is not paused. It does not print $229, $99 or the 30-day trial because plans are editable and the card already prints the live values.
2. **Branding "no display name" case**: clients see the agency's registered name (the agency's name on its account), not the words "your agency". "Your agency" is only the neutral word the help text uses when it has no name to show. The assistant keeps its default name when the field is blank; the copy says "the default name shown in the box" so no name is hard-coded.
3. **Intake link rename**: verified in code. Renaming replaces the link name in place, with no history table and no redirect, so the old address becomes "page not found". The "Copy button HTML" snippet embeds the address, so a button already on a website breaks too.
4. **Platform access**: the copy says support "cannot change anything" because writes are refused with "Read-only support session — changes are disabled." (`READ_ONLY_SESSION_MESSAGE`). Email addresses on the Team page are partly hidden from support (`maskTeamForSupport`); other pages are not claimed.
5. **Slack and Teams how-to** describes the steps in Slack and Teams in general terms ("create an incoming webhook for the channel"), because those products' menus change. The accepted hosts are exact.
6. **Usage**: "Questions" counts only client roles. The Portfolio budget tip (batch A) and the Usage "Share" tip use the same 80% and 100% thresholds.
7. **Not covered**: the Runbook page has no empty state of its own (the shared editor shows "No plays yet." / "No rules yet."); the Branding preview has no tip.
