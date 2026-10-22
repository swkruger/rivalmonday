import type { PageCopy } from '.';

/**
 * Short in-page help copy for platform-context pages (`platform.*`), 15b-2 Task 9a. Same rules as `client.ts`, with these
 * differences: platform pages are operator-only (`requireOperatorContext`), so internals (thresholds, vendors, costs,
 * the Jev cascade) may be stated. Tips and empty states that carry internals are marked `audience: 'operator'`; an
 * operator's help audience reads `all`, `agency` and `operator` (`visibleAudiences`). The short copy never spells the
 * product name (the shared copy test forbids it); guides use `{{product}}`. The page key `platform.themes` is the
 * Topic proposals page (identifiers keep "theme", user-facing text says "topic").
 */
export const PLATFORM_COPY = {
  'platform.overview': {
    // source: apps/web/src/app/(platform)/platform/page.tsx (five tiles, charts, activity); packages/tools/src/platform/series.ts:BUCKETS (12)
    description: 'How the platform is doing: agencies, active clients, seats, weekly active users and this month\'s spend, with charts for the last 12 weeks or 12 months and the latest activity.',
    tips: {
      // source: packages/tools/src/tools/platform-console.ts:liveAgencies (active = status active and not paused; seats = distinct people per role group; wau = session activity since today minus 6 days 00:00 UTC; spend = llm_call + vendor_call recorded against the agency since the UTC month start)
      figures: {
        title: 'What the five figures count',
        body: 'Agencies: every agency on the platform. Active clients: clients with status active that are not paused. Seats: the people with an agency role plus the people with a client role. Weekly active users: people who used the app in the last 7 days, today included. Spend this month: AI and data cost recorded against an agency since the 1st of the month (UTC); cost not tied to one agency is not in it.',
        audience: 'operator',
      },
      // source: packages/tools/src/tools/platform-console.ts:tilesOf (delta28d = live value minus the stored daily row 28 days ago; spend compares the month so far with the month-to-date total as of that day); apps/web/src/app/(platform)/platform/_components/overview-charts.tsx:deltaPill (no pill when null or 0)
      last28: {
        title: 'Last 28 days',
        body: 'Each big number is today\'s live figure. The small pill beside it is the change since 28 days ago, taken from the daily figures stored then. No pill means no change, or nothing was recorded 28 days ago. For Spend this month the pill compares the month so far with the month-to-date total as it stood 28 days ago.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(platform)/platform/_components/range-toggle.tsx:OPTIONS; packages/tools/src/platform/series.ts:BUCKETS (12), weekStart (Monday), bucketStarts (the last bucket holds yesterday)
      range: {
        title: '12 weeks or 12 months',
        body: 'The toggle changes the charts, not the figures above them. 12 weeks shows one point per week (weeks start on Monday); 12 months shows one point per month. A gap in a line means nothing was recorded for that period.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/platform-console.ts:ACTIVITY_KINDS; apps/web/src/app/(platform)/platform/page.tsx (limit 20); platform/actions.ts:loadMoreActivity (limit 20)
      activity: {
        title: 'What the activity list shows',
        body: 'Newest first, 20 at a time (Show more loads the next 20). It lists an agency signing up, adding or activating a client, sending its first brief, becoming at risk, and a support session being opened on it.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      activity: {
        title: 'No activity yet',
        body: 'Events appear here as agencies sign up, add and activate clients, send a first brief, become at risk or have a support session opened.',
        audience: 'operator',
      },
    },
  },
  'platform.agencies': {
    description: 'Every agency with its live figures, health flag and billing state. Click a column heading to sort, or an agency name for its detail.',
    tips: {
      // source: packages/tools/src/platform/health.ts:healthFlag (first match wins at_risk, idle, growing, steady; mature = 28 days old; quiet = no activity for 14 days or never); packages/tools/src/tools/platform-console.ts:liveAgencies (lastSignIn = latest session of an agency-role member; lastBriefSentAt = newest sent brief)
      health: {
        title: 'Health',
        body: 'The first rule that matches wins. At risk: the agency is at least 28 days old and nobody on its agency team has been active in the app for 14 days (or ever), or it has fewer active clients than 28 days ago. Idle: at least 14 days old, has an active client and has sent no brief in the last 14 days. Growing: at least 28 days old with more active clients than 28 days ago. Steady: anything else, including every agency under 14 days old. The 28-day comparison is skipped when no figures were stored for that day.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(platform)/platform/agencies/agency-table.tsx:COLUMNS, defaultDir; packages/tools/src/tools/platform-console.ts:liveAgencies (clients_active, clients_prospect, agency_seats + client_seats, wau, last_activity_at, spend)
      columns: {
        title: 'Reading the columns',
        body: 'Active clients are active and not paused. Prospects are clients not yet active. Seats are people with an agency role plus people with a client role. WAU is people active in the last 7 days. Last activity is the latest activity by anyone in the agency, client users included; a dash means none yet. Spend this month is AI and data cost recorded against the agency since the 1st (UTC). Click a heading to sort: Agency and Health start A to Z (at risk first), the others start with the highest or newest.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(platform)/platform/_components/billing-state-pill.tsx:BILLING_STATE_LABEL; packages/billing/src/state.ts:PAST_DUE_TO_READ_ONLY_DAYS (7), READ_ONLY_TO_SUSPENDED_DAYS (30)
      billing: {
        title: 'Billing states',
        body: 'Pilot: on a free pilot. Trial: on its trial. Active: paying. Past due: a payment failed, or a trial or subscription ended unpaid. Paused: the agency has been read-only since it was 7 days past due. Suspended: 30 days after Paused begins. Cancelled: the subscription ended.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      none: {
        title: 'No agencies yet',
        body: 'Agencies appear here when they sign up, either through open sign-up or an invite link from Billing & plans.',
        audience: 'operator',
      },
    },
  },
  'platform.agencies.detail': {
    description: 'One agency: how it is doing, its team and clients, its billing and its recent support sessions.',
    tips: {
      // source: packages/tools/src/platform/support.ts:SUPPORT_SESSION_MINUTES (60); packages/tools/src/tools/support.ts:startSupportSession (reason 5 to 300 characters, owners and staff, recorded in the agency audit log via withPlatformAudit); apps/web/src/app/(platform)/platform/agencies/[id]/support-dialog.tsx
      support: {
        title: 'About support sessions',
        body: 'View as agency opens a support session on this agency. It lasts 60 minutes, is read-only, and needs a reason of 5 to 300 characters that the agency can read. Only platform owners and staff can start one. Every session is recorded in the agency\'s audit log and listed under Support sessions below.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/platform-console.ts:getPlatformAgency (team = distinct people per role)
      team: {
        title: 'Team counts',
        body: 'The number of different people in this agency in each role: agency admins, account managers, client owners and client viewers.',
        audience: 'operator',
      },
      // source: apps/web/src/app/(platform)/platform/agencies/[id]/billing-panel.tsx:BillingPanel (staff controls, owner-only cap switch); packages/billing/src/access.ts:decide (pilot cap)
      billingPanel: {
        title: 'The billing panel',
        body: 'Shows the agency\'s billing state, plan and version, its trial and pilot end dates, how many seats Stripe has been told about ("sync pending" means an update is queued) and whether the agency is exempt from the pilot client limit. Owners and staff can grant or end a pilot, extend a trial and attach a discount code; only owners can lift the pilot client limit. Viewers read only.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noClients: {
        title: 'No clients yet',
        body: 'Clients appear here once the agency adds them.',
        audience: 'operator',
      },
    },
  },
  'platform.billing': {
    description: 'Revenue and plans: MRR, paid seats, agencies by billing state, sign-up controls, plan versions, discount codes, Stripe Connect and agency invite links.',
    tips: {
      // source: packages/tools/src/tools/platform-billing.ts:getBillingOverviewTool (sums the newest agency_daily_stat day)
      money: {
        title: 'MRR and paid seats',
        body: 'Monthly recurring revenue and the number of paid seats, summed over all agencies from the latest daily stats, so they can be up to a day behind.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(platform)/platform/billing/signups-panel.tsx (paused switch, 30/90 day funnel); packages/tools/src/tools/platform-billing.ts:setSignupsPausedTool (owners)
      signup: {
        title: 'Open sign-up',
        body: 'When open sign-up is paused, new agencies cannot sign themselves up; invite links keep working. Only owners can change it. The funnel counts agencies that reached each step in the last 30 or 90 days: signed up, finished their profile, added a first client, added a card, split by open sign-up and invite link.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(platform)/platform/billing/plan-editor.tsx; billing/actions.ts:createPlanVersionAction
      plans: {
        title: 'Plan versions',
        body: 'Each row is one version of the plan. Publishing a new version makes it current for new subscriptions; existing subscriptions keep their prices. Trial days is the length of a new trial. Only owners can publish a version.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/platform-billing.ts:createDiscountCodeTool (percent or dollars off; base, seats or both; once, 1 to 36 months or forever; owners)
      codes: {
        title: 'Discount codes',
        body: 'A code takes a percentage or a dollar amount off the base price, the seats or both, for the first invoice, for 1 to 36 months, or forever. It can have an expiry date and a maximum number of uses. Only owners can create or revoke a code.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/platform-billing.ts:createDiscountCodeTool (restrictedAgencyIds: uuid array, max 100, every id must exist), createInviteLinkTool (a restricted code cannot go on an invite link); billing/codes.tsx footnote; billing/actions.ts:createDiscountCodeAction (split on commas, spaces, semicolons)
      restrict: {
        title: 'Restricting a code to agencies',
        body: 'To limit a code to certain agencies, paste their agency ids (UUIDs) into the box, separated by commas or spaces, up to 100. An agency\'s id is the long code at the end of its page address, /platform/agencies/<id>. Every id must belong to an existing agency or the code is refused. A restricted code has no promotion code, so agencies cannot type it at checkout: attach it from the agency\'s page instead. It cannot go on an invite link.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(platform)/platform/billing/connect-panel.tsx (default fee, per-agency override, "0 sends no fee", new Checkout links only)
      connect: {
        title: 'Stripe Connect fees',
        body: 'Agencies bill their own clients through their own Stripe account. The default fee is the percentage the platform takes from those payments; an agency can have its own override, and a blank override goes back to the default. 0 sends no fee. A change applies to Checkout links created afterwards; existing subscriptions keep the fee they started with. Only owners can change fees.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/tools/platform-billing.ts:createInviteLinkTool (maxUses 1 to 1000, expiresInDays 1 to 90 default 14, pilot needs pilotEndsAt, staff); packages/core/src/invite-offer.ts:pilotLinkRefusal (pilot must end after the link expires); billing/invite-links.tsx (shown once)
      links: {
        title: 'Agency invite links',
        body: 'An invite link lets an agency sign up on a pilot or a trial. Max uses is 1 to 1,000. The link expires in 1 to 90 days (14 if you leave it blank). A pilot link needs a pilot end date after the day the link expires. The full link is shown once, right after you create it, and cannot be retrieved later. Lock to email limits it to one address, and you can email it from here. Owners and staff only.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
    },
  },
  'platform.leads': {
    // source: apps/web/src/app/(platform)/platform/leads/page.tsx (the page's existing description)
    description: 'Verified requests from the platform page that no agency holds yet. Assign one to an agency; it is notified by email.',
    tips: {
      // source: packages/tools/src/tools/platform-leads.ts:listPoolLeadsTool (status verified, no agency, newest 200); apps/web/.../leads/page.tsx
      pool: {
        title: 'What is in the pool',
        body: 'Requests from the platform\'s own page whose email address is verified and that no agency holds. The list shows the newest 200. A lead stays here until an agency is given it.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/tools/platform-leads.ts:assignLeadTool (staff; agency notified by email; refuses an agency that already holds the same visitor and business); leads/assign-form.tsx:agencyOptionLabel
      giving: {
        title: 'Giving a lead to an agency',
        body: 'Choose an agency and press Assign. Each agency in the list shows its active business types and active client count, so you can match the lead. The agency is emailed and the lead leaves the pool. Only owners and staff can do this, and an agency that already holds the same visitor and business is refused.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/platform-leads.ts:listPoolLeadsTool (declinedBack = decided_at set; assignLeadTool clears it)
      declined: {
        title: 'Returned leads',
        body: 'A lead marked "Declined by an agency" was given to an agency that sent it back. It is in the pool again and can go to a different agency.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      pool: {
        title: 'The pool is empty',
        body: 'Verified requests from the platform page appear here until an agency is given them.',
        audience: 'operator',
      },
      assigned: {
        title: 'Nothing assigned yet',
        body: 'The 20 most recent assignments appear here.',
        audience: 'operator',
      },
    },
  },
  'platform.reviews': {
    // source: apps/web/src/app/(platform)/platform/reviews/page.tsx (the page's existing description)
    description: 'Decisions the models weren’t sure about. Your answer fixes the event and becomes a gold label.',
    tips: {
      // source: packages/ai/config/ai.yaml (tag_decisions etc.: provider jev, escalate_to llm_decisions, min_confidence 0.85; verifier_decisions 0.85); packages/ai/src/decisions/cascade.ts (Jev first, low answers escalate, still-low keys need review)
      why: {
        title: 'Why a decision is here',
        body: 'Competitor changes are classified by a cascade. Jev answers first; any answer under 0.85 confidence goes to a language model; if that answer is also under 0.85, the question lands here for a person. The brief verifier uses the same 0.85 threshold.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(platform)/platform/reviews/review-queue.tsx ("Model said", confidence %); packages/engine/src/model-ops/resolve.ts:resolveDecisionReview (updates the event, writes decision_label rows); packages/tools/src/tools/model-ops.ts:listDecisionReviews (oldest first, 50)
      answer: {
        title: 'Answering a review',
        body: 'Each card shows the text before and after a competitor change, with one or more questions. "Model said" is the model\'s answer and its confidence; yours replaces it. Your answers fix the event and are stored as gold labels for measuring the models. The queue is oldest first, up to 50 at a time.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      queue: {
        title: 'Nothing waiting for review',
        body: 'When the models cannot settle a decision with enough confidence, it appears here for you to answer.',
        audience: 'operator',
      },
    },
  },
  'platform.themes': {
    // source: apps/web/src/app/(platform)/platform/themes/page.tsx (the page's existing description)
    description: 'New review topics found in reviews that didn’t fit any existing topic. Approved topics are asked for every review analysed from now on.',
    tips: {
      // source: packages/engine/src/reviews/discovery.ts:THEME_DISCOVERY_MIN_OTHER (20), THEME_DISCOVERY_DAYS (90), SYSTEM prompt (at least a fifth of the reviews share it), runReviewInsights (nightly); one pending proposal per business type
      source: {
        title: 'Where proposals come from',
        body: 'Each night, for every business type, reviews that matched no topic are collected. With at least 20 of them from the last 90 days since the last proposal, a model looks for one recurring topic that at least a fifth of them share, and proposes it. A business type has one open proposal at a time. "N reviews with no topic" is how many it looked at.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/reviews/discovery.ts:decideThemeProposal (approved topics are asked for reviews analysed from now on), prepareThemeDiscovery (rejected ids are never proposed again)
      decide: {
        title: 'Approving or rejecting',
        body: 'Approve a topic and it is asked for every review analysed from now on in that business type. Reject it and it is not proposed again. A decision cannot be undone from this page, and a proposal someone else already decided shows an error.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/themes.ts:DECIDED_WINDOW_DAYS (30)
      decided: {
        title: 'Recently decided',
        body: 'The table lists proposals approved or rejected in the last 30 days, with the business type, the decision and the date.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      queue: {
        title: 'No proposals waiting',
        body: 'When enough reviews fit none of a business type\'s topics, a proposed new topic appears here for you to approve or reject.',
        audience: 'operator',
      },
    },
  },
  'platform.ask': {
    // source: apps/web/src/app/(platform)/platform/ask/page.tsx (the page's existing description)
    description: 'Conversations from clients that allow review. Opening one is recorded in the audit log.',
    tips: {
      // source: packages/tools/src/platform.ts:listReviewableAskThreads (client.ask_review_allowed); apps/web/src/app/(app)/c/[clientId]/settings/profile/client-features-form.tsx
      allowed: {
        title: 'Which conversations appear',
        body: 'Only conversations of clients whose profile allows platform review. A client that has not allowed it never appears here, and its threads cannot be opened by id either. The list is newest first, 25 at a time.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/platform.ts:getReviewableAskThread (one audit_log row per view, tool platform_view_ask_thread, in the agency's audit trail)
      audit: {
        title: 'Opening a conversation is recorded',
        body: 'Every time you open a conversation, a row is written to the agency\'s audit log with your name and the time. Listing them is not recorded; opening is.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/platform.ts:listReviewableAskThreads (removed = sum of trace.removedSentences; error, refused, quota = a message with that status)
      flags: {
        title: 'The small badges',
        body: 'N removed: sentences the answer check removed from replies. error: a reply failed. refused: the assistant declined a question. quota: the client ran out of its question allowance.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      none: {
        title: 'No conversations to review',
        body: 'Conversations appear here once a client that allows review has asked the assistant a question.',
        audience: 'operator',
      },
    },
  },
  'platform.ask.thread': {
    description: 'A read-only copy of one conversation, as text only. Opening it was recorded in the audit log.',
    tips: {
      // source: apps/web/src/app/(platform)/platform/ask/[threadId]/page.tsx (kb: citations link to the knowledge article; trace and action are raw JSON)
      trace: {
        title: 'Citations and trace',
        body: 'Citations lists what a reply relied on; a kb: citation links to its knowledge article. Trace, where a message has one, is the assistant\'s own log of how it answered, and an action block is the raw detail of an action message. Both are shown as plain text.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/platform.ts:ReviewableAskMessage (role user, assistant, action; status ok, quota, refused, error, cancelled)
      status: {
        title: 'Message status',
        body: 'Each message shows its role (user, assistant or action) and a status: ok, quota (the question allowance was used up), refused, error or cancelled.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
  },
  'platform.knowledge': {
    // source: apps/web/src/app/(platform)/platform/knowledge/page.tsx (the page's existing description)
    description: 'Articles the Ask assistant can search and cite, at platform, agency and client level.',
    tips: {
      // source: apps/web/src/app/(platform)/platform/knowledge/scope-fields.tsx:LEVEL_OPTION, KIND_OPTION
      levels: {
        title: 'Levels and kinds',
        body: 'Level says who the article belongs to: Help (platform) for everyone, Agency for one agency, Client for one client. Kind is its type: help article, playbook, Q&A, blog post or fact. Use the filters to narrow the list.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/tools/help.ts:guideRows (status published); apps/web/.../knowledge/page.tsx (Draft, Published badges)
      status: {
        title: 'Draft or published',
        body: 'Only Published articles can be found and cited by the assistant. A Draft stays out of search until it is published.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(platform)/platform/knowledge/editor.tsx (source seed: "Managed in repo", read-only); packages/tools/src/kb/seed.ts (docs/help and the glossary are seeded by kb:seed)
      repo: {
        title: 'Managed in repo',
        body: 'Articles badged "Managed in repo" are the page guides and glossary terms seeded from the repository by kb:seed. They are read-only here: change the Markdown in the repo and seed again.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: apps/worker/src/jobs/kb.ts (kb-sync cron '0 5 * * 0'); apps/web/.../knowledge/sync-badge.tsx; knowledge/page.tsx (import panel only when kbImport is on)
      sync: {
        title: 'URL articles and auto-sync',
        body: 'An article imported from a web address (when URL import is switched on) can sync itself: it is re-read every Sunday at 05:00 UTC and updated if the page changed. The badge shows the last sync, "changed" when the text changed, or the reason a sync failed.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      none: {
        title: 'No articles yet',
        body: 'Write one with New article, or import one from a web address. Published articles can be found and cited by the assistant.',
        audience: 'operator',
      },
    },
  },
  'platform.knowledge.new': {
    description: 'Write an article the Ask assistant can search and cite. Pick who it belongs to, write it in Markdown, then keep it as a draft or publish it.',
    tips: {
      // source: apps/web/src/app/(platform)/platform/knowledge/editor.tsx (Write and Preview tabs, Save draft, Publish); scope-fields.tsx
      editor: {
        title: 'Writing an article',
        body: 'Choose the level (and the agency or client it belongs to), the kind, a title and the Markdown body. The Preview tab shows how it reads. Save draft keeps it out of search; Publish makes it findable by the assistant.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(platform)/platform/knowledge/editor.tsx (clientVisible checkbox, agency level only, default on)
      visibility: {
        title: 'Who can read it',
        body: 'For an agency-level article, "Visible to client users" decides whether that agency\'s clients can read it as well as its staff. It is on by default. Platform and client-level articles do not show the option.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
  },
  'platform.knowledge.detail': {
    description: 'Read or edit one article. Publish saves a change to a published article and queues it for the assistant\'s search index; Save draft takes it out of search.',
    tips: {
      // source: apps/web/src/app/(platform)/platform/knowledge/editor.tsx (source seed shows only "Managed in repo" and the rendered article)
      managed: {
        title: 'Managed in repo',
        body: 'This article is seeded from the repository, so it is shown read-only. To change it, edit its Markdown in the repo and run kb:seed again.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: apps/worker/src/jobs/kb.ts (kb-sync cron '0 5 * * 0'); editor.tsx (Auto-sync switch, Previous version, sync error)
      autosync: {
        title: 'Auto-sync',
        body: 'With auto-sync on, the article is re-read from its web address every Sunday at 05:00 UTC and updated when the page changed; the text before the last change is kept under Previous version. A sync error is shown in red. Turning auto-sync off keeps the current text.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(platform)/platform/knowledge/editor.tsx (delete confirmation: "Delete this article and its search index? This cannot be undone.")
      delete: {
        title: 'Deleting an article',
        body: 'Delete removes the article and its search index and cannot be undone. To take an article out of search but keep it, unpublish it instead.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
  },
  'platform.health': {
    // source: apps/web/src/app/(platform)/platform/health/page.tsx (Phase 7a1: worker, queues, vendors and sources; spend lives on Costs)
    description: 'Is the worker alive, are jobs flowing, and are the data sources fresh. Spend lives under Costs.',
    tips: {
      // source: apps/worker/src/health.ts (heartbeat cron every 5 minutes); packages/tools/src/platform/system-health.ts:healthStatuses (worker: Down with no heartbeat or over 30 minutes, Watch over 11 minutes)
      worker: {
        title: 'Worker status',
        body: 'The background worker records a heartbeat every 5 minutes. OK: the last one is under 11 minutes old. Watch: 11 to 30 minutes. Down: over 30 minutes, or no heartbeat yet.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/platform/system-health.ts:healthStatuses (queue: Down when the oldest waiting job is over 2 h; Watch over 30 min or any failure in 24 h)
      queues: {
        title: 'Queue status',
        body: 'One row per job queue. Watch: the oldest waiting job is over 30 minutes old, or a job failed in the last 24 hours. Down: the oldest waiting job is over 2 hours old. If the queue database cannot be read, the table says so and the worker shows Down.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/platform/system-health.ts:healthStatuses (vendor: errors/calls over 24 h; Watch at 20%, Down at 50% or no successful call in 48 h)
      vendors: {
        title: 'Vendor status',
        body: 'Vendors called in the last 48 hours. Watch: 20% or more of the calls in the last 24 hours failed. Down: 50% or more failed, or none succeeded in 48 hours.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/platform/system-health.ts:healthStatuses (source: Watch over 26 h since the last success, Down over 72 h or never)
      sources: {
        title: 'Source freshness',
        body: 'When data last arrived: the newest successful vendor call and the newest successful web capture. Watch: over 26 hours ago. Down: over 72 hours ago, or never.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
    },
  },
  'platform.costs': {
    // source: apps/worker/src/jobs/platform-costs.ts (daily snapshot cron '0 6 * * *', UTC); the old wording named the product, which the shared copy test forbids
    description: 'What it costs to run the platform: vendor balances, monthly spend and manual costs. API balances refresh daily at 06:00 UTC.',
    tips: {
      // source: packages/tools/src/platform/costs/math.ts:serviceStatus (low = remaining under the threshold, or days left at or under warn days), burnRate (balance drops over the last 14 days, needs two readings at least 12 hours apart); packages/tools/src/tools/platform-costs.ts (warnDays default 7); apps/web/.../costs/_components/services-table.tsx:STATUS_LABEL
      services: {
        title: 'Service status',
        body: 'OK: enough left. Low: the balance is under its low-balance threshold, or the days left are at or under the warning window (7 days unless you changed it). Error: the last reading failed. Unavailable on this plan: the vendor does not report this figure. Not configured: no reading yet. Off: tracking is switched off. Days left comes from how fast the balance fell over the last 14 days; with fewer than two readings it is blank.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/platform/costs/alerts.ts (one email to the owners when a service turns low; alertedAt cleared when it is OK again); apps/web/src/app/(platform)/layout.tsx (warning strip for owners)
      low: {
        title: 'Low balance warnings',
        body: 'When a service turns Low, platform owners are emailed once; the email is sent again only after the service has been OK and turned Low again. While any service is Low, owners also see a strip at the top of every platform page. The Warnings card counts the Low services.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/tools/platform-costs.ts (projectedMonthUsd = API spend so far / days elapsed x days in the month + manual costs)
      projected: {
        title: 'Projected this month',
        body: 'API spend so far this month divided by the days elapsed, times the days in the month, plus the manual costs for the month. It is a straight-line guess and moves a lot early in the month.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/tools/platform-costs.ts:MONTHS (6); packages/tools/src/platform/costs/math.ts:monthlySpend (balance services = sum of balance drops between readings; usage services = the last reading in the month); apps/web/.../costs/page.tsx caption
      monthly: {
        title: 'Monthly spend chart',
        body: 'The last six months, API usage and manual costs stacked. It is approximate: for balance services the spend is the sum of the drops between daily readings (top-ups are ignored), and a month with fewer than two readings counts as zero. Usage services use their last reading of the month.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/platform/costs/math.ts:manualMonthly (recurring: yearly / 12; one-off: its own month; archiving ends a recurring item that month); apps/web/.../costs/_components/cost-items-table.tsx
      manual: {
        title: 'About manual costs',
        body: 'Costs the vendors cannot report, such as hosting or a subscription. A monthly item counts every month, a yearly item counts one twelfth each month, and a one-off item counts in the month it starts. Archiving an item keeps it in past months\' totals and stops it counting later.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/tools/platform-costs.ts:aiByVertical (last 30 days, calls and cost per business type; merged and draft ids folded)
      ai: {
        title: 'About AI cost by business type',
        body: 'AI calls and their cost over the last 30 days, grouped by the business type they were for. A business type that was merged is counted under the one it was merged into, and a draft not yet created shows as a draft.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      manual: {
        title: 'No manual costs yet',
        body: 'Add costs the vendors cannot report, such as a hosting plan or a subscription, so the monthly totals are complete.',
        audience: 'operator',
      },
      ai: {
        title: 'No AI calls yet',
        body: 'AI calls tied to a business type in the last 30 days appear here with their cost.',
        audience: 'operator',
      },
    },
  },
  'platform.verticals': {
    // source: apps/web/src/app/(platform)/platform/verticals/page.tsx (the page's existing description)
    description: 'New business types and services agencies added. Approve what is right, fix what is not, or merge duplicates into an existing entry.',
    tips: {
      // source: packages/tools/src/tools/platform-verticals.ts:listCatalogReviewTool, countCatalogReviewTool (unreviewed business types except generic, and unreviewed services of reviewed types; the menu badge)
      queue: {
        title: 'What lands here',
        body: 'Business types and services that agencies created while setting up a client and that nobody has reviewed yet, with who added them, how many clients use them and the evidence behind them. The number on the menu item counts both lists.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/tools/platform-verticals.ts:reviewVerticalTool (approve also approves the unreviewed services it came with; rename keeps the id), reviewBusinessAreaTool; verticals/catalog-queue.tsx (Edit)
      approve: {
        title: 'Approving, renaming and editing',
        body: 'Approve marks a business type reviewed, together with the services it came with, or a single service reviewed. Rename changes the name and keeps the id. Edit (business types only) changes the keywords, Google categories, review topics and services before you approve. A name cannot include a client\'s business name, phone number, email or web address.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/platform-verticals.ts:mergeVerticalTool, mergeBusinessAreaTool (clients, events, prices, agency settings move; the old id keeps resolving); apps/web/.../verticals/page.tsx (default service mapping by normalised name); catalog-queue.tsx:MergeForm (Move)
      merge: {
        title: 'Merging',
        body: 'Merge into moves everything of the duplicate to the entry you pick: its clients, events, prices and agency settings. The old id keeps resolving to the target. For a business type you also say where each of its services goes; matching names are pre-filled and "Move" keeps a service as a new one. A service merges into another service of the same business type.',
        audience: 'operator',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(platform)/platform/verticals/page.tsx (canEdit = owner or staff); packages/tools/src/tools/platform-verticals.ts (staff)
      roles: {
        title: 'Who can change things',
        body: 'Platform owners and staff can approve, rename, edit and merge. Viewers can read the queue and the evidence but see no buttons.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      types: {
        title: 'Nothing to review',
        body: 'When an agency creates a new business type, it appears here for you to approve, fix or merge.',
        audience: 'operator',
      },
      services: {
        title: 'Nothing to review',
        body: 'When an agency adds a service to a business type, it appears here for you to approve, rename or merge.',
        audience: 'operator',
      },
    },
  },
  'platform.runbook': {
    // source: apps/web/src/app/(platform)/platform/runbook/page.tsx (the page's existing description)
    description: 'The standard plays, starting-point rules and settings every agency starts from. Agencies see your changes as updates they can take or keep their own version.',
    tips: {
      // source: apps/web/src/components/runbook/runbook-editor.tsx (Plays, Starting-point rules, Settings); packages/tools/src/tools/runbooks.ts (platform level is the root every agency runbook copies)
      standard: {
        title: 'The standard runbook',
        body: 'This is the runbook every agency starts from: plays (the recommendations a brief can suggest), starting-point rules and settings. Each agency gets its own copy, and each client can in turn get a copy of the agency\'s.',
        audience: 'operator',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/components/runbook/item-card.tsx:UpdatePrompts (Update available, Use the update, Keep mine, New, Removed upstream)
      updates: {
        title: 'How agencies get changes',
        body: 'Changing an item here does not rewrite an agency\'s copy. The agency\'s item shows Update available, and its admins choose to use the update or keep their own version. An item you add shows as New, and one you remove shows as Removed upstream.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(platform)/platform/runbook/page.tsx (canEdit = owner or staff); packages/tools/src/tools/runbooks.ts (write needs staff at platform level)
      edit: {
        title: 'Who can edit',
        body: 'Platform owners and staff can edit the standard runbook. Viewers can read it. Nobody can edit in a read-only support session.',
        audience: 'operator',
        guideAnchor: 'common-questions',
      },
    },
  },
} as const satisfies Record<`platform.${string}`, PageCopy>;
