# phase-15b2 - platform and account help copy for owner sign-off (Tasks 9a and 9b)

**Status: final for owner sign-off, 2026-10-21.** Part 1 is Task 9a: sixteen operator-only platform pages (Overview, Agencies, an agency, Billing & plans, Lead pool, Model reviews, Topic proposals, Ask reviews, an Ask conversation, Knowledge, New article, an article, Health, Costs, Business types, Runbook; `/platform/help` is exempt). Part 2 is Task 9b: three account pages (Inbox, Notification settings, the agency setup wizard; `kb.detail` is exempt). Each row lists the string, who sees it and the code it comes from.

## Owner checklist (start here)

Three sign-ins cover everything. About 45 minutes in total.

**Operator (platform owner)**
1. Work through "Owner checklist (platform)" further down (16 pages, about 20 minutes).
2. Account pages: sign in as an operator who also has an agency membership. Inbox and Notification settings show the agency version of the Guide and tips (operators have no separate account guides). A member-less operator never reaches them.

**Agency (agency admin; then an account manager)**
1. **Inbox**: the sentence under the title says "latest 100 ... newest first". The three **?** tips read right (Unread and read, What the labels mean, What arrives). The labels tip lists Client alerts (agency), Brief ready for review, Brief failed, Brief overdue, Rank scan skipped, the three setup notices and Quarterly report. On a fresh account the empty state says "Nothing here yet" and points to Notification settings. **Guide** opens the agency version.
2. **Notification settings** (account menu): tips In-app and email, Quiet hours, Time zone, Agency notices. Confirm the claims against what you see: switches save at once, quiet hours need both times, emails are held until the window ends, a blank time zone means US Central time.
3. **Setup wizard**: sign in as a brand-new agency admin. Each of the four steps has its own **About this step** tip plus **Skipping a step**; **Guide** opens the wizard guide. Skip a step and check it stays on the Getting started card on the Portfolio. As an account manager, `/onboarding` must be "not found".

**Client (client owner; then a client viewer; then a guest via an emailed link)**
1. **Inbox**: **What the labels mean** lists only Instant alerts, Alert digest, Weekly brief and Quarterly report. Nothing mentions agency notices, cost caps, Slack, account managers or Agency settings. **Guide** opens the client version.
2. **Notification settings**: the tips are In-app and email, Quiet hours, Time zone (says "the time zone saved for your business", never US Central) and Notices about your business. The guide says a few messages, such as an invitation, have no switch.
3. A guest (emailed link) can open the Inbox and sees the Guide; Notification settings is "not found" for a guest.
4. Help page "Your account" group: an agency admin lists three guides (Inbox, Notification settings, Set up your agency); a client owner lists two.

### Decisions for the owner (account)

