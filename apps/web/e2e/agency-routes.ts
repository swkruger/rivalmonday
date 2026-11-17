import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { routeOfPageDir } from '../scripts/profile-args';
import type { WhiteLabelParams } from './seed';

/**
 * 13a2 Q5: what the leak crawl expects of every app route on an agency host, as the seeded client owner (`asker@e2e.test`),
 * or signed out for `public`.
 *   client      200 for the client's own session
 *   client_404  the client session is refused with a 404 (agency-only or role-gated page)
 *   public      200 without a session
 *   deny        404 on an agency host for everyone (platform-only paths, `routeForHost`)
 *   bounce      404 for the client session and for no session: V11 `/agency*`, `/onboarding*`, `/platform*` (never a redirect to the platform)
 *   error       500 (the E2E throw page)
 */
export type RouteClass = 'client' | 'client_404' | 'public' | 'deny' | 'bounce' | 'error';

/** Every `app` folder holding a `page.tsx`, as its route (groups dropped, `[param]` kept). */
export function appRoutes(appDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name === 'page.tsx') {
        const route = routeOfPageDir(relative(appDir, dir).split(sep).join('/'));
        if (route !== null) out.push(route);
      }
    }
  };
  walk(appDir);
  return [...new Set(out)].sort();
}

/** One entry per route: a new page fails `agency-routes.test.ts` until it is classified here. */
export const AGENCY_HOST_ROUTES: Record<string, RouteClass> = {
  // Signed-in client area
  '/': 'client',
  '/inbox': 'client',
  '/paused': 'client',
  '/no-access': 'client',
  '/kb/[id]': 'client',
  '/settings/notifications': 'client',
  '/settings/profile': 'client',
  '/c/[clientId]': 'client',
  '/c/[clientId]/ads': 'client',
  '/c/[clientId]/alerts/[alertId]': 'client',
  '/c/[clientId]/ask': 'client',
  '/c/[clientId]/ask/[threadId]': 'client',
  '/c/[clientId]/briefs': 'client',
  '/c/[clientId]/briefs/[briefId]': 'client',
  '/c/[clientId]/changes': 'client',
  '/c/[clientId]/competitors': 'client',
  '/c/[clientId]/competitors/[competitorId]': 'client',
  '/c/[clientId]/events': 'client',
  '/c/[clientId]/evidence/[evidenceId]': 'client',
  '/c/[clientId]/help': 'client',
  '/c/[clientId]/listings': 'client',
  '/c/[clientId]/moves': 'client',
  '/c/[clientId]/pitch-snapshot': 'client_404',
  '/c/[clientId]/pricing': 'client',
  '/c/[clientId]/rankings': 'client',
  '/c/[clientId]/recommendations': 'client',
  '/c/[clientId]/reports/[reportId]': 'client',
  '/c/[clientId]/reviews': 'client',
  '/c/[clientId]/settings': 'client',
  '/c/[clientId]/settings/ai': 'client',
  '/c/[clientId]/settings/alerts': 'client',
  '/c/[clientId]/settings/billing': 'client',
  '/c/[clientId]/settings/delivery': 'client_404', // agency staff only
  '/c/[clientId]/settings/profile': 'client',
  '/c/[clientId]/settings/runbook': 'client_404',
  '/c/[clientId]/settings/usage': 'client', // agency roles and the client owner
  // Setup wizard: staff only. An owner is redirected from /setup to the Overview (200 after the hop); /setup/competitors is 404 unless the owner is asked to pick (16)
  '/c/[clientId]/setup': 'client',
  '/c/[clientId]/setup/competitors': 'client_404',
  // Public pages an agency host serves
  '/sign-in': 'public',
  '/sign-in/check-email': 'public',
  '/link-expired': 'public',
  '/link-other-account': 'public',
  '/start/[slug]': 'public',
  '/start/v/[leadId]': 'deny',
  '/start/verify': 'public', // where an unknown or used verify link lands
  // Not served on an agency host at all (`AGENCY_HOST_DENY`, dev panel)
  '/bot': 'deny',
  '/dev-panel/gallery': 'deny',
  '/oauth/consent': 'deny',
  '/join/[token]': 'deny',
  '/sign-up': 'deny',
  '/sign-up/problem': 'deny',
  '/start': 'deny',
  '/u/[token]/confirm': 'deny',
  '/u/[token]/done': 'deny',
  '/waitlist/confirmed': 'deny',
  '/sample/[token]': 'deny',
  // The E2E throw page (`E2E_THROW_PAGE=1`)
  '/e2e-throw': 'error',
  // V11: staff areas (agency, onboarding, platform) are 404 on an agency host for clients and signed-out requests
  '/agency': 'bounce',
  '/agency/alerts': 'bounce',
  '/agency/approvals': 'bounce',
  '/agency/approvals/[briefId]': 'bounce',
  '/agency/clients/new': 'bounce',
  '/agency/help': 'bounce',
  '/agency/leads': 'bounce',
  '/agency/prospects': 'bounce',
  '/agency/prospects/[clientId]': 'bounce',
  '/agency/prospects/new': 'bounce',
  '/agency/settings': 'bounce',
  '/agency/settings/ai': 'bounce',
  '/agency/settings/billing': 'bounce',
  '/agency/settings/branding': 'bounce',
  '/agency/settings/domains': 'bounce',
  '/agency/settings/intake': 'bounce',
  '/agency/settings/intake/preview': 'bounce',
  '/agency/settings/platform-access': 'bounce',
  '/agency/settings/runbook': 'bounce',
  '/agency/settings/slack-teams': 'bounce',
  '/agency/settings/team': 'bounce',
  '/agency/settings/usage': 'bounce',
  '/onboarding': 'bounce',
  '/platform': 'bounce',
  '/platform/agencies': 'bounce',
  '/platform/agencies/[id]': 'bounce',
  '/platform/ask': 'bounce',
  '/platform/ask/[threadId]': 'bounce',
  '/platform/billing': 'bounce',
  '/platform/costs': 'bounce',
  '/platform/health': 'bounce',
  '/platform/help': 'bounce',
  '/platform/knowledge': 'bounce',
  '/platform/knowledge/[id]': 'bounce',
  '/platform/knowledge/new': 'bounce',
  '/platform/leads': 'bounce',
  '/platform/reviews': 'bounce',
  '/platform/runbook': 'bounce',
  '/platform/topics': 'bounce',
  '/platform/verticals': 'bounce',
  '/platform/waitlist': 'bounce',
};

