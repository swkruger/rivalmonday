import type { DemoIds } from './ids';
import type { DemoUserKey } from './users';

export type CoverageExpect = 'data' | 'empty' | 'not_found';

export interface CoverageCall {
  /** A registered tool name, or `fn:<name>` for a page that reads through a direct @cs/tools function. */
  tool: string;
  input: (ids: DemoIds) => Record<string, unknown>;
  /** Dot path to the part of the output that must be non-empty; `*` maps over an array. Default: the whole output. */
  path?: string;
  /** Default 'data'. 'empty' and 'not_found' are empty states left on purpose. */
  expect?: CoverageExpect;
  /** Why an empty state is expected (shown in the README table). */
  why?: string;
}

export interface ScreenCoverage {
  /** The app route, as its folder path under `apps/web/src/app/(app)` or `(platform)`. A suffix in parentheses marks a second entry for the same route. */
  route: string;
  as: DemoUserKey;
  calls: CoverageCall[];
}

const ls = (ids: DemoIds) => ids.clients.loneStar;
const bz = (ids: DemoIds) => ids.clients.brazos;
const none = () => ({});
/** Lone Star's first event and move (the ids lists hold both active clients). */
const lsEvent = (ids: DemoIds) => ids.events.find((e) => e.client === 'loneStar')!;
const lsMove = (ids: DemoIds) => ids.moves.find((m) => m.client === 'loneStar')!;
/** The competitor the profile-page entry opens (not one of the `noData` competitors). */
const lsComp = (ids: DemoIds) => ids.competitors.loneStar[0]!.id;
/** Most workspace pages read the client profile for their header or settings. */
const lsProfile: CoverageCall = { tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'keywords' };

/**
 * Both Ask routes render the same screen (`ask-screen.tsx`): starters, the user's own threads and (on a thread) that
 * thread; inside a support session (8b) only the client profile, as the client gate.
 */
