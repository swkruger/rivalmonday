export type ShotAs = 'admin' | 'agency' | 'owner' | 'support' | 'signed-out';
export type ShotFixtures = { clientId: string; competitorId: string; evidenceId: string; briefId: string; agencyId: string; setupClientId: string };
export type ShotRoute = { label: string; path: string | ((fx: ShotFixtures) => string); as: ShotAs; gate?: boolean };

/**
 * One page per archetype per context (spec 4.6, D19). `admin` is the seeded `admin@e2e.test` (agency admin of "E2E Agency"
 * and a platform admin, so it also covers the platform routes; `agency` is a distinct kind kept for later and currently
 * resolves to the same session). `owner` opens the seeded client guest link (read only). `support` is a staff operator
 * inside a read-only support session on "Support Target Agency".
 */
const c = (rest: string) => (fx: ShotFixtures) => `/c/${fx.clientId}${rest}`;

export const SHOT_ROUTES: ShotRoute[] = [
  // Agency
  { label: 'agency-dashboard', path: '/agency', as: 'agency' },
  { label: 'agency-alerts', path: '/agency/alerts', as: 'agency' },
  { label: 'agency-settings-team', path: '/agency/settings/team', as: 'agency' },
  { label: 'agency-settings-branding', path: '/agency/settings/branding', as: 'agency' },
  { label: 'agency-new-client', path: '/agency/clients/new', as: 'agency' },
  // Client workspace
  { label: 'client-overview', path: c(''), as: 'agency' },
  { label: 'client-competitors', path: c('/competitors'), as: 'agency' },
  { label: 'client-changes', path: c('/changes'), as: 'agency' },
  { label: 'client-competitor-detail', path: (fx) => `/c/${fx.clientId}/competitors/${fx.competitorId}`, as: 'agency' },
  { label: 'client-evidence', path: (fx) => `/c/${fx.clientId}/evidence/${fx.evidenceId}`, as: 'agency' },
  { label: 'client-rankings', path: c('/rankings'), as: 'agency' },
  { label: 'client-reviews', path: c('/reviews'), as: 'agency' },
  { label: 'client-ads', path: c('/ads'), as: 'agency' },
  { label: 'client-ask', path: c('/ask'), as: 'agency' },
  { label: 'client-brief', path: (fx) => `/c/${fx.clientId}/briefs/${fx.briefId}`, as: 'agency' },
  { label: 'client-settings-profile', path: c('/settings/profile'), as: 'agency' },
  // Client owner (guest link)
  { label: 'owner-brief', path: (fx) => `/c/${fx.clientId}/briefs/${fx.briefId}`, as: 'owner' },
  { label: 'owner-evidence', path: (fx) => `/c/${fx.clientId}/evidence/${fx.evidenceId}`, as: 'owner' },
  // Platform
  { label: 'platform-overview', path: '/platform', as: 'admin' },
  { label: 'platform-agencies', path: '/platform/agencies', as: 'admin' },
  { label: 'platform-agency-detail', path: (fx) => `/platform/agencies/${fx.agencyId}`, as: 'admin' },
  { label: 'platform-health', path: '/platform/health', as: 'admin' },
  { label: 'platform-costs', path: '/platform/costs', as: 'admin' },
  { label: 'platform-billing', path: '/platform/billing', as: 'admin' },
  { label: 'platform-knowledge', path: '/platform/knowledge', as: 'admin' },
  // Support session (banner over an agency page)
  { label: 'support-agency', path: '/agency', as: 'support' },
  // Onboarding (D19)
  { label: 'setup-profile', path: (fx) => `/c/${fx.setupClientId}/setup`, as: 'agency' },
  { label: 'setup-competitors', path: (fx) => `/c/${fx.setupClientId}/setup?step=competitors`, as: 'agency' },
  { label: 'setup-invite', path: (fx) => `/c/${fx.setupClientId}/setup?step=invite`, as: 'agency' },
  // Signed out
  { label: 'sign-in', path: '/sign-in', as: 'signed-out' },
  { label: 'sign-up', path: '/sign-up', as: 'signed-out' },
  { label: 'start-intake', path: '/start/e2e-invite', as: 'signed-out' },
  { label: 'not-found', path: '/no-such-page', as: 'signed-out' },
];

export const SHOT_VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }] as const;
