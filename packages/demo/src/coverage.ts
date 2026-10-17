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
/** The Overview and Profile pages read the starters (Ask card; the admin's review toggle). */
const lsStarters: CoverageCall = { tool: 'get_ask_starters', input: (ids) => ({ clientId: ls(ids) }), path: 'questions' };

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
  { tool: 'get_client_setup', input: (ids) => ({ clientId: clientId(ids) }), path: 'competitorSuggestions', expect: expectSetup, ...(expectSetup === 'not_found' ? { why: 'a client owner gets a 404 once setup is closed' } : {}) },
  { tool: 'get_client_profile', input: (ids) => ({ clientId: clientId(ids) }), path: 'keywords' },
];
/** 11b: the Invite step reads the invited owner (Cedar Creek's is pending) and the Billing step reads Connect + the per-client billing row (agency admins only). */
const setupStaffCalls = (clientId: (ids: DemoIds) => string): CoverageCall[] => [
  ...setupCalls(clientId),
  { tool: 'get_client_setup', input: (ids) => ({ clientId: clientId(ids) }), path: 'invite.email' },
  { tool: 'get_connect_status', input: none, path: 'status' },
  { tool: 'list_client_billing_status', input: none, path: 'clients' },
];
const setupPending = (ids: DemoIds) => ids.clients.setupPending;

/** Pages that show forms only (no seeded data to check). */
export const NO_DATA_ROUTES = ['/agency/clients/new', '/agency/prospects/new'] as const;

/**
 * Tools read by the shared shell (`components/shell/app-shell.tsx`, rendered by the `(app)` and `(platform)` layouts) on every page. They are checked once, in the screen entry named here, rather
 * than in every entry; the coverage test requires each layout read to be listed and its entry to call it.
 */
export const SHARED_READS: Readonly<Record<string, string>> = { list_clients: '/agency/team' };