| # | Decision | Where | Current state |
|---|---|---|---|
| A1 | **Quiet hours wording (changed).** The page hint read "No notifications by email in this window (in-app still arrive)." but the code holds those emails and sends them when the window ends (`outbox.ts:notify`, `notBefore`). The hint now reads "Emails in this window are held and sent when it ends (in-app notices still arrive at once)." (`contact-form.tsx`); tip and guides say the same. | Notification settings | Changed in Task 9b fix round 1. |
| A2 | **"Business time zone" for agency staff means US Central.** The option label is shared with client contacts (where it is the business's zone); for an agency contact the code falls back to America/Chicago. The tip and guide say so; the option label is unchanged. | Notification settings | Stated in copy. |
| A3 | **Empty states replaced one-liners**: "Nothing here yet. Alerts, briefs and reports you receive also appear here." became a titled state "Nothing here yet" with a next step; "You have no notification settings yet." became "No notification settings yet" with an explanation. | Inbox, Notification settings | Changed. |
| A4 | **Wizard plan tip states no trial numbers.** The plan step already shows its own trial note (1 client weekly, 3 daily with a card); the tip points to that note rather than repeating the numbers, so the two cannot drift. | Setup wizard | As described. |
| A5 | **Setup notices** (Competitor suggestions ready, Client updated their setup, Setup waiting on you) are explained in one line each, from `apps/worker/src/jobs/setup.ts`; their email text there is still marked "owner sign-off pending" in the worker. | Inbox and Notification settings, agency | Help copy added; worker copy not touched. |
| A6 | **Client guides never mention agency notices, cost caps, Slack/Teams, account managers or Agency settings.** The seed test enforces it. | Client guides | As described. |

## Platform notes (Task 9a)

- **Audience**: platform pages are reachable by platform operators only (`requireOperatorContext`; anyone else gets "not found"). Every guide is `operator` (one per page, no `all` or agency version); client roles and agency roles never receive one (tested in `packages/tools/src/kb/help-content.test.ts`). An operator reads `all`, `agency` and `operator` help (`visibleAudiences`), so every short-copy tip and empty state here is `audience: operator` or unset and renders for operators only.
- **Product name**: operator copy may name the product. The shared copy test (`help/copy/copy.test.ts`) forbids the literal name in any short copy, so the tips and descriptions here do not name it; guides use `{{product}}` (the seed lint forbids the literal name in platform guides). The only guide that names it is Costs.
- **Terminology**: the page at `/platform/themes` is titled Topic proposals. Its help key stays `page:platform.themes`; no user-facing text says "theme".
- **Placeholders**: short copy uses none on these pages; guides use `{{product}}` (Costs) and `{{assistant}}` (New article).
- **Sources**: short copy cites the code beside each string in `apps/web/src/help/copy/platform.ts`; the "Source" column repeats it. Every number is in "Numbers in the platform guides and tips".
- **Wiring**: each page reads `helpGuides(ctx, 'platform')` once (the scope `PageGuide` derives for `/platform/**`, `helpScopeOf`), passes `helpKey` + `guide={guides.has(KEY)}` to `PageHeader` and renders `PAGE_COPY['platform.<page>'].description` through `HelpText`. Tips sit in a `TipRow` under the header, or as siblings of section headings on Billing & plans and Costs (never inside a heading, so heading names and `getByText` locators stay as they were).

## Owner checklist (platform)

Sign in as a platform owner. About 20 minutes.

1. On each of the 16 pages the sentence under the title says what the page is for, and **Guide** opens a guide with the three standard parts.
2. **Overview**: click the four **?** under the title. Check **Last 28 days** against a real tile: the big number is today, the pill is the change since 28 days ago.
3. **Agencies**: read **Health** against a real row (At risk / Idle / Growing / Steady, 28 and 14 day rules) and **Billing states** (7 days to Paused, 30 more to Suspended).
4. **An agency**: read **About support sessions** (60 minutes, read-only, reason 5 to 300 characters, audited) and open View as agency once to confirm.
5. **Billing & plans**: read **Restricting a code to agencies** (UUID entry: agency ids from the page address, up to 100) and **Agency invite links** (1 to 1,000 uses, 1 to 90 days, 14 by default, shown once).
6. **Model reviews**: confirm the Jev, language model, person cascade and the 0.85 threshold are what you want operators told.
7. **Topic proposals**: confirm 20 reviews, 90 days and "a fifth" match how you think of proposals.
8. **Ask reviews**: confirm "opening a conversation is recorded in the agency's audit log" is the message you want.
9. **Knowledge** and the article pages: confirm "Managed in repo" (seeded articles are read-only, change the Markdown in the repo and seed again).
10. **Costs** (owners): read **Service status**, **Low balance warnings** and **Projected this month**; check the page description no longer names the product (see decision 1).
11. **Business types** and **Runbook**: read the approve/merge and updates tips.
12. **Health** is a stub; check the "Not available yet" text.
13. Empty states: Overview activity, Agencies, an agency's clients, Lead pool (two), Model reviews, Topic proposals, Ask reviews, Knowledge, Costs (manual costs, AI) and Business types (two) each say what the place is for.

### Decisions for the owner

| # | Decision | Where | Current state |
|---|---|---|---|
| 1 | **Costs description no longer names the product.** "What it costs to run Rival Monday. API balances refresh daily at 06:00 UTC." became "What it costs to run the platform: vendor balances, monthly spend and manual costs. API balances refresh daily at 06:00 UTC." The shared copy test forbids the product name in short copy. | Costs | Changed; owner may revert by relaxing the copy test for `platform.*` keys. The Costs test (`costs/page.test.tsx`) was updated. |
| 2 | **Verifier threshold advice.** The Model reviews guide says the project rule is to leave the verifier threshold at 0.85 until enough of these answers have been collected. This is a project decision (CLAUDE.md), not something the code enforces. | Model reviews guide | Kept as written. |
| 3 | **Terminology test now ignores the `help_key:` front-matter line** of guides (`terminology.test.ts`). The key `page:platform.themes` stays by ruling. | Topic proposals | Changed. |
| 4 | Empty states replaced the old one-line paragraphs ("No agencies yet.", "The pool is empty.", "Nothing waiting for review.", "No proposals waiting.", "No threads to review.", "No articles yet.", "Nothing to review." x2, "No activity yet.", "No manual costs yet.", "No AI calls with a business type in the last 30 days.", "No clients yet."). Titles lost their full stop and gained a one-sentence next step. "No threads to review." became "No conversations to review". | Several | Changed. |
| 5 | **Health** shows an empty-state card ("Not available yet") under its existing description, so the stub teaches where to look instead. | Health | New. |

# Batch: platform (16 pages)

## Short copy (descriptions, tips, empty states)

### platform.overview

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | How the platform is doing: agencies, active clients, seats, weekly active users and this month's spend, with charts for the last 12 weeks or 12 months and the latest activity. | apps/web/src/app/(platform)/platform/page.tsx (five tiles, charts, activity); packages/tools/src/platform/series.ts:BUCKETS (12) |
| Tip `figures` | operator | **What the five figures count**: Agencies: every agency on the platform. Active clients: clients with status active that are not paused. Seats: the people with an agency role plus the people with a client role. Weekly active users: people who used the app in the last 7 days, today included. Spend this month: AI and data cost recorded against an agency since the 1st of the month (UTC); cost not tied to one agency is not in it. | packages/tools/src/tools/platform-console.ts:liveAgencies (active = status active and not paused; seats = distinct people per role group; wau = session activity since today minus 6 days 00:00 UTC; spend = llm_call + vendor_call recorded against the agency since the UTC month start) |
| Tip `last28` | operator | **Last 28 days**: Each big number is today's live figure. The small pill beside it is the change since 28 days ago, taken from the daily figures stored then. No pill means no change, or nothing was recorded 28 days ago. For Spend this month the pill compares the month so far with the month-to-date total as it stood 28 days ago. |  |
| Tip `range` | operator | **12 weeks or 12 months**: The toggle changes the charts, not the figures above them. 12 weeks shows one point per week (weeks start on Monday); 12 months shows one point per month. A gap in a line means nothing was recorded for that period. | apps/web/src/app/(platform)/platform/_components/range-toggle.tsx:OPTIONS; packages/tools/src/platform/series.ts:BUCKETS (12), weekStart (Monday), bucketStarts (the last bucket holds yesterday) |
| Tip `activity` | operator | **What the activity list shows**: Newest first, 20 at a time (Show more loads the next 20). It lists an agency signing up, adding or activating a client, sending its first brief, becoming at risk, and a support session being opened on it. | packages/tools/src/tools/platform-console.ts:ACTIVITY_KINDS; apps/web/src/app/(platform)/platform/page.tsx (limit 20); platform/actions.ts:loadMoreActivity (limit 20) |
| Empty `activity` | operator | **No activity yet**: Events appear here as agencies sign up, add and activate clients, send a first brief, become at risk or have a support session opened. | teaching empty state (no figures) |

### platform.agencies

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Every agency with its live figures, health flag and billing state. Click a column heading to sort, or an agency name for its detail. |  |
| Tip `health` | operator | **Health**: The first rule that matches wins. At risk: the agency is at least 28 days old and nobody on its agency team has been active in the app for 14 days (or ever), or it has fewer active clients than 28 days ago. Idle: at least 14 days old, has an active client and has sent no brief in the last 14 days. Growing: at least 28 days old with more active clients than 28 days ago. Steady: anything else, including every agency under 14 days old. The 28-day comparison is skipped when no figures were stored for that day. | packages/tools/src/platform/health.ts:healthFlag (first match wins at_risk, idle, growing, steady; mature = 28 days old; quiet = no activity for 14 days or never); packages/tools/src/tools/platform-console.ts:liveAgencies (lastSignIn = latest session of an agency-role member; lastBriefSentAt = newest sent brief) |
| Tip `columns` | operator | **Reading the columns**: Active clients are active and not paused. Prospects are clients not yet active. Seats are people with an agency role plus people with a client role. WAU is people active in the last 7 days. Last activity is the latest activity by anyone in the agency, client users included; a dash means none yet. Spend this month is AI and data cost recorded against the agency since the 1st (UTC). Click a heading to sort: Agency and Health start A to Z (at risk first), the others start with the highest or newest. | apps/web/src/app/(platform)/platform/agencies/agency-table.tsx:COLUMNS, defaultDir; packages/tools/src/tools/platform-console.ts:liveAgencies (clients_active, clients_prospect, agency_seats + client_seats, wau, last_activity_at, spend) |
| Tip `billing` | operator | **Billing states**: Pilot: on a free pilot. Trial: on its trial. Active: paying. Past due: a payment failed, or a trial or subscription ended unpaid. Paused: the agency has been read-only since it was 7 days past due. Suspended: 30 days after Paused begins. Cancelled: the subscription ended. | apps/web/src/app/(platform)/platform/_components/billing-state-pill.tsx:BILLING_STATE_LABEL; packages/billing/src/state.ts:PAST_DUE_TO_READ_ONLY_DAYS (7), READ_ONLY_TO_SUSPENDED_DAYS (30) |
| Empty `none` | operator | **No agencies yet**: Agencies appear here when they sign up, either through open sign-up or an invite link from Billing & plans. | teaching empty state (no figures) |

### platform.agencies.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | One agency: how it is doing, its team and clients, its billing and its recent support sessions. |  |
| Tip `support` | operator | **About support sessions**: View as agency opens a support session on this agency. It lasts 60 minutes, is read-only, and needs a reason of 5 to 300 characters that the agency can read. Only platform owners and staff can start one. Every session is recorded in the agency's audit log and listed under Support sessions below. | packages/tools/src/platform/support.ts:SUPPORT_SESSION_MINUTES (60); packages/tools/src/tools/support.ts:startSupportSession (reason 5 to 300 characters, owners and staff, recorded in the agency audit log via withPlatformAudit); apps/web/src/app/(platform)/platform/agencies/[id]/support-dialog.tsx |
| Tip `team` | operator | **Team counts**: The number of different people in this agency in each role: agency admins, account managers, client owners and client viewers. | packages/tools/src/tools/platform-console.ts:getPlatformAgency (team = distinct people per role) |
| Tip `billingPanel` | operator | **The billing panel**: Shows the agency's billing state, plan and version, its trial and pilot end dates, how many seats Stripe has been told about ("sync pending" means an update is queued) and whether the agency is exempt from the pilot client limit. Owners and staff can grant or end a pilot, extend a trial and attach a discount code; only owners can lift the pilot client limit. Viewers read only. | apps/web/src/app/(platform)/platform/agencies/[id]/billing-panel.tsx:BillingPanel (staff controls, owner-only cap switch); packages/billing/src/access.ts:decide (pilot cap) |
| Empty `noClients` | operator | **No clients yet**: Clients appear here once the agency adds them. | teaching empty state (no figures) |

### platform.billing

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Revenue and plans: MRR, paid seats, agencies by billing state, sign-up controls, plan versions, discount codes, Stripe Connect and agency invite links. |  |
| Tip `money` | operator | **MRR and paid seats**: Monthly recurring revenue and the number of paid seats, summed over all agencies from the latest daily stats, so they can be up to a day behind. | packages/tools/src/tools/platform-billing.ts:getBillingOverviewTool (sums the newest agency_daily_stat day) |
| Tip `signup` | operator | **Open sign-up**: When open sign-up is paused, new agencies cannot sign themselves up; invite links keep working. Only owners can change it. The funnel counts agencies that reached each step in the last 30 or 90 days: signed up, finished their profile, added a first client, added a card, split by open sign-up and invite link. | apps/web/src/app/(platform)/platform/billing/signups-panel.tsx (paused switch, 30/90 day funnel); packages/tools/src/tools/platform-billing.ts:setSignupsPausedTool (owners) |
| Tip `plans` | operator | **Plan versions**: Each row is one version of the plan. Publishing a new version makes it current for new subscriptions; existing subscriptions keep their prices. Trial days is the length of a new trial. Only owners can publish a version. | apps/web/src/app/(platform)/platform/billing/plan-editor.tsx; billing/actions.ts:createPlanVersionAction |
| Tip `codes` | operator | **Discount codes**: A code takes a percentage or a dollar amount off the base price, the seats or both, for the first invoice, for 1 to 36 months, or forever. It can have an expiry date and a maximum number of uses. Only owners can create or revoke a code. | packages/tools/src/tools/platform-billing.ts:createDiscountCodeTool (percent or dollars off; base, seats or both; once, 1 to 36 months or forever; owners) |
| Tip `restrict` | operator | **Restricting a code to agencies**: To limit a code to certain agencies, paste their agency ids (UUIDs) into the box, separated by commas or spaces, up to 100. An agency's id is the long code at the end of its page address, /platform/agencies/<id>. Every id must belong to an existing agency or the code is refused. A restricted code has no promotion code, so agencies cannot type it at checkout: attach it from the agency's page instead. It cannot go on an invite link. | packages/tools/src/tools/platform-billing.ts:createDiscountCodeTool (restrictedAgencyIds: uuid array, max 100, every id must exist), createInviteLinkTool (a restricted code cannot go on an invite link); billing/codes.tsx footnote; billing/actions.ts:createDiscountCodeAction (split on commas, spaces, semicolons) |
| Tip `connect` | operator | **Stripe Connect fees**: Agencies bill their own clients through their own Stripe account. The default fee is the percentage the platform takes from those payments; an agency can have its own override, and a blank override goes back to the default. 0 sends no fee. A change applies to Checkout links created afterwards; existing subscriptions keep the fee they started with. Only owners can change fees. | apps/web/src/app/(platform)/platform/billing/connect-panel.tsx (default fee, per-agency override, "0 sends no fee", new Checkout links only) |
| Tip `links` | operator | **Agency invite links**: An invite link lets an agency sign up on a pilot or a trial. Max uses is 1 to 1,000. The link expires in 1 to 90 days (14 if you leave it blank). A pilot link needs a pilot end date after the day the link expires. The full link is shown once, right after you create it, and cannot be retrieved later. Lock to email limits it to one address, and you can email it from here. Owners and staff only. | packages/tools/src/tools/platform-billing.ts:createInviteLinkTool (maxUses 1 to 1000, expiresInDays 1 to 90 default 14, pilot needs pilotEndsAt, staff); packages/core/src/invite-offer.ts:pilotLinkRefusal (pilot must end after the link expires); billing/invite-links.tsx (shown once) |

### platform.leads

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Verified requests from the platform page that no agency holds yet. Assign one to an agency; it is notified by email. | apps/web/src/app/(platform)/platform/leads/page.tsx (the page's existing description) |
| Tip `pool` | operator | **What is in the pool**: Requests from the platform's own page whose email address is verified and that no agency holds. The list shows the newest 200. A lead stays here until an agency is given it. | packages/tools/src/tools/platform-leads.ts:listPoolLeadsTool (status verified, no agency, newest 200); apps/web/.../leads/page.tsx |
| Tip `giving` | operator | **Giving a lead to an agency**: Choose an agency and press Assign. Each agency in the list shows its active business types and active client count, so you can match the lead. The agency is emailed and the lead leaves the pool. Only owners and staff can do this, and an agency that already holds the same visitor and business is refused. | packages/tools/src/tools/platform-leads.ts:assignLeadTool (staff; agency notified by email; refuses an agency that already holds the same visitor and business); leads/assign-form.tsx:agencyOptionLabel |
| Tip `declined` | operator | **Returned leads**: A lead marked "Declined by an agency" was given to an agency that sent it back. It is in the pool again and can go to a different agency. | packages/tools/src/tools/platform-leads.ts:listPoolLeadsTool (declinedBack = decided_at set; assignLeadTool clears it) |
| Empty `pool` | operator | **The pool is empty**: Verified requests from the platform page appear here until an agency is given them. | teaching empty state (no figures) |
| Empty `assigned` | operator | **Nothing assigned yet**: The 20 most recent assignments appear here. | teaching empty state (no figures) |

### platform.reviews

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Decisions the models weren’t sure about. Your answer fixes the event and becomes a gold label. | apps/web/src/app/(platform)/platform/reviews/page.tsx (the page's existing description) |
| Tip `why` | operator | **Why a decision is here**: Competitor changes are classified by a cascade. Jev answers first; any answer under 0.85 confidence goes to a language model; if that answer is also under 0.85, the question lands here for a person. The brief verifier uses the same 0.85 threshold. | packages/ai/config/ai.yaml (tag_decisions etc.: provider jev, escalate_to llm_decisions, min_confidence 0.85; verifier_decisions 0.85); packages/ai/src/decisions/cascade.ts (Jev first, low answers escalate, still-low keys need review) |
| Tip `answer` | operator | **Answering a review**: Each card shows the text before and after a competitor change, with one or more questions. "Model said" is the model's answer and its confidence; yours replaces it. Your answers fix the event and are stored as gold labels for measuring the models. The queue is oldest first, up to 50 at a time. | apps/web/src/app/(platform)/platform/reviews/review-queue.tsx ("Model said", confidence %); packages/engine/src/model-ops/resolve.ts:resolveDecisionReview (updates the event, writes decision_label rows); packages/tools/src/tools/model-ops.ts:listDecisionReviews (oldest first, 50) |
| Empty `queue` | operator | **Nothing waiting for review**: When the models cannot settle a decision with enough confidence, it appears here for you to answer. | teaching empty state (no figures) |

### platform.themes

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | New review topics found in reviews that didn’t fit any existing topic. Approved topics are asked for every review analysed from now on. | apps/web/src/app/(platform)/platform/themes/page.tsx (the page's existing description) |
| Tip `source` | operator | **Where proposals come from**: Each night, for every business type, reviews that matched no topic are collected. With at least 20 of them from the last 90 days since the last proposal, a model looks for one recurring topic that at least a fifth of them share, and proposes it. A business type has one open proposal at a time. "N reviews with no topic" is how many it looked at. | packages/engine/src/reviews/discovery.ts:THEME_DISCOVERY_MIN_OTHER (20), THEME_DISCOVERY_DAYS (90), SYSTEM prompt (at least a fifth of the reviews share it), runReviewInsights (nightly); one pending proposal per business type |
| Tip `decide` | operator | **Approving or rejecting**: Approve a topic and it is asked for every review analysed from now on in that business type. Reject it and it is not proposed again. A decision cannot be undone from this page, and a proposal someone else already decided shows an error. | packages/engine/src/reviews/discovery.ts:decideThemeProposal (approved topics are asked for reviews analysed from now on), prepareThemeDiscovery (rejected ids are never proposed again) |
| Tip `decided` | operator | **Recently decided**: The table lists proposals approved or rejected in the last 30 days, with the business type, the decision and the date. | packages/tools/src/tools/themes.ts:DECIDED_WINDOW_DAYS (30) |
| Empty `queue` | operator | **No proposals waiting**: When enough reviews fit none of a business type's topics, a proposed new topic appears here for you to approve or reject. | teaching empty state (no figures) |

### platform.ask

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Conversations from clients that allow review. Opening one is recorded in the audit log. | apps/web/src/app/(platform)/platform/ask/page.tsx (the page's existing description) |
| Tip `allowed` | operator | **Which conversations appear**: Only conversations of clients whose profile allows platform review. A client that has not allowed it never appears here, and its threads cannot be opened by id either. The list is newest first, 25 at a time. | packages/tools/src/platform.ts:listReviewableAskThreads (client.ask_review_allowed); apps/web/src/app/(app)/c/[clientId]/settings/profile/client-features-form.tsx |
| Tip `audit` | operator | **Opening a conversation is recorded**: Every time you open a conversation, a row is written to the agency's audit log with your name and the time. Listing them is not recorded; opening is. | packages/tools/src/platform.ts:getReviewableAskThread (one audit_log row per view, tool platform_view_ask_thread, in the agency's audit trail) |
| Tip `flags` | operator | **The small badges**: N removed: sentences the answer check removed from replies. error: a reply failed. refused: the assistant declined a question. quota: the client ran out of its question allowance. | packages/tools/src/platform.ts:listReviewableAskThreads (removed = sum of trace.removedSentences; error, refused, quota = a message with that status) |
| Empty `none` | operator | **No conversations to review**: Conversations appear here once a client that allows review has asked the assistant a question. | teaching empty state (no figures) |

### platform.ask.thread

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | A read-only copy of one conversation, as text only. Opening it was recorded in the audit log. |  |
| Tip `trace` | operator | **Citations and trace**: Citations lists what a reply relied on; a kb: citation links to its knowledge article. Trace, where a message has one, is the assistant's own log of how it answered, and an action block is the raw detail of an action message. Both are shown as plain text. | apps/web/src/app/(platform)/platform/ask/[threadId]/page.tsx (kb: citations link to the knowledge article; trace and action are raw JSON) |
| Tip `status` | operator | **Message status**: Each message shows its role (user, assistant or action) and a status: ok, quota (the question allowance was used up), refused, error or cancelled. | packages/tools/src/platform.ts:ReviewableAskMessage (role user, assistant, action; status ok, quota, refused, error, cancelled) |

### platform.knowledge

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Articles the Ask assistant can search and cite, at platform, agency and client level. | apps/web/src/app/(platform)/platform/knowledge/page.tsx (the page's existing description) |
| Tip `levels` | operator | **Levels and kinds**: Level says who the article belongs to: Help (platform) for everyone, Agency for one agency, Client for one client. Kind is its type: help article, playbook, Q&A, blog post or fact. Use the filters to narrow the list. | apps/web/src/app/(platform)/platform/knowledge/scope-fields.tsx:LEVEL_OPTION, KIND_OPTION |
| Tip `status` | operator | **Draft or published**: Only Published articles can be found and cited by the assistant. A Draft stays out of search until it is published. | packages/tools/src/tools/help.ts:guideRows (status published); apps/web/.../knowledge/page.tsx (Draft, Published badges) |
| Tip `repo` | operator | **Managed in repo**: Articles badged "Managed in repo" are the page guides and glossary terms seeded from the repository by kb:seed. They are read-only here: change the Markdown in the repo and seed again. | apps/web/src/app/(platform)/platform/knowledge/editor.tsx (source seed: "Managed in repo", read-only); packages/tools/src/kb/seed.ts (docs/help and the glossary are seeded by kb:seed) |
| Tip `sync` | operator | **URL articles and auto-sync**: An article imported from a web address (when URL import is switched on) can sync itself: it is re-read every Sunday at 05:00 UTC and updated if the page changed. The badge shows the last sync, "changed" when the text changed, or the reason a sync failed. | apps/worker/src/jobs/kb.ts (kb-sync cron '0 5 * * 0'); apps/web/.../knowledge/sync-badge.tsx; knowledge/page.tsx (import panel only when kbImport is on) |
| Empty `none` | operator | **No articles yet**: Write one with New article, or import one from a web address. Published articles can be found and cited by the assistant. | teaching empty state (no figures) |

### platform.knowledge.new

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Write an article the Ask assistant can search and cite. Pick who it belongs to, write it in Markdown, then keep it as a draft or publish it. |  |
| Tip `editor` | operator | **Writing an article**: Choose the level (and the agency or client it belongs to), the kind, a title and the Markdown body. The Preview tab shows how it reads. Save draft keeps it out of search; Publish makes it findable by the assistant. | apps/web/src/app/(platform)/platform/knowledge/editor.tsx (Write and Preview tabs, Save draft, Publish); scope-fields.tsx |
| Tip `visibility` | operator | **Who can read it**: For an agency-level article, "Visible to client users" decides whether that agency's clients can read it as well as its staff. It is on by default. Platform and client-level articles do not show the option. | apps/web/src/app/(platform)/platform/knowledge/editor.tsx (clientVisible checkbox, agency level only, default on) |

### platform.knowledge.detail

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Read or edit one article. Publish saves a change to a published article and queues it for the assistant's search index; Save draft takes it out of search. |  |
| Tip `managed` | operator | **Managed in repo**: This article is seeded from the repository, so it is shown read-only. To change it, edit its Markdown in the repo and run kb:seed again. | apps/web/src/app/(platform)/platform/knowledge/editor.tsx (source seed shows only "Managed in repo" and the rendered article) |
| Tip `autosync` | operator | **Auto-sync**: With auto-sync on, the article is re-read from its web address every Sunday at 05:00 UTC and updated when the page changed; the text before the last change is kept under Previous version. A sync error is shown in red. Turning auto-sync off keeps the current text. | apps/worker/src/jobs/kb.ts (kb-sync cron '0 5 * * 0'); editor.tsx (Auto-sync switch, Previous version, sync error) |
| Tip `delete` | operator | **Deleting an article**: Delete removes the article and its search index and cannot be undone. To take an article out of search but keep it, unpublish it instead. | apps/web/src/app/(platform)/platform/knowledge/editor.tsx (delete confirmation: "Delete this article and its search index? This cannot be undone.") |

### platform.health

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Platform health arrives with the deployment phase. | apps/web/src/app/(platform)/platform/health/page.tsx (the page's existing description; the page has no content yet) |
| Empty `placeholder` | operator | **Not available yet**: Nothing is measured here yet. Until it is built, see Agencies for each agency's health flag and, for platform owners, Costs for vendor balances. | teaching empty state (no figures) |

### platform.costs

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | What it costs to run the platform: vendor balances, monthly spend and manual costs. API balances refresh daily at 06:00 UTC. | apps/worker/src/jobs/platform-costs.ts (daily snapshot cron '0 6 * * *', UTC); the old wording named the product, which the shared copy test forbids |
| Tip `services` | operator | **Service status**: OK: enough left. Low: the balance is under its low-balance threshold, or the days left are at or under the warning window (7 days unless you changed it). Error: the last reading failed. Unavailable on this plan: the vendor does not report this figure. Not configured: no reading yet. Off: tracking is switched off. Days left comes from how fast the balance fell over the last 14 days; with fewer than two readings it is blank. | packages/tools/src/platform/costs/math.ts:serviceStatus (low = remaining under the threshold, or days left at or under warn days), burnRate (balance drops over the last 14 days, needs two readings at least 12 hours apart); packages/tools/src/tools/platform-costs.ts (warnDays default 7); apps/web/.../costs/_components/services-table.tsx:STATUS_LABEL |
| Tip `low` | operator | **Low balance warnings**: When a service turns Low, platform owners are emailed once; the email is sent again only after the service has been OK and turned Low again. While any service is Low, owners also see a strip at the top of every platform page. The Warnings card counts the Low services. | packages/tools/src/platform/costs/alerts.ts (one email to the owners when a service turns low; alertedAt cleared when it is OK again); apps/web/src/app/(platform)/layout.tsx (warning strip for owners) |
| Tip `projected` | operator | **Projected this month**: API spend so far this month divided by the days elapsed, times the days in the month, plus the manual costs for the month. It is a straight-line guess and moves a lot early in the month. | packages/tools/src/tools/platform-costs.ts (projectedMonthUsd = API spend so far / days elapsed x days in the month + manual costs) |
| Tip `monthly` | operator | **Monthly spend chart**: The last six months, API usage and manual costs stacked. It is approximate: for balance services the spend is the sum of the drops between daily readings (top-ups are ignored), and a month with fewer than two readings counts as zero. Usage services use their last reading of the month. | packages/tools/src/tools/platform-costs.ts:MONTHS (6); packages/tools/src/platform/costs/math.ts:monthlySpend (balance services = sum of balance drops between readings; usage services = the last reading in the month); apps/web/.../costs/page.tsx caption |
| Tip `manual` | operator | **About manual costs**: Costs the vendors cannot report, such as hosting or a subscription. A monthly item counts every month, a yearly item counts one twelfth each month, and a one-off item counts in the month it starts. Archiving an item keeps it in past months' totals and stops it counting later. | packages/tools/src/platform/costs/math.ts:manualMonthly (recurring: yearly / 12; one-off: its own month; archiving ends a recurring item that month); apps/web/.../costs/_components/cost-items-table.tsx |
| Tip `ai` | operator | **About AI cost by business type**: AI calls and their cost over the last 30 days, grouped by the business type they were for. A business type that was merged is counted under the one it was merged into, and a draft not yet created shows as a draft. | packages/tools/src/tools/platform-costs.ts:aiByVertical (last 30 days, calls and cost per business type; merged and draft ids folded) |
| Empty `manual` | operator | **No manual costs yet**: Add costs the vendors cannot report, such as a hosting plan or a subscription, so the monthly totals are complete. | teaching empty state (no figures) |
| Empty `ai` | operator | **No AI calls yet**: AI calls tied to a business type in the last 30 days appear here with their cost. | teaching empty state (no figures) |

### platform.verticals

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | New business types and services agencies added. Approve what is right, fix what is not, or merge duplicates into an existing entry. | apps/web/src/app/(platform)/platform/verticals/page.tsx (the page's existing description) |
| Tip `queue` | operator | **What lands here**: Business types and services that agencies created while setting up a client and that nobody has reviewed yet, with who added them, how many clients use them and the evidence behind them. The number on the menu item counts both lists. | packages/tools/src/tools/platform-verticals.ts:listCatalogReviewTool, countCatalogReviewTool (unreviewed business types except generic, and unreviewed services of reviewed types; the menu badge) |
| Tip `approve` | operator | **Approving, renaming and editing**: Approve marks a business type reviewed, together with the services it came with, or a single service reviewed. Rename changes the name and keeps the id. Edit (business types only) changes the keywords, Google categories, review topics and services before you approve. A name cannot include a client's business name, phone number, email or web address. | packages/tools/src/tools/platform-verticals.ts:reviewVerticalTool (approve also approves the unreviewed services it came with; rename keeps the id), reviewBusinessAreaTool; verticals/catalog-queue.tsx (Edit) |
| Tip `merge` | operator | **Merging**: Merge into moves everything of the duplicate to the entry you pick: its clients, events, prices and agency settings. The old id keeps resolving to the target. For a business type you also say where each of its services goes; matching names are pre-filled and "Move" keeps a service as a new one. A service merges into another service of the same business type. | packages/tools/src/tools/platform-verticals.ts:mergeVerticalTool, mergeBusinessAreaTool (clients, events, prices, agency settings move; the old id keeps resolving); apps/web/.../verticals/page.tsx (default service mapping by normalised name); catalog-queue.tsx:MergeForm (Move) |
| Tip `roles` | operator | **Who can change things**: Platform owners and staff can approve, rename, edit and merge. Viewers can read the queue and the evidence but see no buttons. | apps/web/src/app/(platform)/platform/verticals/page.tsx (canEdit = owner or staff); packages/tools/src/tools/platform-verticals.ts (staff) |
| Empty `types` | operator | **Nothing to review**: When an agency creates a new business type, it appears here for you to approve, fix or merge. | teaching empty state (no figures) |
| Empty `services` | operator | **Nothing to review**: When an agency adds a service to a business type, it appears here for you to approve, rename or merge. | teaching empty state (no figures) |

### platform.runbook

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | The standard plays, starting-point rules and settings every agency starts from. Agencies see your changes as updates they can take or keep their own version. | apps/web/src/app/(platform)/platform/runbook/page.tsx (the page's existing description) |
| Tip `standard` | operator | **The standard runbook**: This is the runbook every agency starts from: plays (the recommendations a brief can suggest), starting-point rules and settings. Each agency gets its own copy, and each client can in turn get a copy of the agency's. | apps/web/src/components/runbook/runbook-editor.tsx (Plays, Starting-point rules, Settings); packages/tools/src/tools/runbooks.ts (platform level is the root every agency runbook copies) |
| Tip `updates` | operator | **How agencies get changes**: Changing an item here does not rewrite an agency's copy. The agency's item shows Update available, and its admins choose to use the update or keep their own version. An item you add shows as New, and one you remove shows as Removed upstream. | apps/web/src/components/runbook/item-card.tsx:UpdatePrompts (Update available, Use the update, Keep mine, New, Removed upstream) |
| Tip `edit` | operator | **Who can edit**: Platform owners and staff can edit the standard runbook. Viewers can read it. Nobody can edit in a read-only support session. | apps/web/src/app/(platform)/platform/runbook/page.tsx (canEdit = owner or staff); packages/tools/src/tools/runbooks.ts (write needs staff at platform level) |

## Numbers in the platform guides and tips

| Number | Where it is used | Source |
|---|---|---|
| 28 days (change pill) | Overview tip and guide, Agencies Health, agency page | `packages/tools/src/tools/platform-console.ts:tilesOf` (`addDays(utcDay(now), -28)`); `platform/health.ts:healthFlag` (`mature = ageDays >= 28`) |
| 7 days (weekly active users) | Overview, Agencies | `platform-console.ts:liveAgencies` (`weekStart = today - 6 days 00:00 UTC` to now) |
| 12 weeks / 12 months, Monday weeks | Overview range toggle | `packages/tools/src/platform/series.ts:BUCKETS` (12), `weekStart` (Monday); `_components/range-toggle.tsx:OPTIONS` |
| 20 per load (activity) | Overview | `platform/page.tsx` (`limit: 20`); `platform/actions.ts:loadMoreActivity` (`limit: 20`) |
| 14 days (quiet), 14 days (idle age) | Agencies Health | `platform/health.ts:healthFlag` (`quiet`: 14 days; idle needs `ageDays >= 14`) |
| 7 days to Paused, 30 more to Suspended | Agencies billing tip and guide, Billing guide | `packages/billing/src/state.ts:PAST_DUE_TO_READ_ONLY_DAYS` (7), `READ_ONLY_TO_SUSPENDED_DAYS` (30) |
| 60 minutes; reason 5 to 300 characters | Agency page tip and guide | `packages/tools/src/platform/support.ts:SUPPORT_SESSION_MINUTES` (60); `packages/tools/src/tools/support.ts:startSupportSession` (`reason ... 5 to 300 characters`); `support-dialog.tsx` |
| 100 agency ids | Billing restrict tip | `packages/tools/src/tools/platform-billing.ts:createDiscountCodeTool` (`restrictedAgencyIds ... .max(100)`) |
| 1 to 36 months | Billing codes tip and guide | `createDiscountCodeTool` (`durationMonths ... .min(1).max(36)`) |
| 1 to 1,000 uses; 1 to 90 days; 14 by default | Billing invite links tip and guide | `platform-billing.ts:createInviteLinkTool` (`maxUses .min(1).max(1000)`, `expiresInDays .min(1).max(90).default(14)`) |
| 30 or 90 days (funnel) | Billing sign-up tip and guide | `billing/signups-panel.tsx:parseDays` |
| 200 leads; 20 recent assignments | Lead pool tip and guide | `packages/tools/src/tools/platform-leads.ts:listPoolLeadsTool` (`.limit(200)`, `.limit(20)`) |
| 0.85 (Jev confidence; verifier) | Model reviews tip and guide | `packages/ai/config/ai.yaml` (`tag_decisions` ... `min_confidence: { default: 0.85 }`, `verifier_decisions` 0.85; `ask_interpretation_decisions` 0.2); `packages/ai/src/decisions/cascade.ts` |
| 50 reviews at a time | Model reviews tip and guide | `packages/tools/src/tools/model-ops.ts:listDecisionReviews` (`listOpenReviews(deps.service, 50)`) |
| 20 reviews, 90 days, a fifth, sample 40 | Topic proposals tip and guide | `packages/engine/src/reviews/discovery.ts:THEME_DISCOVERY_MIN_OTHER` (20), `THEME_DISCOVERY_DAYS` (90), `THEME_DISCOVERY_SAMPLE` (40), `SYSTEM` prompt ("at least a fifth") |
| 30 days (recently decided) | Topic proposals | `packages/tools/src/tools/themes.ts:DECIDED_WINDOW_DAYS` (30) |
| 25 conversations per page | Ask reviews | `platform/ask/page.tsx` (`limit: 25`) |
| Sunday 05:00 UTC (auto-sync) | Knowledge tips and guides | `apps/worker/src/jobs/kb.ts` (`kb-sync`, `cron: '0 5 * * 0'`) |
| hourly index sweep (up to an hour) | Knowledge guide | `apps/worker/src/jobs/kb.ts` (`kb-embed`, `cron: '15 * * * *'`) |
| 06:00 UTC (cost refresh) | Costs description and guide | `apps/worker/src/jobs/platform-costs.ts` (`cron: '0 6 * * *'`) |
| 14 days (burn rate); two readings | Costs Service status | `packages/tools/src/platform/costs/math.ts:burnRate` (14 days, at least two readings, span of at least half a day) |
| 7 days (default warning window) | Costs Service status | `packages/db/src/schema/platform-costs.ts` (`warnDays` default 7); `math.ts:serviceStatus` (`dl <= warnDays`) |
| six months; 30 days (AI by business type) | Costs | `packages/tools/src/tools/platform-costs.ts:MONTHS` (6), `aiByVertical` (`now - 30 days`) |
| Projected = so far / days elapsed x days in month + manual | Costs Projected tip | `platform-costs.ts` (`projectedMonthUsd`) |

## UI strings changed outside PAGE_COPY (platform batch)

| Page | Old | New | Why |
|---|---|---|---|
| Costs | Description named the product | "What it costs to run the platform: vendor balances, monthly spend and manual costs. API balances refresh daily at 06:00 UTC." | Short copy cannot name the product (decision 1) |
| Agency page | Description "Created <date>" | "<copy> Created <date>." | Description now comes from the copy file |
| Ask conversation | Description "<client> . <agency>" | "<client> . <agency>. <copy>" | Same |
| Billing & plans, Costs | Section headings stood alone | A `?` tip sits beside the heading (sibling of the `h2`, not inside it) | Keeps heading names unchanged for locators |

## Guides (full text)

### platform.agencies.detail.operator.md

```markdown
---
help_key: page:platform.agencies.detail
audience: operator
title: Agency
---
## What this page tells you

One agency in full: its health flag, four live figures, charts, team, clients, billing and recent support sessions. The subtitle shows when it was created.

- **Health** (next to the title) uses the same rules as the Agencies list.
- **The four figures** (active clients, seats, weekly active users, spend this month) are today's live values with a change since 28 days ago. The range toggle switches the charts between 12 weeks and 12 months.
- **Team** counts the different people in each role: agency admins, account managers, client owners and client viewers.
- **Clients** lists every client with its status and the date it was created.
- **Billing** shows the state, plan and version, trial and pilot end dates, how many seats Stripe has been told about ("sync pending" means an update is queued), the pilot client limit, the attached coupon id, recent invoices and the last five billing events.
- **Support sessions** lists the agency's recent sessions.

## How to use it

1. **Open a support session** with **View as agency** (platform owners and staff only). Enter a reason of 5 to 300 characters; the agency can read it. The session lasts 60 minutes and is read-only: every write is refused. It is recorded in the agency's audit log, and the agency can ask to be emailed when one opens.
2. **Adjust billing** if you are an owner or staff: grant a pilot (with an optional end date) or end one, extend a trial, attach a discount code. Only owners can lift or restore the pilot client limit. Viewers read only.
3. **Check the audit trail.** Opening this page is itself recorded in the agency's audit log under your platform role.

## Common questions

### What can I see in a support session?

The agency's pages as its admin would, read-only. Email addresses on the agency's Team page are partly hidden from support. Nothing can be changed.

### What is the pilot client limit?

Pilot agencies can only add clients up to a limit unless they are exempt. The billing panel shows whether this agency is exempt; owners can lift or restore the limit.

### Why can't I see View as agency?

Only platform owners and staff can start a support session.
```

### platform.agencies.operator.md

```markdown
---
help_key: page:platform.agencies
audience: operator
title: Agencies
---
## What this page tells you

Every agency on the platform, with live figures, a health flag and its billing state, one row each.

- **Active clients** are clients that are active and not paused. **Prospects** are clients that are not active yet.
- **Seats** are the people with an agency role plus the people with a client role.
- **WAU** is the number of people active in the last 7 days.
- **Last activity** is the latest activity by anyone in the agency, client users included. A dash means none yet.
- **Spend this month** is AI and data cost recorded against the agency since the 1st (UTC).
- **Billing** is the billing state: Pilot, Trial, Active, Past due, Paused, Suspended or Cancelled.

### The Health flag

The first rule that matches wins:

- **At risk**: the agency is at least 28 days old and nobody on its agency team has been active in the app for 14 days (or ever), or it has fewer active clients than 28 days ago.
- **Idle**: at least 14 days old, has an active client and has sent no brief in the last 14 days.
- **Growing**: at least 28 days old with more active clients than 28 days ago.
- **Steady**: anything else, including every agency under 14 days old.

The 28-day comparison is skipped when no figures were stored for that day. "Active in the app" for the At risk rule means the agency team (admins and account managers); Last activity counts everyone.

### Billing states

Past due means a payment failed, or a trial or subscription ended unpaid. An agency that stays 7 days past due becomes Paused (read-only); 30 days after that it becomes Suspended.

## How to use it

1. **Sort** by clicking a heading. Agency and Health start A to Z (At risk first); the other columns start with the highest or newest.
2. **Open an agency** by clicking its name to see its detail, billing and support sessions.
3. **Look at At risk and Idle first.** Check the agency's detail for the dates behind the flag before reaching out.

## Common questions

### Why is a new agency Steady?

Health looks at agencies that are at least 14 days old. Younger ones are always Steady.

### Why do Seats not match the Billing page's paid seats?

Seats here are people with an agency or client role. Paid seats on Billing & plans is a separate figure, taken from the daily stats.

### Where do agencies come from?

They sign up through open sign-up or an invite link. Both are managed on Billing & plans.
```

### platform.ask.operator.md

```markdown
---
help_key: page:platform.ask
audience: operator
title: Ask reviews
---
## What this page tells you

Assistant conversations from clients that allow platform review, newest first, 25 at a time. A client that has not allowed review never appears, and its conversations cannot be opened by id either (the setting is on the client's profile).

Each row shows the client, its agency, the start time (UTC) and small badges:

- **N removed**: sentences the answer check removed from replies.
- **error**: a reply failed.
- **refused**: the assistant declined a question.
- **quota**: the client used up its question allowance.

**Opening a conversation is recorded** in the agency's audit log, with your name and the time. Listing them is not recorded.

## How to use it

1. **Spot the odd ones** by their badges. A thread with many removed sentences is often a sign the answer check found unsupported claims.
2. **Open a thread** to read the whole conversation as plain text, including citations. This is recorded.
3. **Use Older threads** at the bottom to page back.

## Common questions

### Why can't I find a client's conversation?

The client has not allowed review, or you are looking at a different client.

### Is this editable?

No. It is read-only.

### Is my looking recorded?

Yes. Opening a conversation is written to the agency's audit log under your platform role.
```

### platform.ask.thread.operator.md

```markdown
---
help_key: page:platform.ask.thread
audience: operator
title: Ask conversation
---
## What this page tells you

One assistant conversation, read-only and as plain text. The subtitle names the client and its agency. Opening this page was recorded in the agency's audit log.

Each message shows its role (user, assistant or action) and its status: **ok**, **quota** (the question allowance was used up), **refused**, **error** or **cancelled**. Under a message you may see:

- **Citations**: what the reply relied on. A `kb:` citation links to its knowledge article.
- **An action block**: the raw detail of an action message.
- **Trace**: the assistant's own log of how it answered, behind a Trace toggle.

## How to use it

1. **Read the thread top to bottom.**
2. **Follow citations** to the articles the answer used; open the article in Knowledge to check it says what the answer says.
3. **Open Trace** only when you need to see how an answer was built.

## Common questions

### Can I reply or fix an answer?

No. This page only reads. Fix the knowledge article instead if the source was wrong.

### Why does the page say "not found"?

The conversation does not exist, or the client has not allowed review.
```

### platform.billing.operator.md

```markdown
---
help_key: page:platform.billing
audience: operator
title: Billing & plans
---
## What this page tells you

Revenue, plans and sign-up controls for the whole platform. Everyone with platform access can read it; owners change things, staff can create invite links, viewers read only.

- **MRR** and **Paid seats** are summed over all agencies from the latest daily stats, so they can be up to a day behind.
- **Agencies by state** counts agencies in each billing state: Pilot, Trial, Active, Past due, Paused, Suspended and Cancelled. Past due becomes Paused after 7 days, and Paused becomes Suspended 30 days later.
- **Agency sign-up** shows whether open sign-up is open or paused (invite links work either way) and a funnel for the last 30 or 90 days: sign-ups, profiles completed, first clients added and cards added, split by open sign-up and invite link.
- **Plans** lists every plan version. A new version becomes current for new subscriptions; existing subscriptions keep their prices. Trial days is the length of a new trial.
- **Discount codes** take a percentage or a dollar amount off the base price, the seats or both, for the first invoice, for 1 to 36 months, or forever, with an optional expiry date and maximum number of uses.
- **Stripe Connect** shows how many agencies have connected Stripe, their paying clients and client MRR, and the platform fee. An agency can have its own fee; leave it blank to use the default; 0 sends no fee. A change applies to Checkout links created afterwards.
- **Agency invite links** (owners and staff) lists links by their first characters only.

## How to use it

1. **Pause or resume open sign-up** (owners) when you need to stop new agencies signing up themselves.
2. **Publish a plan version** (owners) with a name, base price, included seats, extra seat price and trial days.
3. **Create a discount code** (owners). To limit it to certain agencies, paste their **agency ids** in the box, separated by commas or spaces, up to 100. An agency's id is the long code at the end of its page address, `/platform/agencies/<id>`. Every id must belong to an existing agency or the code is refused.
4. **Create an invite link** (owners and staff): choose Pilot or Trial, a pilot end date for pilots, an optional discount code, an optional email to lock it to (you can email it from here), max uses (1 to 1,000), expiry (1 to 90 days, 14 if blank) and a note. Copy the link straight away: it is shown once and cannot be retrieved later.
5. **Set Connect fees** (owners) for everyone or for one agency.

## Common questions

### Why can't a restricted code go on an invite link?

The agency created from a link does not exist yet, so a code limited to named agencies could never apply. A restricted code also has no promotion code, so agencies cannot type it at checkout; attach it from the agency's page (or the agency's Redeem form).

### Why must a pilot end after the link expires?

The pilot has to outlast the link. The form warns you before you submit: it asks for a later pilot end date or a shorter expiry.

### What does revoking do?

A revoked link or code can no longer be used.

### Why is MRR zero?

MRR comes from the newest daily stats row. On a fresh environment it stays zero until the nightly job has run.
```

### platform.costs.operator.md

```markdown
---
help_key: page:platform.costs
audience: operator
title: Costs
---
## What this page tells you

What it costs to run {{product}}: vendor balances, monthly spend and manual costs. Only platform owners can open it. Vendor balances refresh daily at 06:00 UTC; **Refresh now** queues a refresh, and the button shows Refreshing while one is queued.

- **Spent this month** is API spend so far plus manual costs for the month. **Projected this month** is API spend so far divided by the days elapsed, times the days in the month, plus manual costs; it moves a lot early in the month. **Warnings** counts the services that are Low.
- **Services** lists each vendor with a status: **OK**; **Low** (the balance is under its low-balance threshold, or the days left are at or under the warning window, 7 days unless changed); **Error** (the last reading failed); **Unavailable on this plan** (the vendor does not report this figure); **Not configured** (no reading yet); **Off** (tracking is switched off). Days left comes from how fast the balance fell over the last 14 days, and is blank with fewer than two readings.
- **Monthly spend** shows the last six months, API usage and manual costs stacked. It is approximate: for balance services the spend is the sum of drops between daily readings (top-ups are ignored), and a month with fewer than two readings counts as zero. Usage services use their last reading of the month.
- **AI by business type (last 30 days)** shows AI calls and cost per business type. A merged business type is counted under the one it was merged into.
- **Manual costs** are costs the vendors cannot report. A monthly item counts every month, a yearly item one twelfth a month, a one-off item in the month it starts. Archiving keeps past months' totals.

## How to use it

1. **Check Warnings.** When a service turns Low, owners are emailed once (again only after it recovers and turns Low again), and a strip shows at the top of every platform page.
2. **Edit a service** to set its billing link, low-balance threshold and warning window. Some services need a dollars-per-unit rate before they can warn. Usage services without a plan cap never warn.
3. **Add manual costs** with the dialog under Manual costs; Archive ends a recurring cost.
4. **Watch Projected this month** against what you expect to pay.

## Common questions

### Why does a service say Not configured?

The worker has not written a reading yet. Only the worker holds the vendor credentials.

### Why is days left blank?

There are fewer than two balance readings in the last 14 days, or the balance did not fall.

### Why don't these numbers match the Overview page?

Overview's spend is only cost recorded against an agency. This page is what the vendors charge the platform.
```

### platform.health.operator.md

```markdown
---
help_key: page:platform.health
audience: operator
title: Health
---
## What this page tells you

Nothing yet: platform health (jobs, queues, vendors) arrives with the deployment phase, and this page is a stub until then. It needs platform access to open, like every platform page.

What exists today instead:

- **Each agency's health flag** (At risk, Idle, Growing, Steady) on the Agencies page and on an agency's own page.
- **Vendor balances and warnings** on the Costs page, for platform owners.
- **Low-balance warnings** as a strip at the top of every platform page for owners.

## How to use it

1. **For agency health**, open Agencies and read the Health column. Its tip lists the rules.
2. **For vendor health**, open Costs (platform owners).
3. **Check back after the deployment phase** for job, queue and error views here.

## Common questions

### Why does Health show an empty page?

It is intentionally a stub. Nothing here is broken.

### Who can open it?

Platform owners, staff and viewers.
```

### platform.knowledge.detail.operator.md

```markdown
---
help_key: page:platform.knowledge.detail
audience: operator
title: Article
---
## What this page tells you

One article, open for reading or editing. The page title is the article's title.

- **A manual or URL article** shows the editor: title, level, kind, Markdown body with Preview, and Save draft, Publish and Unpublish buttons.
- **A Managed in repo article** (page guides and glossary terms seeded from the repository) shows a "Managed in repo" notice and the rendered article, read-only.
- **A URL article** also shows its source address, an **Auto-sync** switch, any sync error in red and, once it has changed, the **Previous version**.

## How to use it

1. **Edit and publish.** **Publish** saves your change to a published article, re-indexes it and queues it for the search index, so the assistant finds the new text shortly after. **Save draft** takes it out of search until you publish again.
2. **Turn auto-sync on or off** for a URL article. With it on, the page is re-read every Sunday at 05:00 UTC and the text updated if it changed. Turning it off keeps the current text.
3. **Unpublish** to take the article out of search but keep it.
4. **Delete** removes the article and its search index and cannot be undone; you are asked to confirm.

## Common questions

### Why is there no editor?

The article is Managed in repo. Change its Markdown in the repository and seed again.

### What is a sync error?

The page could not be fetched, or its site does not allow it. The message in red says which.
```

### platform.knowledge.new.operator.md

```markdown
---
help_key: page:platform.knowledge.new
audience: operator
title: New article
---
## What this page tells you

A form for writing an article the Ask assistant can search and cite.

- **Level** says who the article belongs to: Help (platform), Agency or Client. Agency and Client levels also ask which agency (and client).
- **Kind** is the type: help article, playbook, Q&A, blog post or fact.
- **Title** and a **Markdown body**, with a **Write** and a **Preview** tab.
- For an agency-level article, **Visible to client users** decides whether that agency's clients can read it as well as its staff. It is on by default. Platform and client-level articles do not show the option.

## How to use it

1. **Choose the level and kind**, then write the title and body.
2. **Check the Preview** tab to see how the Markdown reads.
3. **Save draft** keeps it out of the assistant's search. **Publish** makes it findable.
4. After the first save the page may show warnings about the text; read them before publishing.

## Common questions

### Can I use the product name?

For a platform-level article, write the product name as `{{product}}` and the assistant's name as `{{assistant}}`, so white-label agencies see their own. The editor warns when it finds the literal names.

### Where do page guides come from?

They live in the repository (`docs/help/pages`) and are seeded, not written here.
```

### platform.knowledge.operator.md

```markdown
---
help_key: page:platform.knowledge
audience: operator
title: Knowledge
---
## What this page tells you

Articles the Ask assistant can search and cite, at three levels: **Help (platform)** for everyone, **Agency** for one agency, **Client** for one client. Each article has a kind: help article, playbook, Q&A, blog post or fact.

Badges on each row:

- **Draft** or **Published**. Only Published articles can be found and cited by the assistant.
- **Manual**, **URL** or **Managed in repo**. Managed in repo articles are the page guides and glossary terms seeded from the repository by `kb:seed`. They are read-only here.
- For URL articles, the last sync and whether the text changed, or the reason a sync failed.

## How to use it

1. **Filter** by level, agency, client, kind or status, or search titles.
2. **Click New article** to write one, or open a row to edit it.
3. **To change a Managed in repo article**, edit its Markdown in the repo and seed again.
4. **URL import** (when it is switched on) fetches a web page as a draft. With auto-sync on, the article is re-read every Sunday at 05:00 UTC and updated if the page changed.
5. **Page through** with Older articles; 25 show at a time.

## Common questions

### Why can't I edit an article?

It is Managed in repo. Its source is a Markdown file in the repository.

### Why can't the assistant find my article?

It is probably a Draft. Publish it. The search index is built in the background by an hourly sweep, so a newly published article can take up to an hour to be found.

### Can an agency's clients read an agency-level article?

That is set per article with **Visible to client users** (on by default).
```

### platform.leads.operator.md

```markdown
---
help_key: page:platform.leads
audience: operator
title: Lead pool
---
## What this page tells you

Verified requests from the platform's own request page that no agency holds yet. Only requests whose email address is verified appear. The list shows the newest 200.

Each row shows the business, its address and category, the visitor's message and contact details, a reference and the date it was verified. A **Declined by an agency** badge means an agency was given the lead and sent it back; it is in the pool again.

Below it, **Recent assignments** lists the last 20 leads given to agencies.

## How to use it

1. **Read the lead**: the business, category and message tell you what the visitor wants.
2. **Choose an agency** from the list. Each agency shows its active business types and active client count, so you can match the lead to an agency that serves that kind of business.
3. **Press Assign.** The agency is emailed and the lead leaves the pool. Only platform owners and staff see the Assign control; viewers read only.

## Common questions

### Why was I refused?

An agency that already holds the same visitor (same email) and business cannot be given the lead again. Pick another agency.

### Where do these leads come from?

From the platform's own request page. Leads from an agency's own intake link go to that agency, not to this pool.

### What happens to a lead nobody wants?

It stays in the pool. An agency can also send an assigned lead back, which marks it Declined by an agency and returns it here.
```

### platform.overview.operator.md

```markdown
---
help_key: page:platform.overview
audience: operator
title: Overview
---
## What this page tells you

How {{product}} is doing across every agency, in five figures, three charts and a feed of recent events. It is for platform owners, staff and viewers.

The figures:

- **Agencies**: every agency on the platform.
- **Active clients**: clients with status active that are not paused.
- **Seats**: the people with an agency role plus the people with a client role.
- **Weekly active users**: people who used the app in the last 7 days, today included.
- **Spend this month**: AI and data cost recorded against an agency since the 1st of the month (UTC). Cost that is not tied to one agency is not in it; the Costs page covers the whole platform.

Each figure is today's live value. The small pill next to it, labelled **Last 28 days**, is the change since 28 days ago, taken from the daily figures stored then. There is no pill when nothing changed or nothing was recorded that day. For Spend this month the pill compares the month so far with the month-to-date total as it stood 28 days ago.

## How to use it

1. **Read the pills first.** A rising seat count with flat active clients, or a falling weekly active users figure, is where to look next.
2. **Switch the charts** between **12 weeks** (one point per week, weeks start on Monday) and **12 months** (one point per month). The toggle changes the charts only, not the figures above them. A gap in a line means nothing was recorded for that period.
3. **Scan Recent activity** for what just happened: an agency signing up, adding or activating a client, sending its first brief, becoming at risk, or having a support session opened. It shows 20 at a time; use **Show more** for older events.
4. **Click an agency name** in the feed to open its page.

## Common questions

### Why is a chart empty?

The charts are built from daily stored figures. A new environment shows "No history yet" until the first nightly run has written some.

### Why does Spend this month differ from the Costs page?

Overview counts only cost recorded against an agency. Costs shows what the vendors charge the platform in total, plus manual costs.

### What does at risk in the feed mean?

The agency's health flag turned to At risk. The rules are on the Agencies page.
```

### platform.reviews.operator.md

```markdown
---
help_key: page:platform.reviews
audience: operator
title: Model reviews
---
## What this page tells you

Decisions the models could not settle with enough confidence, waiting for a person. Your answer fixes the event and is stored as a gold label.

Competitor changes (a new page, a price, a service) are classified by a cascade:

1. **Jev** answers first.
2. Any answer under **0.85 confidence** goes to a **language model**.
3. If that answer is also under 0.85, the question lands **here** for a **person**.

The same 0.85 threshold is the verifier's, the check that every brief claim is supported. Each decision task has its own threshold in the AI configuration; today they are all 0.85 except the Ask interpretation check.

Each card shows the competitor, the source and kind of change, and the text before and after. Under it are the questions the models were unsure about, each with **Model said:** the model's answer and its confidence.

## How to use it

1. **Read the before and after text.** Then answer each question in the list.
2. **Press Resolve.** The event is created, corrected or removed as your answers imply, and your answers are saved as gold labels. Nothing on this page changes the thresholds.
3. **Work oldest first.** The queue is ordered by age and shows up to 50 at a time. Items whose change was superseded or suppressed are not listed.

## Common questions

### What does "Model said: No (20%)" mean?

The model's answer was No, with 20% confidence. Your answer replaces it.

### Should I change the threshold?

Not from this page. The project rule is to leave the verifier threshold at 0.85 until enough of these answers have been collected to measure it.

### Who can answer?

Any platform operator can; viewers included.
```

### platform.runbook.operator.md

```markdown
---
help_key: page:platform.runbook
audience: operator
title: Runbook
---
## What this page tells you

The standard runbook every agency starts from: plays (the recommendations a brief can suggest, each with a trigger, a title and a template), starting-point rules, and settings (alert and brief thresholds, focus services and competitor tiers). Each agency gets its own copy, and each client can in turn get a copy of the agency's.

Changing an item here does not rewrite an agency's copy. The agency's item shows **Update available**, and its admins choose to use the update or keep their own version. An item you add shows as **New** for them, and one you remove shows as **Removed upstream**.

Each item has a badge that compares it with its parent and an on/off switch. Platform owners and staff can edit; viewers can read. Nobody can edit in a read-only support session.

## How to use it

1. **Edit a play** to change its title or template. **Preview** shows how the template reads.
2. **Switch items off** that no agency should inherit by default.
3. **Add or remove items** to change what agencies are offered. Agencies decide whether to take each change.
4. **Remember the audience.** Agencies see these words in their own runbook, worded by their assistant.

## Common questions

### Does a change reach every agency at once?

It reaches each agency as an update that its admins choose to accept or decline. If the agency customised the item, the review shows both versions.

### Which clients use these plays directly?

Clients whose business type has no plays of its own and no runbook copy use the agency's runbook, which starts as a copy of this one. HVAC and dental clients keep their built-in plays until they get a runbook of their own.

### Why are the controls disabled?

You are a platform viewer, or you are in a read-only support session.
```

### platform.themes.operator.md

```markdown
---
help_key: page:platform.themes
audience: operator
title: Topic proposals
---
## What this page tells you

New review topics found in reviews that did not fit any existing topic, waiting for your decision.

A proposal appears like this: every night, for each business type, reviews that matched none of its topics are collected. When at least **20** of them from the last **90 days** have built up since the last proposal, a model reads a sample (up to 40) and looks for one specific, recurring topic that at least **a fifth** of them share. If it finds one, it proposes a topic name and a one-line description. A business type has one open proposal at a time. "N reviews with no topic" is how many reviews it looked at.

## How to use it

1. **Read the name, description and sample quotes.** Is it a real, recurring topic for that business type, and not already covered?
2. **Approve** to add it: it is asked for every review analysed from now on in that business type. **Reject** to turn it down: it is not proposed again.
3. **Check Recently decided** for the last 30 days of decisions.

## Common questions

### Does approving re-read old reviews?

No. Approved topics apply to reviews analysed from then on.

### Can I undo a decision?

Not from this page. A proposal someone else already decided shows an error.

### Why is the list empty?

No business type has collected enough unmatched reviews yet, or one already has an open proposal.
```

### platform.verticals.operator.md

```markdown
---
help_key: page:platform.verticals
audience: operator
title: Business types
---
## What this page tells you

The review queue for business types and services (business areas) that agencies created while setting up clients. The number on the menu item counts both lists.

- **New business types**: each card shows the name and id, who added it, how many clients use it, its Google categories and services, and an **Evidence** list of the quotes it was drafted from.
- **New services**: services added to an already reviewed business type, with their other names.

Platform owners and staff can act; viewers read the queue but see no buttons.

## How to use it

1. **Approve** a business type that is right. It is marked reviewed together with the services it came with. Approve a service on its own the same way.
2. **Rename** to fix a name. The id never changes. A name cannot include a client's business name, phone number, email or web address.
3. **Edit** (business types only) to change the keywords, Google categories, review topics and services before approving.
4. **Merge into** a duplicate. Everything of the duplicate moves to the entry you pick: its clients, events, prices and agency settings. The old id keeps resolving to the target. For a business type you also say where each of its services goes; matching names are pre-filled, and "Move" keeps a service as a new one. A service merges into another service of the same business type.

## Common questions

### What happens to the old business type?

Clients, events, prices and agency settings move to the target, and the old id keeps resolving to it.

### Why can't I see any buttons?

You are a platform viewer. Owners and staff can change the catalogue.

### Where do the quotes come from?

They are the evidence recorded when the business type was drafted, and show why each service was proposed.
```

## Notes for the owner

- Guides state what each page does today. Where the code does not say (for example what happens to an agency that already redeemed a revoked link) nothing is claimed.
- The operator versions are the only versions: if the platform ever opens a page to agency roles, its guide needs an agency version first.
- The Knowledge list shows these guides too, badged "Managed in repo", after `kb:seed` runs.
- The account pages (inbox, notification settings, setup wizard) follow in "Batch: account".

# Batch: account (Task 9b, 3 pages)

Pages: Inbox (`/inbox`), Notification settings (`/settings/notifications`) and the agency setup wizard (`/onboarding`). `kb.detail` (`/kb/<id>`) is exempt.

## Who reaches each page, and which guide they get

| Page | Reached by | Guides | Notes |
|---|---|---|---|
| Inbox `page:account.inbox` | Agency admin, account manager, client owner, client viewer, and client guests (magic-link contacts). A platform operator reaches it only through an own agency membership, so as agency staff. A support session gets a 404 (`ctx.support`). | `agency` + `client` (guests and client roles read `client`) | Both read the same page; the labels differ by role because agency staff and client contacts get different kinds of notice. |
| Notification settings `page:account.settings.notifications` | Any signed-in user (`viewer.kind === user`); guests and support sessions get a 404. Agency roles see the agency card (and a client card if they are also a client contact); client roles see client cards. | `agency` + `client` | Agency labels (Client alerts (agency), Rank scan skipped) appear only on an agency card; client cards list Instant alerts, Alert digest, Weekly brief, Quarterly report. |
| Setup wizard `page:account.onboarding` | Agency admin only (`ctx.role !== agency_admin` is a 404); a finished or dismissed wizard redirects to `/agency`. | `agency` only | No client guide. The seed test proves client roles read none. |

- **Operators**: there is no operator version of any account page. An operator signed in with an agency membership reads the agency versions (`roleAudience` never returns `operator` outside the platform context); a member-less operator is sent to `/no-access` before any account page.
- **Guide scope**: these routes are outside `/agency`, `/c/<id>` and `/platform`, so `helpScopeOf` gives `{ context: 'agency' }`. Each page reads `helpGuides(ctx, 'agency')` and the drawer loads `get_page_guide` with `context: 'agency'`, whatever the viewer is. Client roles are not refused in the agency context for account keys; the tool returns the client version for them (tested).
- **Your account**: `list_help_guides` returns `page:account.%` rows in every context, and the Help pages group them under "Your account" (`groupGuides`, tested for an agency and a client menu). An agency role is listed all three; a client role is listed Inbox and Notification settings only.
- **Wiring**: each page passes `helpKey` + `guide={guides.has(KEY)}` to `PageHeader`, the description through `HelpText`, and its tips in a `TipRow` under the header (Notification settings shows its row only when there is at least one card; the wizard shows the skip tip plus a tip for the current step). Tips for the other audience are left out whole by `TipRow`.
- **Empty states**: Inbox ("Nothing here yet") and Notification settings ("No notification settings yet") each have one, for every audience. The wizard has none (it always shows a form, or redirects).
- **Product name / assistant**: none of the account copy names the product or the assistant; no placeholder is used.
## Short copy (descriptions, tips, empty states)

### account.inbox (Inbox)

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Your latest 100 notifications, newest first: the alerts, briefs, reports and notices sent to you. Select one to open it. | apps/web/src/app/(app)/inbox/page.tsx (listInbox limit 100, newest first, Mark all read); inbox/actions.ts:openNotification |
| Tip `unread` | all | **Unread and read**: A bold title is unread. Selecting a notification marks it read and takes you to the page it is about; a notice with nothing to open brings you back here. Mark all read marks every notification you have, not only the ones on this page. | apps/web/src/app/(app)/inbox/page.tsx (unread title font-bold, read font-medium); inbox/actions.ts:openNotification (markRead then redirect to the notice's page, or back to /inbox when it has none), markAllReadAction |
| Tip `labelsAgency` | agency | **What the labels mean**: The grey label names the kind of notice. Client alerts (agency): an alert to review, or one that was already sent, for a client you cover. Brief ready for review and Brief failed: a client's weekly brief is ready for your approval, or could not be produced. Brief overdue: a brief was still waiting for approval at 07:00 client time. Rank scan skipped: a map ranking scan would have gone over the client's monthly cost cap. Competitor suggestions ready, Client updated their setup and Setup waiting on you: where a client's setup stands. Quarterly report: a client's quarterly report is ready. | apps/web/src/server/inbox.ts:NOTIFICATION_KIND_LABELS; packages/db/src/schema/delivery.ts:CLIENT_KINDS, AGENCY_KINDS; packages/engine/src/alerts/route.ts:notifyAm (alert to review or sent), briefs/notify.ts (brief ready or failed), briefs/deliver.ts:notifyOverdue (not sent at 07:00 client time), delivery/rank-notices.ts:notifyRankScanSkipped (monthly cost cap); apps/worker/src/jobs/setup.ts (setup reminders: suggestions ready, client changed their setup, idle) |
| Tip `labelsClient` | client | **What the labels mean**: The grey label names the kind of notice. Instant alerts: one change that matters, sent when it is ready. Alert digest: alerts held back for an evening roundup. Weekly brief: your brief for the week. Quarterly report: the report written after each quarter. | apps/web/src/server/inbox.ts:NOTIFICATION_KIND_LABELS; packages/db/src/schema/delivery.ts:CLIENT_KINDS (alert, alert_digest, brief, trend_report); packages/engine/src/alerts/route.ts, alerts/digest.ts, briefs/deliver.ts, reports/quarterly.ts |
| Tip `choose` | all | **Choosing what arrives**: If you have an account menu, Notification settings there has two switches for each kind of notice: In-app and Email. Switch In-app off and new notices of that kind stop appearing here; the ones already here stay. | apps/web/src/components/shell/avatar-menu.tsx (Notification settings link); packages/engine/src/delivery/contacts.ts:recipientsFor (a switched-off channel is skipped, so a notice is not created) |
| Empty `none` | all | **Nothing here yet**: Alerts, briefs and reports you receive appear here, newest first. If you have an account menu, you can choose which ones in Notification settings. | teaching empty state (no figures) |

### account.settings.notifications (Notification settings)

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Choose which notices reach you in the app and by email, and set a time zone and quiet hours for email. | apps/web/src/app/(app)/settings/notifications/page.tsx, contact-form.tsx; packages/tools/src/preferences.ts:myNotificationSettings |
| Tip `channels` | all | **In-app and email**: Each row has two switches. In-app puts the notice in your Inbox; Email sends it to the address on this list. Both start on. A switch saves the moment you change it, and only affects new notices. With both on, you get the same notice both ways. | apps/web/src/app/(app)/settings/notifications/pref-switch.tsx (saves at once, no Save button); packages/tools/src/preferences.ts:myNotificationSettings (default on); packages/engine/src/delivery/contacts.ts:recipientsFor (channels left on) |
| Tip `quiet` | all | **Quiet hours**: Fill in both a start and an end to turn quiet hours on; clear one of them and save to turn them off. A window can run overnight, such as 21:00 to 07:00. Emails that would arrive inside it are held and sent when it ends. In-app notices still arrive at once. | apps/web/src/app/(app)/settings/notifications/contact-form.tsx (hint text, Save), actions.ts:updateContactAction (both times or none); packages/engine/src/delivery/time.ts:quietUntil (wraps midnight); delivery/outbox.ts:notify (email notBefore = end of the window; in-app not delayed) |
| Tip `timezoneAgency` | agency | **Time zone**: The clock your quiet hours follow. Left on Business time zone, they follow US Central time (America/Chicago). Pick a zone if you want your own local time. | packages/engine/src/delivery/contacts.ts:recipientsFor (an agency contact with no time zone falls back to DEFAULT_TIMEZONE); packages/engine/src/briefs/schedule.ts:DEFAULT_TIMEZONE (America/Chicago) |
| Tip `timezoneClient` | client | **Time zone**: The clock your quiet hours follow. Left on Business time zone, they follow the time zone saved for your business. Pick a zone if you want your own local time. | packages/engine/src/delivery/contacts.ts:recipientsFor (a client contact with no time zone falls back to the client's time zone) |
| Tip `agencyKinds` | agency | **Agency notices**: Client alerts (agency): an alert to review or one already sent. Brief ready for review, Brief failed and Brief overdue: where a client's weekly brief stands. Rank scan skipped: a map ranking scan went over the client's monthly cost cap. Competitor suggestions ready, Client updated their setup and Setup waiting on you: where a client's setup stands. An account manager who covers only some clients gets these only for those clients. Slack and Teams messages are set up under Agency settings, not here. | apps/web/src/server/inbox.ts:NOTIFICATION_KIND_LABELS; packages/db/src/schema/delivery.ts:AGENCY_KINDS; packages/engine/src/delivery/contacts.ts:recipientsFor (agency contacts: a client scope limits which clients' notices arrive); the briefs, alerts and rank notices cited under account.inbox.labelsAgency |
| Tip `clientKinds` | client | **Notices about your business**: Instant alerts: one change that matters, sent when it is ready. Alert digest: alerts held back for an evening roundup. Weekly brief: your brief for the week. Quarterly report: the report written after each quarter. A few messages, such as an invitation to join, are needed for your account and have no switch. | packages/tools/src/preferences.ts:kindsFor (CLIENT_KINDS minus client_invite and competitor_review, which are not switchable) |
| Tip `several` | all | **More than one list**: There is one card for each place you receive notices from, titled with its name. Switches, time zone and quiet hours are saved separately for each card. | packages/tools/src/preferences.ts:myNotificationSettings (one entry per active contact the person has: the agency list and each client list); page.tsx (card title = client name, else agency name) |
| Empty `none` | all | **No notification settings yet**: A list of switches appears here for each agency or business you are set up to receive notices from. | teaching empty state (no figures) |

### account.onboarding (Set up your agency (wizard))

| Item | Audience | Text | Source |
|---|---|---|---|
| Description | all | Four short steps to get your agency ready: profile, team, plan and branding. You can skip any step and finish it later. | apps/web/src/app/(app)/onboarding/flow.ts:STEPS (profile, team, plan, branding), nextPath, step-nav.tsx (Skip for now); page.tsx (redirect to /agency once completed or dismissed) |
| Tip `skip` | all | **Skipping a step**: Skip for now moves you on and marks the step Skipped. Back returns to the previous step. A step you skip stays on the Getting started card on your Portfolio, where it links back here, until you finish it or dismiss the card. | apps/web/src/app/(app)/onboarding/step-nav.tsx; stepper.tsx (Done / Skipped labels); apps/web/src/components/agency/onboarding-checklist.tsx (open and skipped steps stay as links on the Getting started card; Dismiss hides it) |
| Tip `profile` | agency | **About this step**: To save this step we need your agency name, a contact name, a contact email and a phone number. Everything else is optional. We use it to set up your account and invoices. | apps/web/src/app/(app)/onboarding/steps/profile.tsx (copy: agency name, a contact name, contact email and phone are needed to save; the rest is optional) |
| Tip `team` | agency | **About this step**: Add an email and a role for each person: Agency admin or Account manager. Each person gets an invitation by email. Leave the list empty and you are asked to confirm before moving on. You can invite more people later from Team. | apps/web/src/app/(app)/onboarding/steps/team.tsx (roles Agency admin and Account manager; Continue without inviting anyone? confirmation); actions.ts:inviteTeamAction |
| Tip `plan` | agency | **About this step**: Shows your plan, when a pilot or trial ends and how many clients it includes. Add payment method opens a secure payment page and brings you back here; if your trial has limits, the note on this step says what they are. Save and continue marks the step done and moves you on. | apps/web/src/app/(app)/onboarding/steps/plan.tsx (plan state, end date, clients included, Add payment method, trial note); actions.ts:startCheckoutAction, continuePlanAction |
| Tip `branding` | agency | **About this step**: Set the name, logo and colours your clients see, with a live preview. You can change all of it later in Agency settings. | apps/web/src/app/(app)/onboarding/steps/branding.tsx (BrandingEditor, Save and continue) |

## Numbers in the account guides and tips

| Number or label | Where | Source |
|---|---|---|
| 100 notifications, newest first | Inbox description, both guides | apps/web/src/app/(app)/inbox/page.tsx (`listInbox(..., { limit: 100 })`; `packages/tools/src/inbox.ts:listInbox` orders by `createdAt` desc) |
| Mark all read covers older ones too | Inbox guides | packages/tools/src/inbox.ts:markAllRead (no limit); inbox/actions.ts:markAllReadAction |
| 07:00 client time (brief overdue) | Inbox agency label tip and guide | packages/engine/src/briefs/deliver.ts:notifyOverdue ("not sent at 07:00 client time") |
| Monthly cost cap (rank scan skipped), "Usage" | Inbox and Notification settings, agency | packages/engine/src/delivery/rank-notices.ts:notifyRankScanSkipped ("would exceed ... monthly cost cap ... Raise the cap in Usage") |
| Setup notices: client change within the last day; waiting on you 3 days, again at 7 days | Inbox agency guide and label tip | apps/worker/src/jobs/setup.ts (DAY_MS window for setup_client_changed; setup_idle at age >= 3 days, 7 days once the 3-day notice exists) |
| Notice labels (all 12 named) | Inbox and Notification settings | apps/web/src/server/inbox.ts:NOTIFICATION_KIND_LABELS; packages/db/src/schema/delivery.ts:CLIENT_KINDS, AGENCY_KINDS |
| Both switches start on | Notification settings | packages/tools/src/preferences.ts:myNotificationSettings (`?? true`); packages/engine/src/delivery/contacts.ts:recipientsFor |
| A switch saves at once (no Save button) | Notification settings | settings/notifications/pref-switch.tsx (`setPrefAction` on change); contact-form.tsx Save covers time zone and quiet hours only |
| US Central time (America/Chicago) for agency contacts without a time zone | Notification settings agency tip and guide | packages/engine/src/briefs/schedule.ts:DEFAULT_TIMEZONE; packages/engine/src/delivery/contacts.ts:recipientsFor (`input.audience === client ? c.timezone : DEFAULT_TIMEZONE`) |
| A client contact without a time zone follows the business time zone | Notification settings client tip and guide | packages/engine/src/delivery/contacts.ts:recipientsFor |
| Quiet hours need both times; clear one to turn off | Notification settings tip and guides | settings/notifications/actions.ts:updateContactAction (`start && end ? { start, end } : null`) |
| 21:00 to 07:00 overnight window | Notification settings tip and guides | packages/db/src/schema/delivery.ts:QuietHours (example "21:00 -> 07:00"); packages/engine/src/delivery/time.ts:quietUntil (start >= end wraps midnight) |
| Email held until the window ends; in-app not delayed | Notification settings tip and guides | packages/engine/src/delivery/outbox.ts:notify (email `notBefore: quietUntil(...)`; in-app rows get no `notBefore`) |
| Invitation / competitor-review messages have no switch | Notification settings client tip and guide | packages/tools/src/preferences.ts:TRANSACTIONAL_KINDS, kindsFor |
| Account managers with a client list get agency notices only for those clients | Inbox and Notification settings, agency | packages/engine/src/delivery/contacts.ts:recipientsFor (`contact.clientScope`) |
| Four steps: profile, team, plan, branding | Wizard description, tips, guide | apps/web/src/app/(app)/onboarding/flow.ts:STEPS, STEP_TITLES |
| Agency name, contact name, contact email and phone needed to save step 1 | Wizard tip and guide | apps/web/src/app/(app)/onboarding/steps/profile.tsx (intro paragraph) |
| Roles Agency admin and Account manager; confirm when no one is invited | Wizard tip and guide | onboarding/steps/team.tsx (role select, "Continue without inviting anyone?"); actions.ts:inviteTeamAction |
| Skipped / Done states; skipped steps stay on the Getting started card | Wizard tip and guide | onboarding/stepper.tsx (LABEL); step-nav.tsx; apps/web/src/components/agency/onboarding-checklist.tsx (open and skipped steps are links; Dismiss) |
| Wizard redirects to /agency once completed or dismissed; agency admins only | Wizard guide | onboarding/page.tsx |

No trial or plan numbers are stated: the plan step shows its own note, and the guide only points to it.

## Guides (full text)

### account.inbox.agency.md

```markdown
---
help_key: page:account.inbox
audience: agency
title: Inbox
---
## What this page tells you

Your own notifications, newest first: the latest 100 that were sent to you in the app. They cover the clients you receive notices for, and anything addressed to you as a contact for a client. A bold title is unread.

Each row shows the title, the time, the start of the message and a grey label for the kind of notice:

- **Client alerts (agency)**: an alert to review, or one that was already sent, for a client you cover.
- **Brief ready for review**: a client's weekly brief is ready for your approval.
- **Brief failed**: the brief could not be produced and nothing will be sent for that week.
- **Brief overdue**: a brief was still waiting for approval at 07:00 client time, so it was not sent.
- **Rank scan skipped**: a map ranking scan would have gone over the client's monthly cost cap. The notice points you to Usage to raise the cap.
- **Competitor suggestions ready**: suggested competitors are waiting for you to pick from, so the client's first brief can start.
- **Client updated their setup**: someone at the client changed their setup in the last day.
- **Setup waiting on you**: a client's setup has been waiting on you for 3 days, and again at 7 days.
- **Quarterly report**: a client's quarterly report is ready.

## How to use it

1. **Open a notice.** Select a row. It is marked read and you land on the page it is about, such as the alert or the brief. A notice with nothing to open brings you back here.
2. **Clear the bold.** **Mark all read** marks every notification you have as read, including any older than the 100 shown.
3. **Choose what arrives.** If you have an account menu, open **Notification settings** there. Each kind of notice has an **In-app** and an **Email** switch. Switching In-app off stops new notices of that kind appearing here; the ones already here stay.

## Common questions

### Why do I not see notices for some clients?

If you are an account manager who covers only some clients, you receive agency notices only for those clients.

### Why is it empty?

Nothing has been sent to you yet, or In-app is switched off for the kinds you expected. Check Notification settings.

### Can I delete a notification?

No. The page has no delete control; mark it read instead.

### Do Slack and Teams messages show up here?

No. Those are set up under Agency settings and go to the channel you connected, not to your inbox.

### I get the same notice by email and here. Is that a mistake?

No. When both **In-app** and **Email** are on for a kind, you get it both ways. Switch one off to get it once.
```

### account.inbox.client.md

```markdown
---
help_key: page:account.inbox
audience: client
title: Inbox
---
## What this page tells you

Your own notifications, newest first: the latest 100 that were sent to you in the app. A bold title is unread.

Each row shows the title, the time, the start of the message and a grey label for the kind of notice:

- **Instant alerts**: one change that matters, sent when it is ready.
- **Alert digest**: alerts held back for an evening roundup.
- **Weekly brief**: your brief for the week.
- **Quarterly report**: the report written after each quarter.

## How to use it

1. **Open a notice.** Select a row. It is marked read and you land on the page it is about, such as the alert or the brief. A notice with nothing to open brings you back here.
2. **Clear the bold.** **Mark all read** marks every notification you have as read, including any older than the 100 shown.
3. **Choose what arrives.** If you have an account menu, open **Notification settings** there. Each kind of notice has an **In-app** and an **Email** switch. Switching In-app off stops new notices of that kind appearing here; the ones already here stay.

## Common questions

### Why is it empty?

Nothing has been sent to you yet, or In-app is switched off for the kinds you expected. Check Notification settings.

### Can I delete a notification?

No. The page has no delete control; mark it read instead.

### I get the same notice by email and here. Is that a mistake?

No. When both **In-app** and **Email** are on for a kind, you get it both ways. Switch one off to get it once.

### Where do I change how I get my weekly brief?

In Notification settings, on the **Weekly brief** row.
```

### account.settings.notifications.agency.md

```markdown
---
help_key: page:account.settings.notifications
audience: agency
title: Notification settings
---
## What this page tells you

Which notices reach you, in the app and by email, plus a time zone and quiet hours for email. This page is about you only: nothing here changes what your clients or teammates receive.

There is one card for each place you receive notices from, titled with its name: your agency, and any client you are also a contact for. Each card has a row per kind of notice with two switches:

- **In-app** puts the notice in your Inbox.
- **Email** sends it to the address on that card.

Your agency card lists **Client alerts (agency)**, **Brief ready for review**, **Brief failed**, **Brief overdue**, **Rank scan skipped**, **Quarterly report** and three setup notices that follow a client's setup: **Competitor suggestions ready**, **Client updated their setup** and **Setup waiting on you**. An account manager who covers only some clients gets these notices only for those clients.

## How to use it

1. **Switch a notice on or off.** Every switch starts on. A switch saves the moment you change it, with no Save button, and applies to new notices only.
2. **Pick a time zone.** It sets the clock your quiet hours follow. Left on **Business time zone**, quiet hours follow US Central time (America/Chicago).
3. **Set quiet hours.** Fill in both a start and an end time, then select **Save**. A window can run overnight, such as 21:00 to 07:00. To turn quiet hours off, clear one of the times and save.

Emails that would arrive inside the quiet window are held and sent when it ends. In-app notices are not delayed.

## Common questions

### Where do I set up Slack or Teams messages?

Under Agency settings. Those go to a channel you connect, not to you personally, so they are not on this page.

### Why is there more than one card?

You receive notices from more than one place, for example the agency and a client you are also a contact for. Switches, time zone and quiet hours are saved separately on each card.

### Will quiet hours stop alerts to my clients?

No. Quiet hours only delay emails sent to you.

### Why do I get a notice by email and in the app?

Both switches are on for that row. Switch one off to get it once.
```

### account.settings.notifications.client.md

```markdown
---
help_key: page:account.settings.notifications
audience: client
title: Notification settings
---
## What this page tells you

Which notices reach you, in the app and by email, plus a time zone and quiet hours for email. This page is about you only: nothing here changes what anyone else receives.

There is one card for each business you receive notices about, titled with its name. Each card has a row per kind of notice with two switches:

- **In-app** puts the notice in your Inbox.
- **Email** sends it to the address on that card.

The rows are **Instant alerts** (one change that matters, sent when it is ready), **Alert digest** (alerts held back for an evening roundup), **Weekly brief** (your brief for the week) and **Quarterly report** (the report written after each quarter).

## How to use it

1. **Switch a notice on or off.** Every switch starts on. A switch saves the moment you change it, with no Save button, and applies to new notices only.
2. **Pick a time zone.** It sets the clock your quiet hours follow. Left on **Business time zone**, quiet hours follow the time zone saved for your business.
3. **Set quiet hours.** Fill in both a start and an end time, then select **Save**. A window can run overnight, such as 21:00 to 07:00. To turn quiet hours off, clear one of the times and save.

Emails that would arrive inside the quiet window are held and sent when it ends. In-app notices are not delayed.

## Common questions

### Why can I not switch off every message?

A few messages that are needed for your account, such as an invitation to join, are not optional and have no switch here.

### Will I miss something if I switch Email off?

You will not get that kind of notice by email. If In-app is still on, it appears in your Inbox.

### Why is there more than one card?

You receive notices about more than one business. Switches, time zone and quiet hours are saved separately on each card.

### Why do I get a notice by email and in the app?

Both switches are on for that row. Switch one off to get it once.
```

### account.onboarding.agency.md

```markdown
---
help_key: page:account.onboarding
audience: agency
title: Set up your agency
---
## What this page tells you

A short setup for a new agency, in four steps shown across the top. Each step shows **Done** or **Skipped** once you have dealt with it:

1. **Your agency**: your agency name, a contact name, contact email and phone, plus optional details such as your time zone and billing address. These set up your account and invoices.
2. **Invite your team**: the people who will manage clients with you.
3. **Your plan**: your plan, when a pilot or trial ends and how many clients it includes.
4. **Make it yours**: the name, logo and colours your clients see, with a live preview.

Only agency admins can open this page. Once all steps are done, or the Getting started card on your Portfolio has been dismissed, the address takes you to the Portfolio instead.

## How to use it

1. **Fill in a step and save.** **Save and continue** (or **Done** on the team step) marks it done and moves you to the next. To save your agency details we need the agency name, a contact name, a contact email and a phone number.
2. **Invite your team.** Enter an email and choose **Agency admin** or **Account manager** for each person, and use **Add another** for more. Each person gets an invitation by email. If you leave every email empty you are asked to confirm before moving on.
3. **Check your plan.** **Add payment method** opens a secure payment page and brings you back to this step. If your trial has limits, the note on the step says what they are. **Save and continue** marks the step done.
4. **Skip what you are not ready for.** **Skip for now** moves you on and marks the step **Skipped**. **Back** returns to the previous step. Skipped and open steps stay on the Getting started card on your Portfolio, each linking back here, until you finish them or dismiss the card.

## Common questions

### Do I have to finish every step?

No. Every step can be skipped and finished later from the Getting started card.

### Where do I change this later?

Under Agency settings: your team, plan and branding each have a page there.

### Why do I land on the Portfolio instead of this page?

The setup is finished or the Getting started card was dismissed.

### Why can an account manager not open this page?

Setup changes the agency itself, so it is limited to agency admins.
```

## Notes for the owner (account)

- The same Inbox and Notification settings pages serve agency staff and client contacts, so there are two guides each; the client versions never mention agency notices, cost caps, Slack/Teams or Agency settings.
- Quiet hours hold emails rather than dropping them (`notBefore`). The page itself says "No notifications by email in this window (in-app still arrive)"; the tips and guides say the emails are held and sent when the window ends, which is what the code does.
- For agency contacts the "Business time zone" option actually means US Central time. The tip and guide say so; the option label itself is unchanged (a product decision, not help copy).
