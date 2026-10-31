export type CrawlAs = 'operator' | 'agency' | 'owner' | 'signed-out';
export type CrawlFx = { clientId: string; setupClientId: string | null; prospectId: string | null; competitorId: string | null; briefId: string | null; readyBriefId: string | null; alertId: string | null; reportId: string | null; evidenceId: string | null; threadId: string | null; kbId: string | null; agencyId: string | null };
export type CrawlRoute = { label: string; as: CrawlAs; path: (fx: CrawlFx) => string | null; /** Also capture at 1920 (full-width charts). */ wide?: boolean };

const at = (as: CrawlAs, label: string, path: string, wide = false): CrawlRoute => ({ label, as, path: () => path, wide });
const ref = (as: CrawlAs, label: string, fn: (fx: CrawlFx) => string | null, wide = false): CrawlRoute => ({ label, as, path: fn, wide });
const c = (as: CrawlAs, label: string, rest: string, wide = false) => ref(as, label, (fx) => `/c/${fx.clientId}${rest}`, wide);
const slug = (p: string) => p.replaceAll('/', '-');

const CLIENT_PAGES: [string, string, boolean][] = [
  ['overview', '', true], ['competitors', '/competitors', false], ['changes', '/changes', false], ['moves', '/moves', false], ['recommendations', '/recommendations', false],
  ['rankings', '/rankings', true], ['reviews', '/reviews', true], ['ads', '/ads', true], ['pricing', '/pricing', true], ['ask', '/ask', false], ['briefs', '/briefs', false], ['help', '/help', false],
];
const CLIENT_SETTINGS = ['', '/profile', '/delivery', '/alerts', '/usage', '/ai', '/runbook', '/billing'];

/** Every `page.tsx` a signed-in or public user can reach on the demo seed; `/e2e-throw` and token-only pages are left out. */
export const CRAWL_ROUTES: CrawlRoute[] = [
  // Agency
  at('agency', 'agency-dashboard', '/agency', true),
  ...['alerts', 'approvals', 'help', 'leads', 'prospects'].map((p) => at('agency', `agency-${p}`, `/agency/${p}`)),
  ref('agency', 'agency-approval-detail', (fx) => (fx.readyBriefId ? `/agency/approvals/${fx.readyBriefId}` : null)),
  ref('agency', 'agency-prospect-detail', (fx) => (fx.prospectId ? `/agency/prospects/${fx.prospectId}` : null)),
  ...['', '/ai', '/billing', '/branding', '/intake', '/intake/preview', '/platform-access', '/runbook', '/slack-teams', '/team', '/usage'].map((p) => at('agency', `agency-settings${slug(p)}`, `/agency/settings${p}`)),
  at('agency', 'inbox', '/inbox'),
  at('agency', 'settings-notifications', '/settings/notifications'),
  ref('agency', 'kb-article', (fx) => (fx.kbId ? `/kb/${fx.kbId}` : null)),
  // Client, agency view
  ...CLIENT_PAGES.map(([l, p, w]) => c('agency', `client-${l}`, p, w)),
  ...CLIENT_SETTINGS.map((p) => c('agency', `client-settings${slug(p)}`, `/settings${p}`)),
  ref('agency', 'client-competitor-detail', (fx) => (fx.competitorId ? `/c/${fx.clientId}/competitors/${fx.competitorId}` : null), true),
  ref('agency', 'client-brief', (fx) => (fx.briefId ? `/c/${fx.clientId}/briefs/${fx.briefId}` : null)),
  ref('agency', 'client-alert', (fx) => (fx.alertId ? `/c/${fx.clientId}/alerts/${fx.alertId}` : null)),
  ref('agency', 'client-report', (fx) => (fx.reportId ? `/c/${fx.clientId}/reports/${fx.reportId}` : null), true),
  ref('agency', 'client-evidence', (fx) => (fx.evidenceId ? `/c/${fx.clientId}/evidence/${fx.evidenceId}` : null)),
  ref('agency', 'client-ask-thread', (fx) => (fx.threadId ? `/c/${fx.clientId}/ask/${fx.threadId}` : null)),
  ref('agency', 'client-pitch-snapshot', (fx) => (fx.prospectId ? `/c/${fx.prospectId}/pitch-snapshot` : null)),
  // Client, signed-in owner role
  ...CLIENT_PAGES.map(([l, p]) => c('owner', `owner-${l}`, p)),
  ...['', '/billing', '/delivery'].map((p) => c('owner', `owner-settings${slug(p)}`, `/settings${p}`)),
  // Onboarding
  at('agency', 'new-client', '/agency/clients/new'),
  at('agency', 'new-prospect', '/agency/prospects/new'),
  ref('agency', 'setup', (fx) => (fx.setupClientId ? `/c/${fx.setupClientId}/setup` : null)),
  ref('agency', 'setup-profile', (fx) => (fx.setupClientId ? `/c/${fx.setupClientId}/setup?step=profile` : null)),
  ref('agency', 'setup-invite', (fx) => (fx.setupClientId ? `/c/${fx.setupClientId}/setup?step=invite` : null)),
  ref('agency', 'setup-competitors-owner', (fx) => (fx.setupClientId ? `/c/${fx.setupClientId}/setup/competitors` : null)),
  at('agency', 'onboarding', '/onboarding'),
  // Platform
  at('operator', 'platform-overview', '/platform', true),
  ...['agencies', 'ask', 'billing', 'costs', 'health', 'help', 'knowledge', 'knowledge/new', 'leads', 'reviews', 'runbook', 'topics', 'verticals', 'waitlist'].map((p) => at('operator', `platform-${slug(p)}`, `/platform/${p}`, p === 'costs' || p === 'billing')),
  ref('operator', 'platform-agency-detail', (fx) => (fx.agencyId ? `/platform/agencies/${fx.agencyId}` : null), true),
  ref('operator', 'platform-knowledge-article', (fx) => (fx.kbId ? `/platform/knowledge/${fx.kbId}` : null)),
  // Public
  ...['sign-in', 'sign-up', 'sign-up/problem', 'sign-in/check-email', 'start', 'bot', 'link-expired', 'link-other-account', 'no-access', 'waitlist/confirmed', 'no-such-page'].map((p) => at('signed-out', `public-${slug(p)}`, `/${p}`)),
];

export const CRAWL_VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1920, height: 1080 }] as const;