/**
 * Routes that legitimately redirect on the same host before answering 200: where the chain must end (a template, filled like the
 * route). Every other `client` or `public` route must answer at its own path, so a rejected session (sign-in, no-access) cannot pass.
 */
export const FINAL_PATH: Record<string, string> = {
  // `/c/*`: the Overview of whichever client the user opens by default (not necessarily the crawl's).
  '/': '/c/*',
  // Pages that show only in a state this session is not in (paused client, no membership): an active owner is sent to the Overview.
  '/paused': '/c/*',
  '/no-access': '/c/*',
  '/settings/notifications': '/settings/profile',
  '/c/[clientId]/settings': '/c/[clientId]/settings/profile',
  '/c/[clientId]/setup': '/c/[clientId]',
};

/** The ids a dynamic segment takes. An unknown segment throws in `fillRoute`: a new param must be given a value, never skipped. */
export function routeParams(clientId: string, p: WhiteLabelParams): Record<string, string> {
  return {
    clientId,
    briefId: p.briefId,
    alertId: p.alertId,
    reportId: p.reportId,
    competitorId: p.competitorId,
    evidenceId: p.evidenceId,
    threadId: p.threadId,
    id: p.kbId,
    slug: p.intakeSlug,
    // Pages that need a real token or lead refuse a made-up one the same way everywhere; the crawl only needs the shape.
    token: 'not-a-real-token',
    leadId: '00000000-0000-4000-8000-000000000000',
  };
}

/** `/c/[clientId]/ask/[threadId]` → `/c/<id>/ask/<thread>`. */
export function fillRoute(route: string, params: Record<string, string>): string {
  return route.replace(/\[([^\]]+)\]/g, (_m, name: string) => {
    const v = params[name];
    if (v === undefined) throw new Error(`route ${route}: no value for [${name}]`);
    return v;
  });
}