/** Spec §4.9: every screen route, the tool calls it makes, and the empty states left on purpose. */
export const SCREENS: readonly ScreenCoverage[] = [
  {
    route: '/agency', as: 'admin', calls: [
      { tool: 'get_portfolio', input: none, path: 'items' },
      { tool: 'list_client_billing_status', input: none, path: 'clients' },
      // Phase 10: the getting-started checklist (the demo agency is mid-wizard) and its plan sub-line.
      onboardingStatus,
      { tool: 'get_billing_summary', input: none, path: 'state' },
    ],
  },
  {
    route: '/agency/ai', as: 'admin', calls: [
      { tool: 'list_api_tokens', input: none, path: 'items' },
      { tool: 'list_oauth_grants', input: none, path: 'items', expect: 'empty', why: 'OAuth grants need a real AI app to connect' },
    ],
  },
  { route: '/agency/alerts', as: 'admin', calls: [{ tool: 'list_alert_queue', input: none, path: 'items' }] },
  { route: '/agency/approvals', as: 'admin', calls: [{ tool: 'list_brief_queue', input: none, path: 'items' }] },
  { route: '/agency/approvals/[briefId]', as: 'admin', calls: [{ tool: 'get_brief_review', input: (ids) => ({ briefId: ids.briefs.readyLoneStar }), path: 'items' }] },
  { route: '/agency/approvals/[briefId] (quiet)', as: 'admin', calls: [{ tool: 'get_brief_review', input: (ids) => ({ briefId: ids.briefs.quietBrazos }), path: 'items', expect: 'empty', why: 'Brazos’s brief is held as quiet' }] },
  { route: '/agency/branding', as: 'admin', calls: [{ tool: 'fn:getAgencyBranding', input: none, path: 'stored' }] },
  { route: '/agency/settings/platform-access', as: 'admin', calls: [{ tool: 'list_support_sessions', input: none, path: 'rows' }] },
  { route: '/agency/playbooks', as: 'admin', calls: [{ tool: 'list_playbooks', input: none, path: 'verticals' }] },
  // Phase 11a: Cedar Creek Plumbing is mid-setup (suggestions ready, search done); `/agency/clients/new` is only a lookup form (reads happen on user action).
  { route: '/c/[clientId]/setup', as: 'admin', calls: setupStaffCalls(setupPending) },
  { route: '/c/[clientId]/setup (client owner)', as: 'ownerSetup', calls: setupCalls(setupPending) },
  { route: '/c/[clientId]/setup (closed, client owner)', as: 'ownerLoneStar', calls: setupCalls(ls, 'not_found') },
  // Phase 11c: the demo agency has a new lead with a ready preview, an accepted one, a declined one; the intake card reads the link and counts.
  { route: '/agency/leads', as: 'admin', calls: [{ tool: 'list_leads', input: none, path: 'leads' }, { tool: 'list_leads', input: () => ({ status: 'verified' }), path: 'leads.*.preview.facts' }] },
  { route: '/agency/settings/intake', as: 'admin', calls: [{ tool: 'get_intake_link', input: none, path: 'url' }] },
  { route: '/agency/prospects', as: 'admin', calls: [{ tool: 'list_prospects', input: none, path: 'items' }] },
  {
    route: '/agency/prospects/[clientId]', as: 'admin', calls: [
      { tool: 'get_client_profile', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'keywords' },
      { tool: 'get_prospect_report', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'report.data.businesses.*.gbp' },
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ids.clients.lakeside }), path: 'items' },
    ],
  },
  { route: '/agency/team', as: 'admin', calls: [{ tool: 'fn:listTeam', input: none, path: 'members' }, { tool: 'fn:listTeam', input: none, path: 'invitations' }, { tool: 'list_clients', input: none, path: 'items' }] },
  { route: '/agency/usage', as: 'admin', calls: [{ tool: 'get_usage', input: none, path: 'items' }] },
  { route: '/agency/webhooks', as: 'admin', calls: [{ tool: 'fn:listWebhooks', input: none }] },
  {
    route: '/c/[clientId]', as: 'admin', calls: [
      lsProfile,
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
    ],
  },
  { route: '/c/[clientId]/alerts/[alertId]', as: 'admin', calls: [{ tool: 'get_alert', input: (ids) => ({ alertId: ids.alerts.delivered }), path: 'body' }] },
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
  { route: '/c/[clientId]/briefs/[briefId]', as: 'ownerLoneStar', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.sentLoneStar[0] }), path: 'items' }] },
  // 12b: the starting point (tiles, scorecard rows, self findings) and a quiet week whose scorecard carries deltas and open first moves.
  { route: '/c/[clientId]/briefs/[briefId] (starting point)', as: 'ownerBrazos', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.startingPointBrazos }), path: 'scorecard.rows' }] },
  { route: '/c/[clientId]/briefs/[briefId] (starting point findings)', as: 'ownerBrazos', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.startingPointBrazos }), path: 'items' }] },
  { route: '/c/[clientId]/briefs/[briefId] (quiet week)', as: 'admin', calls: [{ tool: 'get_brief', input: (ids) => ({ briefId: ids.briefs.quietBrazos }), path: 'scorecard.openFirstMoves' }] },
  {
    route: '/c/[clientId]/changes', as: 'admin', calls: [
      { tool: 'search_events', input: (ids) => ({ clientId: ls(ids), route: 'all', days: 90 }), path: 'items' },
      { tool: 'get_event', input: (ids) => ({ clientId: ls(ids), eventId: lsEvent(ids).id }), path: 'changes' },
      { tool: 'compare_snapshots', input: (ids) => ({ clientId: ls(ids), changeId: lsEvent(ids).changeId }), path: 'after' },
      { tool: 'list_client_competitors', input: (ids) => ({ clientId: ls(ids) }), path: 'items' },
      lsProfile,
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
      { tool: 'get_theme_benchmark', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses.*.reviews' },
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids), business: lsComp(ids) }), path: 'top3' },
      { tool: 'get_competitor_signals', input: (ids) => ({ clientId: ls(ids) }), path: 'competitors' },
      { tool: 'get_competitor_ad_matches', input: (ids) => ({ clientId: ls(ids), competitorId: lsComp(ids) }), path: 'pending' },
    ],
  },
  { route: '/c/[clientId]/evidence/[evidenceId]', as: 'admin', calls: [{ tool: 'get_evidence', input: (ids) => ({ clientId: ls(ids), evidenceId: lsEvent(ids).evidenceIds[0] }), path: 'citedBy' }] },
  {
    route: '/c/[clientId]/moves', as: 'admin', calls: [
      { tool: 'list_moves', input: (ids) => ({ clientId: ls(ids), status: 'all' }), path: 'items' },
      { tool: 'get_move', input: (ids) => ({ clientId: ls(ids), moveId: lsMove(ids).id }), path: 'events' },
    ],
  },
  { route: '/c/[clientId]/pitch-snapshot', as: 'admin', calls: [lsProfile, { tool: 'get_prospect_report', input: (ids) => ({ clientId: ls(ids) }), path: 'report.data.businesses.*.gbp' }] },
  {
    route: '/c/[clientId]/pricing', as: 'admin', calls: [
      { tool: 'get_price_matrix', input: (ids) => ({ clientId: ls(ids) }), path: 'rows.*.cells.*.prices' },
      { tool: 'get_price_history', input: (ids) => ({ clientId: ls(ids), serviceId: 'ac_tune_up', days: 365 }), path: 'series.*.points' },
      { tool: 'get_price_history', input: (ids) => ({ clientId: ls(ids), serviceId: 'ac_tune_up', competitorId: ids.noData.pricing, days: 365 }), path: 'series.*.points', expect: 'empty', why: 'one competitor shows no prices' },
    ],
  },
  {
    route: '/c/[clientId]/rankings', as: 'admin', calls: [
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids) }), path: 'cells' },
      { tool: 'get_share_of_voice', input: (ids) => ({ clientId: ls(ids) }), path: 'series.*.points' },
      { tool: 'get_geogrid', input: (ids) => ({ clientId: ls(ids), business: ids.noData.rankings }), path: 'top3', expect: 'empty', why: 'one competitor never ranks' },
    ],
  },
  { route: '/c/[clientId]/rankings (Brazos)', as: 'admin', calls: [{ tool: 'get_geogrid', input: (ids) => ({ clientId: bz(ids) }), path: 'cells' }] },
  { route: '/c/[clientId]/recommendations', as: 'admin', calls: [lsProfile, { tool: 'list_recommendations', input: (ids) => ({ clientId: ls(ids) }), path: 'items' }] },
  { route: '/c/[clientId]/reports/[reportId]', as: 'admin', calls: [{ tool: 'get_trend_report', input: (ids) => ({ reportId: ids.reportId }), path: 'data' }] },
  {
    route: '/c/[clientId]/reviews', as: 'admin', calls: [
      { tool: 'get_theme_benchmark', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses.*.reviews' },
      { tool: 'get_rating_trend', input: (ids) => ({ clientId: ls(ids) }), path: 'businesses.*.reviews90d' },
      { tool: 'search_reviews', input: (ids) => ({ clientId: ls(ids), text: 'showed up two hours late', days: 365 }), path: 'items' },
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
  { route: '/c/[clientId]/settings/alerts', as: 'admin', calls: [lsProfile, { tool: 'get_alert_rules', input: (ids) => ({ clientId: ls(ids) }), path: 'custom' }] },
  { route: '/c/[clientId]/settings/delivery', as: 'admin', calls: [{ tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'serviceArea' }] },
  { route: '/c/[clientId]/settings/profile', as: 'admin', calls: [{ tool: 'get_client_profile', input: (ids) => ({ clientId: ls(ids) }), path: 'keywords' }, lsStarters, { tool: 'list_client_billing_status', input: none, path: 'clients' }] },
  { route: '/c/[clientId]/settings/billing (client owner)', as: 'ownerLoneStar', calls: [{ tool: 'get_my_billing', input: (ids) => ({ clientId: ls(ids) }), path: 'agencyName' }] },
  {
    route: '/agency/settings/billing', as: 'admin', calls: [
      { tool: 'get_billing_summary', input: none, path: 'state' },
      { tool: 'get_connect_status', input: none, path: 'status' },
      { tool: 'get_client_revenue', input: none, path: 'currency' },
    ],
  },
  // Phase 10: the sign-up wizard, one entry per step (`?step=profile|team|plan|branding`); the demo agency is mid-wizard.
  { route: '/onboarding (step=profile)', as: 'admin', calls: [onboardingStatus, { tool: 'get_agency_profile', input: none, path: 'contactName' }] },
  { route: '/onboarding (step=team)', as: 'admin', calls: [onboardingStatus] },
  { route: '/onboarding (step=plan)', as: 'admin', calls: [onboardingStatus, { tool: 'get_billing_summary', input: none, path: 'maxActiveClients' }] },
  { route: '/onboarding (step=branding)', as: 'admin', calls: [onboardingStatus, { tool: 'fn:getAgencyBranding', input: none, path: 'stored' }] },
  { route: '/paused', as: 'admin', calls: [] },
  { route: '/inbox', as: 'admin', calls: [{ tool: 'fn:listInbox', input: none }] },
  { route: '/inbox (client owner)', as: 'ownerLoneStar', calls: [{ tool: 'fn:listInbox', input: none }] },
  { route: '/kb/[id]', as: 'admin', calls: [{ tool: 'get_kb_article', input: (ids) => ({ kbId: ids.kbArticleId }), path: 'bodyMd' }] },
  { route: '/platform', as: 'operator', calls: [{ tool: 'platform_overview', input: () => ({ range: '12w' }), path: 'series' }, { tool: 'list_platform_activity', input: () => ({ limit: 20 }), path: 'items' }] },
  { route: '/platform/agencies', as: 'operator', calls: [{ tool: 'list_platform_agencies', input: () => ({ sort: 'name', dir: 'asc', limit: 100 }), path: 'rows' }] },
  {
    route: '/platform/agencies/[id]', as: 'operator', calls: [
      { tool: 'get_platform_agency', input: (ids) => ({ agencyId: ids.agencyId, range: '12w' }), path: 'series' },
      { tool: 'list_agency_support_sessions', input: (ids) => ({ agencyId: ids.agencyId }), path: 'rows' },
      { tool: 'get_agency_billing', input: (ids) => ({ agencyId: ids.agencyId }), path: 'state' },
      { tool: 'list_discount_codes', input: none, path: 'codes' },
    ],
  },
  {
    route: '/platform/billing', as: 'operator', calls: [
      { tool: 'get_billing_overview', input: none, path: 'agenciesByState' },
      { tool: 'list_plans', input: none, path: 'plans' },
      { tool: 'list_discount_codes', input: none, path: 'codes' },
      { tool: 'list_invite_links', input: none, path: 'links', expect: 'empty', why: 'the demo seeds no invite links' },
      { tool: 'get_connect_overview', input: none, path: 'agencies' },
      { tool: 'get_signups_paused', input: none, path: 'paused', expect: 'empty', why: 'open sign-up is not paused in the demo' },
      // The mid-wizard demo agency counts as one open sign-up.
      { tool: 'get_signup_funnel', input: () => ({ days: 30 }), path: 'open.signups' },
    ],
  },
  { route: '/platform/costs', as: 'operator', calls: [{ tool: 'list_platform_costs', input: none, path: 'services' }] },
  { route: '/platform/leads', as: 'operator', calls: [{ tool: 'list_pool_leads', input: none, path: 'leads' }, { tool: 'list_pool_leads', input: none, path: 'agencies' }] },
  { route: '/platform/health', as: 'operator', calls: [] },
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
  { route: '/platform/themes', as: 'operator', calls: [{ tool: 'list_theme_proposals', input: none, path: 'pending' }, { tool: 'list_theme_proposals', input: none, path: 'decided' }] },
  { route: '/settings/notifications', as: 'admin', calls: [{ tool: 'fn:myNotificationSettings', input: none }] },
];

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
export const baseRoute = (route: string): string => route.replace(/\s*\(.*\)$/, '');

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