const askCalls: CoverageCall[] = [
  { tool: 'get_ask_starters', input: (ids) => ({ clientId: ls(ids) }), path: 'questions' },
  { tool: 'list_my_ask_threads', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
  { tool: 'get_my_ask_thread', input: (ids) => ({ threadId: ids.ask.admin }), path: 'messages.*.citations' },
  lsProfile,
];
/** Phase 15a: client pages read the client profile for their breadcrumb; the detail pages read their list for Previous/Next. */
const lsBriefs: CoverageCall = { tool: 'list_briefs', input: (ids) => ({ clientId: ls(ids) }), path: 'items' };
const lsAlerts: CoverageCall = { tool: 'list_alerts', input: (ids) => ({ clientId: ls(ids) }), path: 'items' };
const lsReports: CoverageCall = { tool: 'list_trend_reports', input: (ids) => ({ clientId: ls(ids) }), path: 'items' };
/** The Overview and Profile pages read the starters (Ask card; the admin's review toggle). */
const lsStarters: CoverageCall = { tool: 'get_ask_starters', input: (ids) => ({ clientId: ls(ids) }), path: 'questions' };

/** 15b-1/15b-2: the Help pages' reads. `demo:reset` (and the coverage test) load the real docs/help guides: client, agency, platform and account pages. The search finds the demo article. */
const helpGuides = (input: CoverageCall['input']): CoverageCall => ({ tool: 'list_help_guides', input, path: 'guides' });
const lsGuides = helpGuides((ids) => ({ context: 'client', clientId: ls(ids) }));
const helpSearch = (extra: CoverageCall['input']): CoverageCall => ({ tool: 'search_knowledge', input: (ids) => ({ query: 'demo article', limit: 8, ...extra(ids) }), path: 'results' });

/** Phase 10: every wizard step reads the progress (the stepper and the finished/dismissed redirect); so does `/agency`. */
const onboardingStatus: CoverageCall = { tool: 'get_onboarding_status', input: none, path: 'steps' };

/**
 * Phase 10: public screens outside the `(app)`/`(platform)` groups. They read no tools (a form, an invite-link check or
 * a signed token), so there is nothing to seed; listed so the README names them. `coverage.test.ts` checks the list.
 */
export const PUBLIC_SCREENS: readonly { route: string; note: string }[] = [
  { route: '/sign-up', note: 'sign-up form (paused copy while sign-ups are paused)' },
  { route: '/sign-up/problem', note: 'needs a signed-in user whose invite-link sign-up failed' },
  { route: '/join/[token]', note: 'needs a fresh invite link (create one in /platform/billing)' },
  { route: '/u/[token]/confirm', note: 'needs a setup-tip unsubscribe token (from a tip email)' },
  { route: '/u/[token]/done', note: 'shown after unsubscribing' },
  // Phase 11c: the public intake pages. They read through direct @cs/tools functions keyed by a slug or a one-time token, so nothing is seeded for them (the intake link and leads the agency screens read are in leads.ts).
  { route: '/start', note: 'platform intake form (the business search needs a vendor call)' },
  { route: '/start/[slug]', note: `agency intake form; the demo link is /start/demo-agency` },
  { route: '/start/v/[leadId]', note: 'free preview; needs a view token (issued when a visitor opens the verify email link)' },
  { route: '/start/verify', note: 'expired-link page; /start/verify/[token] is a redirect handler' },
];

/** Phase 11a: the setup wizard reads the setup state and the client profile (header name, prefilled fields). */
const setupCalls = (clientId: (ids: DemoIds) => string, expectSetup: CoverageCall['expect'] = 'data'): CoverageCall[] => [
  { tool: 'get_client_setup', input: (ids) => ({ clientId: clientId(ids) }), path: 'competitorSuggestions', expect: expectSetup, ...(expectSetup === 'not_found' ? { why: 'a client owner gets a 404 unless the agency asked them to pick' } : {}) },
  { tool: 'get_client_profile', input: (ids) => ({ clientId: clientId(ids) }), path: 'keywords' },
];
/** 11b: the Invite step reads the invited owner (Cedar Creek's is pending) and the Billing step reads Connect + the per-client billing row (agency admins only). 16: every screen reads the step 1 details (invite pre-fill, the All set rows). */
const setupStaffCalls = (clientId: (ids: DemoIds) => string): CoverageCall[] => [
  ...setupCalls(clientId),
  { tool: 'get_client_details', input: (ids) => ({ clientId: clientId(ids) }), path: 'name' },
  { tool: 'get_client_setup', input: (ids) => ({ clientId: clientId(ids) }), path: 'invite.email' },
  { tool: 'get_connect_status', input: none, path: 'status' },
  { tool: 'list_client_billing_status', input: none, path: 'clients' },
];
const setupPending = (ids: DemoIds) => ids.clients.setupPending;

/** Pages that only redirect (`/agency/settings` and `/c/[clientId]/settings` open their first tab): no seeded data to check. The two creation forms (`/agency/clients/new`, `/agency/prospects/new`) read only the page guide list (15b-2), added by `withGuideReads`. */
// '/e2e-throw' is an E2E-only page that throws on purpose (404 unless E2E_THROW_PAGE=1): no data to read.
export const NO_DATA_ROUTES = ['/agency/settings', '/c/[clientId]/settings', '/e2e-throw'] as const;

/**
 * Tools read by the shared shell (`components/shell/app-shell.tsx`, rendered by the `(app)` and `(platform)` layouts) on every page. They are checked once, in the screen entry named here, rather
 * than in every entry; the coverage test requires each layout read to be listed and its entry to call it.
 */
export const SHARED_READS: Readonly<Record<string, string>> = { list_clients: '/agency/settings/team', get_spend_status: '/agency' };

/** Spec §4.9: every screen route, the tool calls it makes, and the empty states left on purpose. */
const SCREEN_ENTRIES: readonly ScreenCoverage[] = [
  {
    route: '/agency', as: 'admin', calls: [
      { tool: 'get_portfolio', input: none, path: 'items' },
      { tool: 'list_client_billing_status', input: none, path: 'clients' },
      // Phase 10: the getting-started checklist (the demo agency is mid-wizard) and its plan sub-line.
      onboardingStatus,
      { tool: 'get_billing_summary', input: none, path: 'state' },
      { tool: 'get_spend_status', input: none, path: 'paused', expect: 'empty', why: 'no demo client is spend-paused' },
    ],
  },
  {
    route: '/agency/settings/ai', as: 'admin', calls: [
      { tool: 'list_api_tokens', input: none, path: 'items' },
      { tool: 'list_oauth_grants', input: none, path: 'items', expect: 'empty', why: 'OAuth grants need a real AI app to connect' },
    ],
  },
  { route: '/agency/alerts', as: 'admin', calls: [{ tool: 'list_alert_queue', input: none, path: 'items' }] },
  { route: '/agency/approvals', as: 'admin', calls: [{ tool: 'list_brief_queue', input: none, path: 'items' }] },
  { route: '/agency/approvals/[briefId]', as: 'admin', calls: [{ tool: 'get_brief_review', input: (ids) => ({ briefId: ids.briefs.readyLoneStar }), path: 'items' }] },
  { route: '/agency/approvals/[briefId] (quiet)', as: 'admin', calls: [{ tool: 'get_brief_review', input: (ids) => ({ briefId: ids.briefs.quietBrazos }), path: 'items', expect: 'empty', why: 'Brazos’s brief is held as quiet' }] },
  { route: '/agency/settings/branding', as: 'admin', calls: [{ tool: 'get_agency_branding', input: none, path: 'stored' }] },
  { route: '/agency/settings/platform-access', as: 'admin', calls: [{ tool: 'list_support_sessions', input: none, path: 'rows' }] },
  { route: '/agency/settings/runbook', as: 'admin', calls: [{ tool: 'get_runbook', input: () => ({ owner: { level: 'agency' } }), path: 'items' }] },
  // Phase 11a: Cedar Creek Plumbing is mid-setup (suggestions ready, search done); `/agency/clients/new` (steps 1-2 of the client flow) reads only the guide list; the lookup runs on user action.
  { route: '/c/[clientId]/setup', as: 'admin', calls: setupStaffCalls(setupPending) },
  // 16 P8/§7: owners never open `/setup` (they are sent to their Overview); their competitor pick is a screen of its own. Cedar Creek's owner was asked to pick (seedSetup); a closed client's owner gets a 404.
  { route: '/c/[clientId]/setup/competitors (client owner)', as: 'ownerSetup', calls: setupCalls(setupPending) },
  { route: '/c/[clientId]/setup/competitors (not asked, client owner)', as: 'ownerLoneStar', calls: setupCalls(ls, 'not_found') },
  // Phase 11c: the demo agency has a new lead with a ready preview, an accepted one, a declined one; the intake card reads the link and counts.
  { route: '/agency/leads', as: 'admin', calls: [{ tool: 'list_leads', input: none, path: 'leads' }, { tool: 'list_leads', input: () => ({ status: 'verified' }), path: 'leads.*.preview.facts' }] },
  { route: '/agency/settings/intake', as: 'admin', calls: [{ tool: 'get_intake_link', input: none, path: 'url' }] },
  // 15c-2a: the intake preview renders the same link (the demo agency has one) inside a frame.
  { route: '/agency/settings/intake/preview', as: 'admin', calls: [{ tool: 'get_intake_link', input: none, path: 'url' }] },
  { route: '/agency/prospects', as: 'admin', calls: [{ tool: 'list_prospects', input: none, path: 'items' }] },
  {
    route: '/agency/prospects/[clientId]', as: 'admin', calls: [
      { tool: 'get_client_profile', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'keywords' },
      { tool: 'get_prospect_report', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'report.data.businesses.*.gbp' },
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'items' },
    ],
  },
  { route: '/agency/settings/team', as: 'admin', calls: [{ tool: 'get_team', input: none, path: 'members' }, { tool: 'get_team', input: none, path: 'invitations' }, { tool: 'list_clients', input: none, path: 'items' }] },
  { route: '/agency/settings/usage', as: 'admin', calls: [{ tool: 'get_usage', input: none, path: 'items' }] },
  { route: '/agency/settings/slack-teams', as: 'admin', calls: [{ tool: 'list_webhooks', input: none, path: 'items' }] },
  {
    route: '/c/[clientId]', as: 'admin', calls: [
      lsProfile,
      lsGuides,
      { tool: 'get_workspace_overview', input: (ids) => ({ clientId: ls(ids) }), path: 'pressure.*.pressure.score' },
      { tool: 'get_ad_activity', input: (ids) => ({ clientId: ls(ids), weeks: 12 }), path: 'series.*.points' },
      // The overview opens the newest brief in the list: the agency sees the ready one first.
      { tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.readyLoneStar }), path: 'items' },
      { tool: 'list_alerts', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_briefs', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_moves', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_recommendations', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_trend_reports', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'get_starting_point_status', input: (ids) => ({ clientId: ls(ids) }), path: 'state' },
      // 11a: the overview shows the "Finish setting up" banner while a client's setup is open (Cedar Creek Plumbing).
      { tool: 'get_client_setup', input: (ids) => ({ clientId: ids.clients.setupPending }), path: 'state.steps' },
      // 12b: a fresh client shows the "Preparing your starting point" checklist (state preparing, with its four checks).
      { tool: 'get_starting_point_status', input: (ids) => ({ clientId: ids.startingPointFresh }), path: 'state' },
      // 12b: Brazos already has its starting point.
      { tool: 'get_starting_point_status', input: (ids) => ({ clientId: bz(ids) }), path: 'briefId' },
      lsStarters,
    ],
  },
  {
    route: '/c/[clientId] (client owner)', as: 'ownerLoneStar', calls: [
      { tool: 'get_starting_point_status', input: (ids) => ({ clientId: ls(ids) }), path: 'state' },
      { tool: 'get_workspace_overview', input: (ids) => ({ clientId: ls(ids) }), path: 'pressure.*.pressure.score' },
      { tool: 'list_briefs', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      // A client owner sees sent briefs only; the newest is the first of `sentLoneStar` (this week's Monday).
      { tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.sentLoneStar[0] }), path: 'items' },
    ],
  },
  {
    route: '/c/[clientId]/ads', as: 'admin', calls: [
      // The page's own inputs: 12 weeks of activity, then the list filtered to active ads by default.
      { tool: 'get_ad_activity', input: (ids) => ({ clientId: ls(ids), weeks: 12 }), path: 'series.*.points' },
      { tool: 'list_ads', input: (ids) => ({ clientId: ls(ids), status: 'active', offset: 0 }), path: 'items' },
      { tool: 'list_ads', input: (ids) => ({ clientId: ls(ids), status: 'all' }), path: 'items' },
      { tool: 'list_ads', input: (ids) => ({ clientId: ls(ids), competitorId: ids.noData.ads, status: 'all' }), path: 'items', expect: 'empty', why: 'one competitor runs no ads' },
      // The competitor filter lists every tracked rival, including the one with no ads (15c-2b-2 P9).
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      lsProfile,
    ],
  },
  { route: '/c/[clientId]/alerts/[alertId]', as: 'admin', calls: [{ tool: 'get_alert', input: (ids) => ({ alertId: ids.alerts.delivered }), path: 'body' }, lsProfile, lsAlerts] },
  { route: '/c/[clientId]/ask', as: 'admin', calls: askCalls },
  { route: '/c/[clientId]/ask/[threadId]', as: 'admin', calls: askCalls },
  {
    route: '/c/[clientId]/ask/[threadId] (client owner)', as: 'ownerLoneStar', calls: [
      { tool: 'list_my_ask_threads', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'get_my_ask_thread', input: (ids) => ({ threadId: ids.ask.ownerLoneStar }), path: 'messages.*.citations' },
      // Author-only (e5): the owner cannot open the admin's thread.
      { tool: 'get_my_ask_thread', input: (ids) => ({ threadId: ids.ask.admin }), expect: 'not_found', why: 'threads are author-only' },
    ],
  },
  // Phase 15a: Briefs & reports, one tab per list (`?tab=briefs|alerts|reports`).
  { route: '/c/[clientId]/briefs', as: 'admin', calls: [lsProfile, lsBriefs, lsAlerts, lsReports] },
  { route: '/c/[clientId]/briefs/[briefId]', as: 'ownerLoneStar', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.sentLoneStar[0] }), path: 'items' }, lsProfile, lsBriefs, { tool: 'get_feedback_contact', input: (ids) => ({ clientId: ls(ids) }), path: 'email' }] },
  // 12b: the starting point (tiles, scorecard rows, self findings) and a quiet week whose scorecard carries deltas and open first moves.
  { route: '/c/[clientId]/briefs/[briefId] (starting point)', as: 'ownerBrazos', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.startingPointBrazos }), path: 'scorecard.rows' }] },
  { route: '/c/[clientId]/briefs/[briefId] (starting point findings)', as: 'ownerBrazos', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.startingPointBrazos }), path: 'items' }] },
  { route: '/c/[clientId]/briefs/[briefId] (quiet week)', as: 'admin', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.quietBrazos }), path: 'scorecard.openFirstMoves' }] },
  {
    route: '/c/[clientId]/changes', as: 'admin', calls: [
      { tool: 'search_events', input: (ids) => ({ clientId: ls(ids), route: 'all', days: 90 }), path: 'items' },
      { tool: 'get_event', input: (ids) => ({ clientId: ls(ids), eventId: lsEvent(ids).id }), path: 'changes' },
      { tool: 'compare_snapshots', input: (ids) => ({ clientId: ls(ids), changeId: lsEvent(ids).changeId }), path: 'after' },
      { tool: 'compare_captures', input: (ids) => ({ clientId: ls(ids), captureId: lsEvent(ids).captureId }), path: 'blocks' },
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      lsProfile,
      lsGuides,
    ],
  },
  {
    route: '/c/[clientId]/competitors', as: 'admin', calls: [
      lsProfile,
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_competitor_suggestions', input: (ids) => ({ clientId: ls(ids) }), path: 'suggestions' },
      // The seeded run is done: the demo shows its finished state.
      { tool: 'get_competitor_search_status', input: (ids) => ({ clientId: ls(ids) }), path: 'status' },
      { tool: 'get_competitor_signals', input: (ids) => ({ clientId: ls(ids) }), path: 'competitors' },
    ],
  },
  {
    route: '/c/[clientId]/competitors/[competitorId]', as: 'admin', calls: [
      { tool: 'get_competitor_profile', input: (ids) => ({ clientId: ls(ids), competitorId: lsComp(ids) }), path: 'gbp' },
      { tool: 'get_competitor_timeline', input: (ids) => ({ clientId: ls(ids), competitorId: lsComp(ids), days: 90 }), path: 'items' },
      { tool: 'list_tracked_pages', input: (ids) => ({ clientId: ls(ids), competitorId: lsComp(ids) }), path: 'items' },
      { tool: 'get_price_matrix', input: (ids) => ({ clientId: ls(ids), competitorId: lsComp(ids) }), path: 'rows.*.cells.*.prices' },
      { tool: 'list_ads', input: (ids) => ({ clientId: ls(ids), competitorId: lsComp(ids), limit: 3 }), path: 'items' },
      { tool: 'get_topic_benchmark', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses.*.reviews' },
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids), business: lsComp(ids) }), path: 'top3' },
      { tool: 'get_competitor_signals', input: (ids) => ({ clientId: ls(ids) }), path: 'competitors' },
      { tool: 'get_competitor_ad_matches', input: (ids) => ({ clientId: ls(ids), competitorId: lsComp(ids) }), path: 'pending' },
      lsProfile,
    ],
  },
  {
    route: '/c/[clientId]/evidence/[evidenceId]', as: 'admin', calls: [
      { tool: 'get_evidence', input: (ids) => ({ clientId: ls(ids), evidenceId: lsEvent(ids).evidenceIds[0] }), path: 'citedBy' },
      { tool: 'compare_captures', input: (ids) => ({ clientId: ls(ids), captureId: lsEvent(ids).captureId }), path: 'blocks' },
      lsProfile,
    ],
  },
  {
    route: '/c/[clientId]/moves', as: 'admin', calls: [
      { tool: 'list_moves', input: (ids) => ({ clientId: ls(ids), status: 'all' }), path: 'items' },
      { tool: 'get_move', input: (ids) => ({ clientId: ls(ids), moveId: lsMove(ids).id }), path: 'events' },
      lsProfile,
    ],
  },
  { route: '/c/[clientId]/pitch-snapshot', as: 'admin', calls: [lsProfile, { tool: 'get_prospect_report', input: (ids) => ({ clientId: ls(ids) }), path: 'report.data.businesses.*.gbp' }] },
  {
    route: '/c/[clientId]/pricing', as: 'admin', calls: [
      { tool: 'get_price_matrix', input: (ids) => ({ clientId: ls(ids) }), path: 'rows.*.cells.*.prices' },
      { tool: 'get_price_history', input: (ids) => ({ clientId: ls(ids), serviceId: 'ac_tune_up', days: 365 }), path: 'series.*.points' },
      { tool: 'get_price_history', input: (ids) => ({ clientId: ls(ids), serviceId: 'ac_tune_up', competitorId: ids.noData.pricing, days: 365 }), path: 'series.*.points', expect: 'empty', why: 'one competitor shows no prices' },
      lsProfile,
    ],
  },
  {
    route: '/c/[clientId]/rankings', as: 'admin', calls: [
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids) }), path: 'cells' },
      { tool: 'get_rank_trend', input: (ids) => ({ clientId: ls(ids), keyword: 'ac repair granbury' }), path: 'scans' },
      { tool: 'get_share_of_voice', input: (ids) => ({ clientId: ls(ids) }), path: 'series.*.points' },
      { tool: 'get_rank_settings', input: (ids) => ({ clientId: ls(ids) }), path: 'allKeywords' },
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids), business: ids.noData.rankings }), path: 'top3', expect: 'empty', why: 'one competitor never ranks' },
      lsProfile,
    ],
  },
  { route: '/c/[clientId]/rankings (Brazos)', as: 'admin', calls: [{ tool: 'get_geogrid', input: (ids) => ({ clientId: bz(ids) }), path: 'cells' }] },
  { route: '/c/[clientId]/recommendations', as: 'admin', calls: [lsProfile, { tool: 'list_recommendations', input: (ids) => ({ clientId: ls(ids) }), path: 'items' }] },
  { route: '/c/[clientId]/reports/[reportId]', as: 'admin', calls: [{ tool: 'get_trend_report', input: (ids) => ({ reportId: ids.reportId }), path: 'data' }, lsProfile, lsReports] },
  {
    route: '/c/[clientId]/reviews', as: 'admin', calls: [
      { tool: 'get_topic_benchmark', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses.*.reviews' },
      { tool: 'get_rating_trend', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses.*.reviews90d' },
      { tool: 'search_reviews', input: (ids) => ({ clientId: ls(ids), text: 'showed up two hours late', days: 365 }), path: 'items' },
      lsProfile,
      lsGuides,
    ],
  },
  {
    route: '/c/[clientId]/reviews (Brazos)', as: 'admin', calls: [
      { tool: 'get_rating_trend', input: (ids) => ({ clientId: bz(ids) }), path: 'businesses.*.reviews90d' },
      { tool: 'search_reviews', input: (ids) => ({ clientId: bz(ids), business: 'self' }), expect: 'not_found', why: 'Brazos has no own business ("add your place id")' },
      { tool: 'search_reviews', input: (ids) => ({ clientId: bz(ids), business: ids.noData.reviews, days: 365 }), path: 'items', expect: 'empty', why: 'one competitor has no reviews' },
    ],
  },
  {
    route: '/c/[clientId]/settings/ai', as: 'admin', calls: [
      { tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'name' },
      { tool: 'list_api_tokens', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      { tool: 'list_oauth_grants', input: (ids) => ({ clientId: ls(ids) }), path: 'items', expect: 'empty', why: 'OAuth grants need a real AI app to connect' },
    ],
  },
  {
    route: '/c/[clientId]/settings/ai (client owner)', as: 'ownerLoneStar', calls: [
      { tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'name' },
      { tool: 'list_api_tokens', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
    ],
  },
  { route: '/c/[clientId]/settings/usage', as: 'admin', calls: [lsProfile, { tool: 'get_my_usage', input: (ids) => ({ clientId: ls(ids) }), path: 'credits.limit' }] },
  { route: '/c/[clientId]/settings/alerts', as: 'admin', calls: [lsProfile, { tool: 'get_alert_rules', input: (ids) => ({ clientId: ls(ids) }), path: 'custom' }] },
  { route: '/c/[clientId]/settings/runbook', as: 'admin', calls: [lsProfile, { tool: 'get_runbook', input: (ids) => ({ owner: { level: 'client', clientId: ls(ids) } }), path: 'items' }] },
  { route: '/c/[clientId]/settings/delivery', as: 'admin', calls: [{ tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'serviceArea' }, { tool: 'list_client_recipients', input: (ids) => ({ clientId: ls(ids) }), path: 'items' }] },
  { route: '/c/[clientId]/settings/profile', as: 'admin', calls: [{ tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'keywords' }, lsStarters, { tool: 'list_client_billing_status', input: none, path: 'clients' }] },
  { route: '/c/[clientId]/settings/billing (client owner)', as: 'ownerLoneStar', calls: [{ tool: 'get_my_billing', input: (ids) => ({ clientId: ls(ids) }), path: 'agencyName' }, lsProfile] },
  {
    route: '/agency/settings/billing', as: 'admin', calls: [
      { tool: 'get_billing_summary', input: none, path: 'state' },
      { tool: 'get_connect_status', input: none, path: 'status' },
      { tool: 'get_client_revenue', input: none, path: 'currency' },
    ],
  },
  // Phase 10 / 16: the sign-up wizard, one entry per step (`?step=profile|team|branding|done`); the demo agency is mid-wizard. Every step reads the profile and branding; the last also the team.
  { route: '/onboarding (step=profile)', as: 'admin', calls: [onboardingStatus, { tool: 'get_agency_profile', input: none, path: 'contactName' }, { tool: 'get_agency_branding', input: none, path: 'stored' }] },
  { route: '/onboarding (step=team)', as: 'admin', calls: [onboardingStatus, { tool: 'get_agency_profile', input: none, path: 'contactName' }, { tool: 'get_agency_branding', input: none, path: 'stored' }] },
  { route: '/onboarding (step=branding)', as: 'admin', calls: [onboardingStatus, { tool: 'get_agency_profile', input: none, path: 'contactName' }, { tool: 'get_agency_branding', input: none, path: 'stored' }] },
  { route: '/onboarding (step=done)', as: 'admin', calls: [onboardingStatus, { tool: 'get_agency_profile', input: none, path: 'contactName' }, { tool: 'get_agency_branding', input: none, path: 'stored' }, { tool: 'get_team', input: none, path: 'members' }] },
  { route: '/agency/clients/new', as: 'admin', calls: [] },
  { route: '/agency/prospects/new', as: 'admin', calls: [] },
  { route: '/paused', as: 'admin', calls: [] },
  { route: '/inbox', as: 'admin', calls: [{ tool: 'fn:listInbox', input: none }] },
  { route: '/inbox (client owner)', as: 'ownerLoneStar', calls: [{ tool: 'fn:listInbox', input: none }] },
  { route: '/kb/[id]', as: 'admin', calls: [{ tool: 'get_kb_article', input: (ids) => ({ kbId: ids.kbArticleId }), path: 'bodyMd' }] },
  { route: '/platform', as: 'operator', calls: [{ tool: 'platform_overview', input: () => ({ range: '12w' }), path: 'series' }, { tool: 'list_platform_activity', input: () => ({ limit: 20 }), path: 'items' }] },
  { route: '/platform/runbook', as: 'operator', calls: [{ tool: 'get_runbook', input: () => ({ owner: { level: 'platform' } }), path: 'items' }] },
  { route: '/platform/agencies', as: 'operator', calls: [{ tool: 'list_platform_agencies', input: () => ({ sort: 'name', dir: 'asc', limit: 100 }), path: 'rows' }] },
  {
    route: '/platform/agencies/[id]', as: 'operator', calls: [
      { tool: 'get_platform_agency', input: (ids) => ({ agencyId: ids.agencyId, range: '12w' }), path: 'series' },
      { tool: 'list_agency_support_sessions', input: (ids) => ({ agencyId: ids.agencyId }), path: 'rows' },
      { tool: 'get_agency_billing', input: (ids) => ({ agencyId: ids.agencyId }), path: 'state' },
      { tool: 'list_discount_codes', input: none, path: 'codes' },
      { tool: 'get_client_limits', input: (ids) => ({ agencyId: ids.agencyId }), path: 'defaultLimitUsd' },
      { tool: 'list_agency_people', input: (ids) => ({ agencyId: ids.agencyId }), path: 'members' },
      { tool: 'list_plan_agencies', input: none, path: 'agencies', expect: 'empty', why: 'every demo agency is on the current plan version' },
    ],
  },
  {
    route: '/platform/billing', as: 'operator', calls: [
      { tool: 'get_billing_overview', input: none, path: 'agenciesByState' },
      { tool: 'list_plans', input: none, path: 'plans' },
      { tool: 'list_plan_agencies', input: none, path: 'agencies', expect: 'empty', why: 'every demo agency is on the current plan version' },
      { tool: 'list_discount_codes', input: none, path: 'codes' },
      { tool: 'list_invite_links', input: none, path: 'links', expect: 'empty', why: 'the demo seeds no invite links' },
      { tool: 'get_connect_overview', input: none, path: 'agencies' },
      { tool: 'get_signups_paused', input: none, path: 'paused', expect: 'empty', why: 'open sign-up is not paused in the demo' },
      // The mid-wizard demo agency counts as one open sign-up.
      { tool: 'get_signup_funnel', input: () => ({ days: 30 }), path: 'open.signups' },
    ],
  },
  { route: '/platform/costs', as: 'operator', calls: [{ tool: 'list_platform_costs', input: none, path: 'services' }, { tool: 'get_spend_guard', input: none, path: 'settings' }] },
  { route: '/platform/leads', as: 'operator', calls: [{ tool: 'list_pool_leads', input: none, path: 'leads' }, { tool: 'list_pool_leads', input: none, path: 'agencies' }] },
  { route: '/platform/health', as: 'operator', calls: [{ tool: 'get_platform_health', input: none, path: 'sources' }, { tool: 'get_spend_guard', input: none, path: 'settings' }] },
  { route: '/platform/ask', as: 'operator', calls: [{ tool: 'fn:listReviewableAskThreads', input: none, path: 'items' }] },
  { route: '/platform/ask/[threadId]', as: 'operator', calls: [{ tool: 'fn:getReviewableAskThread', input: (ids) => ({ threadId: ids.ask.ownerLoneStar }), path: 'messages.*.trace' }] },
  { route: '/platform/knowledge', as: 'operator', calls: [{ tool: 'list_kb_articles', input: none, path: 'items' }, { tool: 'list_kb_targets', input: none, path: 'agencies' }] },
  { route: '/platform/knowledge/new', as: 'operator', calls: [{ tool: 'list_kb_targets', input: none, path: 'agencies' }] },
  {
    route: '/platform/knowledge/[id]', as: 'operator', calls: [
      { tool: 'get_kb_article_admin', input: (ids) => ({ id: ids.kbArticleId }), path: 'bodyMd' },
      { tool: 'list_kb_targets', input: none, path: 'agencies' },
    ],
  },
  { route: '/platform/reviews', as: 'operator', calls: [{ tool: 'list_decision_reviews', input: none, path: 'items' }] },
  {
    route: '/platform/verticals', as: 'operator', calls: [
      { tool: 'list_catalog_review', input: none, path: 'verticals', expect: 'empty', why: 'the demo agencies add no business types' },
      { tool: 'list_catalog_review', input: none, path: 'areas', expect: 'empty', why: 'the demo agencies add no services' },
      { tool: 'list_verticals', input: none, path: 'verticals' },
      // The shell's nav-badge read (every operator page), listed here because /platform/verticals is where the badge counts.
      { tool: 'count_catalog_review', input: none, path: 'count', expect: 'empty', why: 'nothing waits for review in the demo' },
    ],
  },
  { route: '/platform/topics', as: 'operator', calls: [{ tool: 'list_topic_proposals', input: none, path: 'pending' }, { tool: 'list_topic_proposals', input: none, path: 'decided' }] },
  // 15b-1: the Help pages. The docs/help guides (loaded by `demo:reset` through `seedKnowledge`) cover every context; the search finds the demo article.
  { route: '/agency/help', as: 'admin', calls: [helpGuides(() => ({ context: 'agency' })), helpSearch(none)] },
  { route: '/c/[clientId]/help', as: 'admin', calls: [lsGuides, helpSearch((ids) => ({ clientId: ls(ids) })), lsProfile] },
  { route: '/c/[clientId]/help (client owner)', as: 'ownerLoneStar', calls: [lsGuides, helpSearch((ids) => ({ clientId: ls(ids) })), lsProfile] },
  { route: '/platform/help', as: 'operator', calls: [helpGuides(() => ({ context: 'platform' })), helpSearch(() => ({ context: 'platform' }))] },
  { route: '/settings/notifications', as: 'admin', calls: [{ tool: 'fn:myNotificationSettings', input: none }] },
];

/**
 * 15b-2: every page with a Guide button reads `list_help_guides` once (`helpGuides`). Rather than repeating the call in
 * ~55 entries, it is added here to the first entry of each listed route: client routes read the client scope, agency and
 * account routes the agency scope, platform routes the platform scope. A page that gains a guide read must be listed here
 * (the coverage test fails otherwise); `/c/[clientId]` routes already listing `lsGuides` and the Help pages are untouched.
 */
const GUIDE_ROUTES: readonly string[] = [
  '/agency', '/agency/alerts', '/agency/approvals', '/agency/approvals/[briefId]', '/agency/clients/new', '/agency/leads', '/agency/prospects',
  '/agency/prospects/new', '/agency/prospects/[clientId]', '/agency/settings/ai', '/agency/settings/billing', '/agency/settings/branding',
  '/agency/settings/intake', '/agency/settings/intake/preview', '/agency/settings/platform-access', '/agency/settings/runbook', '/agency/settings/slack-teams',
  '/agency/settings/team', '/agency/settings/usage', '/inbox', '/onboarding', '/settings/notifications',
  '/c/[clientId]/ads', '/c/[clientId]/alerts/[alertId]', '/c/[clientId]/briefs', '/c/[clientId]/briefs/[briefId]', '/c/[clientId]/competitors',
  '/c/[clientId]/competitors/[competitorId]', '/c/[clientId]/evidence/[evidenceId]', '/c/[clientId]/moves', '/c/[clientId]/pitch-snapshot',
  '/c/[clientId]/pricing', '/c/[clientId]/rankings', '/c/[clientId]/recommendations', '/c/[clientId]/reports/[reportId]', '/c/[clientId]/settings/ai',
  '/c/[clientId]/settings/alerts', '/c/[clientId]/settings/billing', '/c/[clientId]/settings/delivery', '/c/[clientId]/settings/profile',
  '/c/[clientId]/settings/runbook', '/c/[clientId]/settings/usage', '/c/[clientId]/setup',
  '/platform', '/platform/agencies', '/platform/agencies/[id]', '/platform/ask', '/platform/ask/[threadId]', '/platform/billing', '/platform/costs',
  '/platform/health', '/platform/knowledge', '/platform/knowledge/new', '/platform/knowledge/[id]', '/platform/leads', '/platform/reviews',
  '/platform/runbook', '/platform/topics', '/platform/verticals',
];
const guideCallFor = (route: string): CoverageCall =>
  route.startsWith('/c/') ? lsGuides
  : route.startsWith('/platform') ? helpGuides(() => ({ context: 'platform' }))
  : helpGuides(() => ({ context: 'agency' }));
function withGuideReads(entries: readonly ScreenCoverage[]): ScreenCoverage[] {
  const done = new Set<string>();
  return entries.map((s) => {
    const route = baseRoute(s.route);
    if (!GUIDE_ROUTES.includes(route) || done.has(route) || s.calls.some((c) => c.tool === 'list_help_guides')) return s;
    done.add(route);
    return { ...s, calls: [...s.calls, guideCallFor(route)] };
  });
}

export const SCREENS: readonly ScreenCoverage[] = withGuideReads(SCREEN_ENTRIES);

/** The value at a dot path; a `*` segment maps the rest of the path over each element of an array. */
export function valueAt(out: unknown, path?: string): unknown {
  if (!path) return out;
  const [head, ...rest] = path.split('.');
  const tail = rest.join('.') || undefined;
  if (head === '*') return Array.isArray(out) ? out.map((item) => valueAt(item, tail)) : undefined;
  return out !== null && typeof out === 'object' ? valueAt((out as Record<string, unknown>)[head!], tail) : undefined;
}

/** False only when an object along the path lacks the next key: a path that does not match the tool's output shape. Null/empty values count as present. */
export function pathExists(out: unknown, path?: string): boolean {
  if (!path || out === null || out === undefined) return true;
  const [head, ...rest] = path.split('.');
  const tail = rest.join('.') || undefined;
  if (head === '*') return Array.isArray(out) && out.every((item) => pathExists(item, tail));
  return typeof out === 'object' && !Array.isArray(out) && head! in out && pathExists((out as Record<string, unknown>)[head!], tail);
}

/** "Has data": not null/undefined/false/0/'' and, for arrays and objects, at least one value that has data. */
export function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.some(isNonEmpty);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(isNonEmpty);
  return true;
}

/** Tool names a page module reads: string literals passed to `callTool`/`tryCallTool` (apps/web/src/server/tools.ts). */
export function toolReadsOf(source: string): string[] {
  const names = [...source.matchAll(/\b(?:callTool|tryCallTool)\s*(?:<[^'"`]*?>)?\(\s*\w+\s*,\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]!);
  return [...new Set(names)].sort();
}

/** The route of a coverage entry without its "(…)" suffix. */
export function baseRoute(route: string): string {
  return route.replace(/\s*\(.*\)$/, '');
}

export const README_MARKERS = { start: '<!-- coverage:start -->', end: '<!-- coverage:end -->' } as const;

/** Spec §4.9: the coverage table in the package README. */
export function renderCoverageTable(): string {
  const rows = SCREENS.map((s) => {
    const tools = [...new Set(s.calls.filter((c) => (c.expect ?? 'data') === 'data').map((c) => `\`${c.tool}\``))].join(', ');
    const empty = s.calls.filter((c) => c.expect && c.expect !== 'data').map((c) => `\`${c.tool}\`: ${c.why ?? c.expect}`).join('; ') || '—';
    return `| \`${s.route}\` | ${s.as} | ${tools || '—'} | ${empty} |`;
  });
  const publicRows = PUBLIC_SCREENS.map((s) => `| \`${s.route}\` | public | — | ${s.note} |`);
  return ['| Screen | Signed in as | Tools that must return data | Empty on purpose |', '|---|---|---|---|', ...rows, ...publicRows].join('\n');
}
