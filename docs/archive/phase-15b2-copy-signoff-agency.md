# phase-15b2 - agency help copy for owner sign-off (batch A)

**Status: draft for owner sign-off (Task 7, 2026-10-20). Agency batch A is complete.** Pages: Portfolio, Add a client, Approvals, Review a brief, Alert review, Prospects, Add a prospect, Prospect, Leads. Task 8 adds the remaining agency pages and finalises this document.

- **Audience**: every page here is reachable by agency roles only (client roles get a "not found" page), so all copy and all nine guides are `agency`. Agency copy may name seats, the review queue, limits and costs where they are true. It never names operator-only things (platform costs or margins, verifier thresholds, Jev, other agencies) and never names Rival Monday.
- **Placeholders**: short copy uses `{assistant}` (the agency's assistant name); guides use `{{assistant}}`. No agency guide uses `{{product}}`; the lead-pool wording says "the platform" because the lead card itself says "From the platform".
- **Sources**: short copy cites the code beside each string in `apps/web/src/help/copy/agency.ts`; the "Source" column repeats it. Guide numbers are listed in "Numbers in the batch A guides and tips".
- **Wiring**: each page passes `helpKey` + `guide={guides.has(KEY)}` to `PageHeader` (guides read once with `helpGuides(ctx, 'agency')`) and renders `PAGE_COPY['agency.<page>'].description` through `HelpText`.

## Owner checklist (agency batch A)

Review the copy below page by page, then spot-check it in the app as an agency admin. About 15 minutes.

1. On each of the nine pages the sentence under the title reads naturally and says what the page is for.
2. Click **Guide** on each page: three parts (What this page tells you, How to use it, Common questions), written for agency staff.
3. Click each **?**: the tip is short and plain. Check the Portfolio **Competitive pressure** tip against a real row (High pressure (70 and above), Medium pressure (40 to 69), Low pressure (1 to 39), Quiet (0)).
4. Empty states: a new agency's Portfolio ("No clients yet" with **Add client**), Approvals, Alert review, Prospects and each Leads tab each say what the place is for and the next step.
5. Sign in as an account manager scoped to some clients: **Add a client**, **Add a prospect** and **Leads** give a "not found" page; Portfolio shows the "Ask an agency admin" empty state.
6. In white-label, with the agency's own display name set: no page, tip or guide says Rival Monday, and the assistant carries the agency's chosen name.

**Decide** (see "Notes for the owner"): the "Business type" renaming of the form labels, the Approvals/Alert review description wording, and the 3 to 5 competitors sentence that was removed from Add a client.

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
