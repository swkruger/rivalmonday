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
      // source: apps/web/src/lib/labels.ts:BRIEF_STATUS
      status: {
        title: 'Status',
        body: 'Ready for review: drafted and waiting for you. Approved: it goes out Monday 07:00. Sent: delivered to the client. Drafting: still being written. Failed — retrying: the draft failed and will run again.',
      },
      // source: packages/tools/src/tools/review.ts:listBriefQueue (activeItems, droppedItems, touched, autoSend, kind quiet)
      items: {
        title: 'Items and badges',
        body: 'The count shows items still in the brief and items removed from it (by the fact-check or by you). Edited means someone changed the draft. Auto-send means the client gets an untouched brief on Monday 07:00 without approval. Quiet week means no significant competitor moves.',
      },
    },
    empty: {
      noBriefs: { title: 'No briefs this week', body: "Each client's brief appears here after {assistant} drafts it on Thursday night. Open it to check every item against its evidence, then approve it." },
      nothingWaiting: { title: 'Nothing is waiting for your review', body: 'Nothing below needs a decision from you right now.' },
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
    description: 'Alerts for clients set to "I review alerts first". Approve one to send it to the client, or dismiss it with a reason. Unreviewed alerts expire after 7 days. The list shows the oldest 200; filter by client to see more.',
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
  'agency.settings.ai': {
    description: 'Connect Claude, ChatGPT or another AI assistant to every client you can access. When it matters, it asks which client you mean.',
    tips: {
      // source: apps/web/src/components/ai-connections.tsx:ConnectorUrlCard (Claude, ChatGPT and Claude Code steps)
      connector: {
        title: 'Adding the connector',
        body: 'Paste the connector URL into your AI assistant, then sign in and choose this workspace. Claude and ChatGPT add it from their Connectors settings. For Claude Code, create a token first and run the command shown; its server name is made from your agency name.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/components/ai-connections.tsx:AccessTokensCard, ShownOncePanel, RevokeTokenButton
      tokens: {
        title: 'What a token is',
        body: 'A token is a password for tools that cannot sign in, such as Claude Code or a script. It acts as you, with the access level you choose. It is shown once when you create it, so copy it straight away. Revoke it at any time and anything using it stops working.',
        guideAnchor: 'common-questions',
      },
      // source: packages/core/src/tokens.ts:grantableScopes (agency roles: read, feedback, manage), effectiveScope; packages/core/src/tools.ts:mcpScopeOf; packages/tools/src/tools/alert-rules.ts:setAlertRules (manage); apps/web/src/components/ai-connections.tsx:ACCESS_LABEL
      levels: {
        title: 'Permission levels',
        body: "Read only lets an assistant look things up. Read and feedback also lets it record feedback, such as changing a recommendation's status. Read, feedback and manage also lets it make changes that need manage permission, such as setting a client's alert levels. A token or connected app never gets more than your own role allows.",
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/agency/settings/ai/page.tsx (admin sees every member's tokens and apps); components/ai-connections.tsx:ConnectedAppsCard, DisconnectButton
      apps: {
        title: 'Connected apps',
        body: 'Apps that were connected by signing in, rather than with a token. Each shows its access level and which workspace it can reach. Disconnect removes its access straight away, and the app has to ask again next time. Admins see everyone\'s tokens and apps in the agency; account managers see their own.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noTokens: { title: 'No access tokens yet', body: 'Create one when a tool such as Claude Code needs access. Assistants you connect by signing in, like Claude or ChatGPT, do not need a token.' },
      noApps: { title: 'No connected apps yet', body: 'Paste the connector URL into Claude or ChatGPT and sign in. The app then shows up here.' },
    },
  },
  'agency.settings.billing': {
    description: 'Your plan and how many clients it covers, your next invoice, and how your own clients pay you.',
    tips: {
      // source: apps/web/src/app/(app)/agency/settings/billing/page.tsx (plan line and Clients line, read from get_billing_summary); packages/db filters.ts:clientServiceable (active and not paused); packages/billing/src/seats.ts:syncSeats (extra = active - included; increase prorates now, decrease at renewal); packages/billing/src/access.ts:TRIAL_ACTIVE_CLIENTS (1); plan prices come from the plan row (packages/billing/src/seed.ts holds only the seeded default)
      plan: {
        title: 'Your plan and clients',
        body: 'The plan card shows your monthly price, how many clients the plan includes and the price of each extra client. Read the figures there: plans can be priced differently. A client counts toward the included number when it is active and not paused; prospects and paused clients do not count, and the Clients line shows the count. Going over the included number bills each extra client at the price on the card (an increase is prorated at once, a decrease applies at the next renewal). If you signed up yourself, a trial allows 1 active client until you add a payment method.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(app)/agency/settings/billing/page.tsx:keyDate, lib/labels.ts:BILLING_STATE; packages/billing/src/state.ts:PAST_DUE_TO_READ_ONLY_DAYS (7), READ_ONLY_TO_SUSPENDED_DAYS (30); packages/billing/src/access.ts:decide; packages/tools/src/billing-guard.ts
      status: {
        title: 'Billing status',
        body: 'Pilot and Free trial are free periods; the end date is shown. Active: paid up. Payment overdue: a payment failed or the trial ended without a card. Everything still works, but you cannot add active clients, and service pauses 7 days after it went overdue (the page shows the date). Read-only: history stays viewable, but monitoring, briefs, alerts and the assistant stop. Suspended follows 30 days later: only this page works, and your data is kept. Cancelled: access ends on the date shown. A successful payment makes the account Active again at once.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/agency/settings/billing/page.tsx (nextInvoice: amountDueCents, periodEnd, discountCents; recentInvoices)
      invoice: {
        title: 'Next invoice',
        body: 'The amount and date of your next invoice: the plan price plus any extra clients, less a discount if you redeemed a code. Recent invoices lists past payments, each with a link to open the invoice.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(app)/agency/settings/billing/client-billing/section.tsx, defaults-form.tsx (price, setup fee, pause unpaid clients after 1 to 90 days); packages/db filters.ts:clientServiceable
      clientBilling: {
        title: 'About client billing',
        body: 'Connect your own Stripe account to bill your clients for monitoring: payments go straight to you, not through your plan. Once connected, set the default monthly price and setup fee, and optionally pause unpaid clients after a number of days (1 to 90). A new price applies to new sign-ups; existing subscriptions are unchanged. A paused client is no longer monitored and stops counting toward your plan.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(app)/agency/settings/billing/redeem-form.tsx; page.tsx (discount line, nextInvoice.discountCents)
      discount: {
        title: 'Discount codes',
        body: 'If you have a discount code, enter it and choose Redeem code. The discount then shows on the plan card and in the amount of your next invoice.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noInvoices: { title: 'No invoices yet', body: 'Invoices appear here after the first payment, each with a link to open it.' },
    },
  },
  'agency.settings.branding': {
    description: 'Make the app and your emails look like your agency. Set the name, logo and colours your clients see, who emails come from, and what the assistant is called.',
    tips: {
      // source: packages/email/src/branding.ts:resolveBranding (displayName falls back to the agency name; 80 characters); packages/tools/src/settings.ts:getAgencyBranding, LIMITS
      displayName: {
        title: 'Display name',
        body: "The name your clients see in the app, on your intake page and in emails. Leave it blank and they see your agency's registered name. Up to 80 characters.",
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/components/agency/branding-editor.tsx (logo URL, upload types, Mark fallback); apps/web/src/server/logo.ts:LOGO_MAX_BYTES (512 KB), MAX_SIDE (512)
      logo: {
        title: 'Logo',
        body: 'Paste an https link to your logo, or upload a PNG, JPEG, WebP or SVG up to 512 KB; an upload is resized to fit 512 by 512 pixels and saved as a PNG. With no logo, your display name is shown as text instead.',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/email/src/branding.ts:resolveBranding (color: six-digit hex else the default); branding-editor.tsx (amber accent note)
      colours: {
        title: 'Colours',
        body: "Primary and secondary colour take a six-digit hex code such as #47A8E7. A value that is not a valid code falls back to the default. The amber accent is fixed and can't be changed.",
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/email/src/branding.ts:resolveBranding (fromName falls back to displayName; signOff 300 characters); branding-editor.tsx (no sending address field)
      sender: {
        title: 'Email sender',
        body: 'The from-name is the name on the emails your clients receive. If you leave it blank it is your display name. The sign-off is a line added at the end of those emails, up to 300 characters. The sending address is not set on this page.',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/settings.ts:LIMITS (assistantName 30); apps/web/src/server/theme.ts:themeForViewer (default name when blank)
      assistant: {
        title: 'Naming your assistant',
        body: 'What your clients call the Ask assistant, up to 30 characters. Leave it blank to use the default name shown in the box.',
        guideAnchor: 'common-questions',
      },
    },
  },
  'agency.settings.intake': {
    description: 'A public page where businesses ask for a free competitor snapshot. New requests appear under Leads.',
    tips: {
      // source: apps/web/src/components/agency/intake-link-card.tsx (Copy link, Copy button HTML, buttonHtml uses the primary colour); packages/tools/src/tools/leads.ts (leads are listed once the contact confirms their email)
      link: {
        title: 'Your link',
        body: 'The public page for your agency, at the address shown. Visitors search for their business and ask for a free competitor snapshot; once they confirm their email you decide under Leads. Copy link gives you the address, and Copy button HTML gives a ready-made button for your website in your primary colour.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/tools/leads.ts:SLUG_RE (3-40 characters), updateIntakeLink (rename replaces the slug in place; first creation derives it from the agency name; RESERVED_SLUGS, slug_taken); packages/tools/src/intake/public.ts:resolveIntake (looks up the current slug only); apps/web/src/app/start/[slug]/page.tsx (unknown slug is a 404)
      name: {
        title: 'Link name',
        body: 'The last part of your address: 3 to 40 lowercase letters, digits or hyphens. If you leave it empty the first time, it is made from your agency name. If you rename it, the old address stops working: visitors to it see a "page not found", and the old address does not redirect to the new one. Update the link on your website, and copy the button HTML again. A name that is taken or reserved is refused.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/components/agency/intake-link-card.tsx (switch, "Switched off" line); packages/tools/src/intake/public.ts:resolveIntake (enabled = true required)
      switch: {
        title: 'Switching the link off',
        body: 'Turn off the switch and the address shows a "page not found" page. Leads you already have stay under Leads. Switch it back on whenever you like; the address does not change.',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/tools/leads.ts:intakeLinkState (newThisMonth = leads from this link verified since the start of the UTC month; accepted = accepted leads from this link)
      counts: {
        title: 'Lead counts',
        body: 'New this month counts leads from this link whose contact confirmed their email since the start of the month (UTC). Accepted counts every lead from this link that you have accepted.',
        guideAnchor: 'what-this-page-tells-you',
      },
    },
  },
  'agency.settings.intake.preview': {
    description: 'What visitors see on your intake page. Nothing here can be submitted.',
    tips: {},
  },
  'agency.settings.platform-access': {
    description: 'Every time platform support opened a read-only session on your agency, and why.',
    tips: {
      // source: packages/tools/src/platform/support.ts:SUPPORT_SESSION_MINUTES (60), startSession; packages/tools/src/tools/support.ts:startSupportSession (reason 5 to 300 characters, audited into the target agency); packages/core/src/tools.ts:READ_ONLY_SESSION_MESSAGE, AuditEvent (role platform_support)
      sessions: {
        title: 'What a support session is',
        body: "A support session is when platform support opens your agency to help with a problem. A session lasts at most 60 minutes, is read-only so nothing can be changed, and starts with a reason you can read in this list. Everything done in a session is recorded in your agency's audit log.",
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/tools/support.ts:setSupportAccessNotify (emails the agency admins); packages/db/src/schema/tenancy.ts:notifySupportAccess (default off)
      notify: {
        title: 'Email alerts',
        body: 'Switch this on to get an email whenever platform support opens a session on your agency. The emails go to your agency admins. It is off until you turn it on.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/components/support-sessions-table.tsx:END_REASON; packages/tools/src/platform/support.ts:resolveSession, startSession
      endReasons: {
        title: 'End reasons',
        body: "Exited: support ended the session. Timed out: it reached 60 minutes. Replaced by a new session: support opened another one. Access revoked: the support person's platform access was removed during the session. Open means it has not ended yet.",
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noSessions: { title: 'No support sessions', body: 'Platform support has not opened a session on your agency. If it does, the date, the person, the reason and how it ended are listed here.' },
    },
  },
  'agency.settings.runbook': {
    description: 'How {assistant} words its recommendations, which starting-point rules apply and the settings behind them. Clients start from this runbook and can customise their own copy.',
    tips: {
      // source: apps/web/src/components/runbook/runbook-editor.tsx (Plays, Starting-point rules, Settings); knob-card.tsx:KNOB_TITLE; item-card.tsx:EnabledSwitch
      sections: {
        title: 'Plays, rules and settings',
        body: 'Plays are the recommendations a brief can suggest, each with a trigger and a template. Starting-point rules shape a client\'s first brief. Settings cover the alert and brief thresholds, focus services and competitor tiers. Switch an item off to leave it out.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/components/runbook/item-card.tsx:badgeFor, parentName (the platform level is called "standard runbook")
      badges: {
        title: 'Customised and inherited',
        body: 'Each item has a badge that compares it with the standard runbook that came with the platform. Inherited means it matches; Customised means someone on your team changed it. Edit changes a play\'s title and template.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/components/runbook/item-card.tsx:UpdatePrompts (Review update, Use the update, Keep mine, Add, Not now, Keep, Remove)
      updates: {
        title: 'Updates from the standard runbook',
        body: 'When the standard runbook changes an item you inherited, it shows Update available. Review update shows what changed, and your own version if you customised it. Use the update takes the new text; Keep mine leaves yours as it is. A New item offers Add or Not now; one the standard runbook dropped offers Keep or Remove.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/agency/settings/runbook/page.tsx (canEdit = agency_admin); packages/tools runbook tools (admin gate)
      edit: {
        title: 'Who can edit',
        body: 'Only agency admins can change the agency runbook. Account managers can read it.',
        guideAnchor: 'common-questions',
      },
      // source: packages/engine/CLAUDE.md § Runbooks (loadClientRunbook order: client runbook, then legacy overrides, then the agency runbook for business types without their own plays, HVAC and dental stay legacy); apps/web/src/components/runbook/item-card.tsx:UpdatePrompts
      clients: {
        title: 'How clients get it',
        body: "Clients whose business type has no built-in plays use this runbook directly. HVAC and dental clients keep the built-in plays until they get a runbook of their own. A client runbook is a copy of this one, with the plays tailored to the client. Changing this runbook does not rewrite a client's copy: the client shows Update available and chooses.",
        guideAnchor: 'common-questions',
      },
    },
  },
  'agency.settings.slack-teams': {
    description: 'Post agency notices, such as a brief ready for review, to a Slack or Teams channel.',
    tips: {
      // source: packages/engine/src/delivery/settings.ts:webhookUrlProblem (https only, hooks.slack.com; Teams *.webhook.office.com, *.logic.azure.com, *.environment.api.powerplatform.com); apps/web/src/app/(app)/agency/settings/slack-teams/webhook-controls.tsx:AddWebhookForm
      how: {
        title: 'Getting a webhook URL',
        body: 'A webhook URL is a private web address that lets notices be posted to one channel. In Slack, create an incoming webhook for the channel and copy its URL (it starts with https://hooks.slack.com/). In Teams, create a Workflows or incoming webhook for the channel and copy its URL (the address ends in webhook.office.com, logic.azure.com or environment.api.powerplatform.com). Choose the matching Kind, paste the URL and choose Add webhook. Only https addresses on those hosts are accepted.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(app)/agency/settings/slack-teams/webhook-controls.tsx:AGENCY_KIND_OPTIONS (mirrors packages/db AGENCY_KINDS); page.tsx ("All agency notices")
      kinds: {
        title: 'Which notices',
        body: 'Tick the notices a channel should get, or tick none to send it all agency notices. The notices are: client alerts (agency), brief ready for review, brief failed, brief overdue, competitor suggestions ready, client updated their setup, setup waiting on you, quarterly report and rank scan skipped.',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/settings.ts:listWebhooks (url never returned; host only)
      secret: {
        title: 'Your webhook URL is private',
        body: 'The URL works like a password, so it is saved but never shown again: the table lists only its host. To change a URL, add a new webhook and switch the old one off.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/agency/settings/slack-teams/webhook-controls.tsx:WebhookToggle; packages/tools/src/settings.ts:setWebhookActive
      off: {
        title: 'Turning one off',
        body: 'The Active switch stops posts to that channel without deleting the webhook. Switch it on again whenever you like.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noWebhooks: { title: 'No webhooks yet', body: 'Add one below to post agency notices, such as a brief ready for review, to a Slack or Teams channel.' },
    },
  },
  'agency.settings.team': {
    description: 'Who can work in your agency and what they can do. Invite people by email and choose a role.',
    tips: {
      // source: apps/web/src/lib/labels.ts:MEMBERSHIP_ROLE; packages/tools/src/access/team.ts:canManage, inviteMember (admins manage everyone; account managers manage client roles of clients they cover)
      roles: {
        title: 'Roles',
        body: 'Agency admin: runs the agency, including billing, branding and the team. Account manager: works with clients, and can be limited to chosen clients. Client owner and Client viewer: people at one client; an owner can do more than a viewer, and both see only their own client. Admins manage everyone. Account managers manage the client owners and viewers of the clients they cover, so that is all they see here.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(app)/agency/settings/team/invite-form.tsx (Assigned clients, none ticked = all clients); team/page.tsx:scopeLabel; apps/web/src/app/(app)/agency/clients/new/page.tsx and leads/page.tsx (clientScope all)
      scope: {
        title: 'Assigned clients',
        body: 'When you invite an account manager, tick the clients they cover, or tick none to cover all clients. An account manager who covers only some clients sees only those clients, and cannot add clients or prospects or see leads.',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/access/invitations.ts:INVITATION_TTL_DAYS (14); packages/tools/src/access/team.ts:inviteMember (already has access at that scope), resendInvitation, RESEND_LIMIT (3 per 24 h)
      invitations: {
        title: 'Invitations',
        body: 'An invitation is an email asking the person to sign in with that address; it works for 14 days. Each row shows when it was sent and when it expires. Resend emails it again and gives it another 14 days, up to 3 times a day. Revoke cancels it. Someone who already has access at that level cannot be invited again: remove them first to change their role.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/agency/settings/team/invite-form.tsx:RemoveMemberButton (dialog text); packages/tools/src/access/team.ts:revokeMembership (an agency needs at least one admin)
      removing: {
        title: 'Removing someone',
        body: 'Removing a person ends their access to this agency at once, and links already sent to them stop working. An agency needs at least one admin, so the last admin cannot be removed.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noMembers: { title: 'No members yet', body: 'The people you can manage appear here. Invite someone below with their email and a role.' },
      noInvites: { title: 'No pending invitations', body: 'Invitations you send appear here until they are accepted or expire after 14 days.' },
    },
  },
  'agency.settings.usage': {
    description: "This month's AI and data spend for each client against its monthly cap, and the limits you set for it. Months run on UTC.",
    tips: {
      // source: packages/tools/src/tools/usage.ts:getUsage (llm_call and vendor_call cost tied to the client since packages/db monthStart, UTC; agencyLevelSpend); apps/web/src/app/(app)/agency/settings/usage/page.tsx (footnote)
      spend: {
        title: 'What spend includes',
        body: "The AI and data costs tied to the client so far this month, against its monthly cap. The month is a UTC calendar month. Shared monitoring of competitors (Google profile, reviews, ads) and the intelligence engine's shared work are not split across clients yet, so they are not in these figures. If you cover all clients, spend that is not tied to a client is listed under the table.",
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/limits.ts:SPEND_WARNING_RATIO (0.8); packages/tools/src/usage.ts:spendLevel; apps/web/src/components/spend-badge.tsx; packages/collectors/src/rankings/budget.ts (the only cap check: a map rank scan that would go over the cap is skipped)
      share: {
        title: 'Near cap and over cap',
        body: "The share is spend divided by the client's cap. It turns amber, labelled near cap, from 80% and red, labelled over cap, at 100% or more; the two tiles count the clients in each state. The cap is a warning level, not a hard stop: the only thing that checks it is the map rank scan, which skips a scan that would take the client over.",
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/agency/settings/usage/page.tsx (competitors of competitorLimit, Over limit); packages/tools/src/tools/usage.ts:getUsage
      competitors: {
        title: 'Competitor limit',
        body: 'How many competitors the client tracks now, out of the most it may track. "Over limit" shows when it tracks more than its limit, for example after you lowered the limit.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/agency/settings/usage/questions-cell.tsx; packages/ask/src/quota.ts:beginTurn (client roles only; agency users are never counted nor stopped); packages/tools/src/tools/usage.ts:getUsage (counts_toward_quota, this UTC month)
      questions: {
        title: 'Question quota',
        body: "The Ask questions the client's people have asked this UTC month, against the client's monthly quota. Only questions from client owners and viewers count; your own team's questions use none. At quota, the client's people cannot ask more until next month.",
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/limits.ts:DEFAULT_MONTHLY_CAP_USD (15), MAX_MONTHLY_CAP_USD (10000), DEFAULT_COMPETITOR_LIMIT (5), MAX_COMPETITOR_LIMIT (10); packages/tools/src/tools/usage.ts:setClientLimits (quota 0 to 100000); packages/db/src/schema/tenancy.ts:askMonthlyQuota (default 100); limits-form.tsx
      limits: {
        title: 'Cap and limits',
        body: 'Admins set three limits for each client. Cap is the monthly spend in dollars ($1 to $10,000; new clients start at $15). Limit is how many competitors the client may track (1 to 10; new clients start at 5). Questions per month is the Ask quota (0 to 100,000; new clients start at 100). Save applies the three to that client.',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noClients: { title: 'No clients to show yet', body: 'Clients and prospects appear here with their spend, competitors and questions once you add them.' },
    },
  },
} as const satisfies Record<`agency.${string}`, PageCopy>;
