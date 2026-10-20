import type { PageCopy } from '.';

/**
 * Short in-page help copy for agency-context pages (`agency.*`, incl. `agency.settings.*`); 15b-2 content tasks fill it.
 * Same rules as `client.ts`. Agency pages are reached only by agency roles, so nothing here needs `audience: 'agency'`;
 * the copy never names the platform (the agency's own white-label) and never carries operator-only details.
 * Batch A (Task 7): Portfolio, Add a client, Approvals, a brief's review, Alert review, Prospects, Add a prospect, a prospect, Leads.
 */
export const AGENCY_COPY = {
  'agency.portfolio': {
    // source: apps/web/src/app/(app)/agency/page.tsx:sortRows (alerts or a brief to approve first, then pressure score, then name)
    description: 'Every client at a glance, and what needs you today. Clients with an alert to check or a brief to approve come first, then the highest pressure.',
    tips: {
      // source: packages/tools/src/pressure.ts:combinePressure, pressureByClient (PRESSURE_WINDOW_DAYS); packages/tools/src/tools/portfolio.ts:getPortfolio (client = its strongest competitor)
      pressure: {
        title: 'Competitive pressure',
        body: "How much the client's busiest competitor has been doing lately, from 0 to 100: its changes from the last 30 days that made the brief or an alert, plus its open moves. The label reads High pressure (70 and above), Medium pressure (40 to 69), Low pressure (1 to 39) or Quiet (0). The line under it names that competitor and the main reasons.",
      },
      // source: packages/tools/src/tools/usage.ts:spendView, packages/tools/src/limits.ts:SPEND_WARNING_RATIO (0.8), packages/db usage.ts:monthStart
      budget: {
        title: 'Budget',
        body: "This month's AI and data spend for the client as a share of its monthly cap. It turns amber from 80% (near cap) and red at 100% (over cap).",
      },
      // source: packages/tools/src/tools/portfolio.ts:getPortfolio (pending_review alerts; alerts delivered in the last 7 days; newest brief with status ready)
      alertsBriefs: {
        title: 'Alerts and briefs',
        body: 'Alerts counts the alerts held for your check (clients set to "I review alerts first"); the line under it is how many were sent to that client in the last 7 days. Brief shows the newest brief that needs review. Open either one from the table.',
      },
      // source: packages/tools/src/tools/portfolio.ts:getPortfolio (recommendation status todo, in_progress)
      openActions: {
        title: 'Open actions',
        body: 'Recommendations for the client that are still To do or In progress. Click the number to open them.',
      },
      // source: apps/web/src/components/setup-badge.tsx:openSetupSteps; packages/tools/src/tools/portfolio.ts:getPortfolio (done or skipped steps of the open setup)
      setup: {
        title: 'The setup chip',
        body: "Shows while a client's setup is still open: how many setup steps are done or skipped out of the total. Click it to continue the setup.",
      },
      // source: apps/web/src/components/agency/onboarding-checklist.tsx:OnboardingChecklist (ITEMS: five steps); apps/web/src/app/(app)/agency/page.tsx (agency admins only)
      checklist: {
        title: 'The checklist',
        body: 'Agency admins see a getting-started card with five steps: complete your agency profile, invite your team, review your plan, add your logo and colours, and add your first client. It goes away when all five are done or when you dismiss it.',
      },
    },
    empty: {
      noClients: { title: 'No clients yet', body: 'Add a client by searching for its business. A short setup then finds its competitors, invites the owner and sets up billing, and its first brief follows.' },
      noClientsScoped: { title: 'No clients yet', body: 'The clients you are assigned to show here. Ask an agency admin to add a client or to give you access to one.' },
    },
  },
  'agency.clients.new': {
    description: 'Search for the business on Google Maps and create the client from its listing. A short setup follows, where you pick the competitors to monitor.',
    tips: {
      // source: apps/web/src/app/(app)/c/[clientId]/setup/page.tsx:STEP_LABEL (profile, search, competitors, invite, billing); packages/tools/src/tools/setup.ts (a prospect has no billing step)
      steps: {
        title: 'What happens next',
        body: 'Creating the client opens its setup. The steps are Your business, Finding competitors, Pick competitors, Invite the owner and Billing. The invite and billing steps can be skipped and finished later.',
      },
      businessType: {
        title: 'About business types',
        body: "The kind of business, such as HVAC and plumbing or dental. It sets the topics, plays and alert levels the client starts with, and the services you can pick. If none fits, create a new business type from the listing; it is reviewed later and may be merged into an existing one.",
      },
      byHand: {
        title: "If the business isn't listed",
        body: 'Choose "Can\'t find it? Enter details by hand" under the search to fill in the name, business type, time zone and service area yourself. Search first when you can: it fills in the details from the listing.',
      },
    },
  },
  'agency.approvals': {
    // source: packages/engine/src/briefs/schedule.ts:BRIEF_LOCAL_WEEKDAY (Thursday, client time); apps/web/src/app/(app)/agency/approvals/[briefId]/review-controls.tsx:AutoSendSwitch (Monday 07:00)
    description: "{assistant} drafts each client's brief on Thursday night, in the client's time zone. Review and approve it for Monday 07:00. Clients set to auto-send get untouched briefs then without your approval.",
    tips: {
      // source: apps/web/src/app/(app)/agency/approvals/status.ts:STATUS_LABEL
      status: {
        title: 'Status',
        body: 'Needs review: drafted and waiting for you. Approved: it goes out Monday 07:00. Sent: delivered to the client. Drafting: still being written. Failed — retrying: the draft failed and will run again.',
      },
      // source: packages/tools/src/tools/review.ts:listBriefQueue (activeItems, droppedItems, touched, autoSend, kind quiet)
      items: {
        title: 'Items and badges',
        body: 'The count shows items still in the brief and items removed from it (by the fact-check or by you). Edited means someone changed the draft. Auto-send means the client gets an untouched brief on Monday 07:00 without approval. Quiet week means no significant competitor moves.',
      },
    },
    empty: {
      noBriefs: { title: 'Nothing to review this week', body: "Each client's brief appears here after {assistant} drafts it on Thursday night. Open it to check every item against its evidence, then approve it." },
    },
  },
  'agency.approvals.detail': {
    description: 'Check each item against its evidence, edit or remove what you do not want, then approve. The client sees only the items that remain.',
    tips: {
      // source: apps/web/src/components/confidence-label.ts:confidenceLabel (HIGH_CONFIDENCE 0.85, one band)
      confidence: {
        title: 'Confidence',
        body: 'How sure the draft is about an item, as a percentage. At 85% and above it reads "High confidence" and gets an amber edge; below that it reads "Confidence". It is a prompt to look closer, not a verdict.',
      },
      // source: apps/web/src/app/(app)/agency/approvals/[briefId]/page.tsx (factCheck.sentences, factCheck.items)
      factCheck: {
        title: 'Fact-check',
        body: "Every sentence left in the brief was checked against saved evidence. When the check removed a sentence or an item because it could not prove it, the page says how many.",
      },
      // source: packages/tools CLAUDE.md / spec §8.5: upsell_tag never reaches client-facing reads
      upsell: {
        title: 'Upsell tag',
        body: 'The upsell tag marks an item that points to a service you could sell. Only you see it: it is never part of the brief the client reads.',
      },
      // source: packages/tools/src/tools/review.ts:approveBriefTool, sendBriefNowTool, setBriefAutoSend; review-controls.tsx:ReviewFooter
      approving: {
        title: 'What approving does',
        body: 'Approving schedules the brief for Monday 07:00 in the client\'s time zone, and its items become the client\'s recommendations. A starting-point brief is sent straight away. Send now approves it if needed and sends it to the client\'s recipients at once. The Monday auto-send switch is for clients whose untouched briefs you trust.',
      },
      // source: review-controls.tsx:RateButtons, packages/tools/src/tools/review.ts (rate tool: useful or not, per item)
      rating: {
        title: 'Rating items',
        body: 'Useful and Not useful record your feedback on one item. You can rate an item at any time, even after the brief is sent.',
      },
    },
  },
  'agency.alerts': {
    // source: packages/engine/src/alerts/create.ts:ALERT_REVIEW_EXPIRY_DAYS (7); alert level default 70 (packages/verticals routing.alert, set per client under Alert rules)
    description: 'Alerts for clients set to "I review alerts first". Approve one to send it to the client, or dismiss it with a reason. Unreviewed alerts expire after 7 days.',
    tips: {
      // source: packages/engine/src/runbook/store.ts:defaultThresholds (alert 70 unless the agency, platform or client sets another level); packages/engine/src/alerts/route.ts (notifyAm shows the score)
      score: {
        title: 'Score',
        body: "How much the change matters to the client, from 0 to 100. A change becomes an alert at the client's alert level, which is 70 unless you changed it under Alert rules.",
      },
      // source: packages/engine/src/alerts/route.ts:ALERTS_PER_DAY (3), releaseAlert; packages/engine/src/alerts/digest.ts:DIGEST_LOCAL_HOUR (17)
      digest: {
        title: 'Held for the digest',
        body: "A client gets at most 3 instant alerts a day. When you approve one past that limit, it goes in the client's 17:00 digest (client time) instead of being sent at once. Held alerts can only be dismissed.",
      },
      // source: apps/web/src/app/(app)/agency/alerts/alert-controls.tsx:AlertCard (written === 'template')
      template: {
        title: 'Evidence summary text',
        body: "{assistant} writes each alert and checks its wording against the evidence. When it can't verify the wording, the alert uses the plain evidence summary instead. It is safe to send, just less polished.",
      },
    },
    empty: {
      noAlerts: { title: 'No alerts waiting — nice.', body: 'Alerts appear here for clients set to "I review alerts first" when a change scores at their alert level. Clients in other alert modes get theirs without a check.' },
    },
  },
  'agency.prospects': {
    description: "Businesses you're pitching. A snapshot shows how they stack up locally. Nothing is monitored until you convert them.",
    tips: {
      // source: apps/web/src/app/(app)/agency/prospects/page.tsx:isReady (keywords > 0, service area set, competitors > 0)
      ready: {
        title: 'Ready to snapshot',
        body: 'A check mark means the prospect has at least one keyword, a service area and at least one competitor, which is what a snapshot needs. "Needs setup" means one of them is missing; open the prospect to see which.',
      },
      // source: packages/tools/src/tools/prospects.ts:listProspects (report.status), apps/web prospects/page.tsx
      snapshot: {
        title: 'Snapshot status',
        body: 'Shows the latest snapshot for the prospect: running while it is being built, ready when you can open the landscape, failed if it did not finish (run it again). A dash means none has been run.',
      },
    },
    empty: {
      noProspects: { title: 'No prospects yet', body: "Add a business you're pitching, pick its competitors and run a snapshot to show how it compares locally. Convert it to a client when it signs." },
      noProspectsScoped: { title: 'No prospects yet', body: 'Ask an agency admin to add a prospect. Prospects you are assigned to show here.' },
    },
  },
  'agency.prospects.new': {
    description: 'Search for the business, then add its keywords and service area so we can find its competitors.',
    tips: {
      // source: packages/tools/src/tools/prospects.ts:convertProspect (status active starts monitoring); docs/gotchas-cross-cutting.md (prospects get no recurring work)
      prospect: {
        title: 'What a prospect is',
        body: 'A business you are pitching. A prospect has no weekly monitoring, alerts or briefs: you pick its competitors and run a one-off snapshot, then convert it to a client when it signs.',
      },
      businessType: {
        title: 'About business types',
        body: 'The kind of business, such as HVAC and plumbing or dental. It sets which services you can pick and what the competitor search looks for.',
      },
      // source: apps/web/src/app/(app)/agency/prospects/new/actions.ts (redirects to the setup); packages/tools/src/tools/setup.ts (a prospect has no billing step)
      next: {
        title: 'What happens next',
        body: "After you create the prospect, its setup opens: Your business, Finding competitors, Pick competitors and Invite the owner. A prospect has no billing step. Then run a snapshot from the prospect's page.",
      },
    },
  },
  'agency.prospects.detail': {
    description: 'Find their competitors, run a one-off snapshot, and show the landscape. Nothing is monitored until you convert them.',
    tips: {
      // source: apps/web/src/app/(app)/agency/prospects/[clientId]/page.tsx (blockers); packages/tools/src/tools/prospects.ts:runProspectSnapshotTool
      steps: {
        title: 'The four steps',
        body: 'Profile, Competitors, Snapshot, Convert. The snapshot needs at least one keyword, a service area and at least one competitor; the page lists what is missing. You can run it again later for a fresh look.',
      },
      // source: apps/web/src/components/prospect-landscape.tsx (generatedAt footer: Google Business Profile, ad-library and Google Maps data, 3x3 grid, no AI-written text)
      snapshot: {
        title: 'What the snapshot shows',
        body: "A Google profile and ads table, and how the business and its competitors show on Google Maps across a 3 by 3 grid of the service area. It is built from Google Business Profile, ad-library and Google Maps data with no AI-written text, and usually takes a few minutes.",
      },
      // source: packages/tools/src/tools/prospects.ts:convertProspect; packages/billing/src/access.ts:assertCanActivateClient
      convert: {
        title: 'What converting does',
        body: "Converting turns the prospect into an active client: weekly monitoring, alerts and briefs start, and it counts as a client on your plan. If your plan is at its client limit, or your billing needs attention, the page says so and an agency admin can upgrade. If the setup's last step is still open, it reopens at billing.",
      },
    },
  },
  'agency.leads': {
    description: 'Businesses that asked for a competitor snapshot, through your intake link or assigned to you from the platform. Accept one to set it up as a prospect and invite the contact.',
    tips: {
      // source: apps/web/src/app/(app)/agency/leads/page.tsx:TABS (New = verified, Accepted, Declined; counts)
      tabs: {
        title: 'Lead tabs',
        body: 'New holds leads whose contact has confirmed their email and that you have not decided on. Accepted and Declined hold the ones you decided on. The number is how many leads are in each tab.',
      },
      // source: apps/web/src/app/(app)/agency/leads/lead-card.tsx:sourceLabel
      source: {
        title: 'Where leads come from',
        body: '"From your website" means the contact used your intake link. "From the platform" means the lead was assigned to you from the shared lead pool.',
      },
      // source: packages/tools/src/tools/leads.ts:acceptLead (creates a prospect, starts its setup, invites the contact as client owner), declineLead
      decide: {
        title: 'Accepting or declining',
        body: 'Accept and invite creates the business as a prospect, starts its setup and emails the contact an invitation as the client owner. Pick the business type first. Decline closes the lead; for a lead from your link you can tick "Let them know" to tell them. A declined lead from the platform goes back to the pool and the contact is not emailed.',
      },
      // source: apps/web/src/app/(app)/agency/leads/lead-card.tsx:Preview
      preview: {
        title: 'Lead snapshot',
        body: 'A short preview of how the business shows locally. While it is still being built the card says so, and some leads have none.',
      },
    },
    empty: {
      newLeads: { title: 'No new leads', body: 'Share your intake link to start getting them. New requests appear here once the contact confirms their email.' },
      accepted: { title: 'No accepted leads yet', body: 'Leads you accept appear here with a link to their setup.' },
      declined: { title: 'No declined leads', body: 'Leads you decline appear here.' },
    },
  },
} as const satisfies Record<`agency.${string}`, PageCopy>;
