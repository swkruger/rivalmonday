import 'server-only';
import { rehostLogoUrl } from '@cs/db';
import type { Branding } from '@cs/email';
import { getAgencyBranding } from '@cs/tools';
import { themeVars } from '@cs/ui';
import { cache } from 'react';
import { defaultBranding } from './branding';
import { dbs } from './db';
import { webEnv } from './env';
import { requestHost } from './request-host';
import type { Viewer } from './viewer';

/**
 * Launch-gate 6b: the agency's branding row, read once per request (React `cache`, never across requests). `viewerWith`
 * starts it as soon as the membership is known, beside the access-context reads, so the root layout's theme does not
 * wait for them (it is a stage of its own on a 404 or redirect, whose error tree renders the layout again).
 */
export const agencyBrandingOf = cache((agencyId: string) => getAgencyBranding(dbs().service, { agencyId }));

/** Only the proxy's headers (no DB). For a viewer's own branding the host only rehosts the logo, so a missing host = platform. */
const hostForLogo = () => requestHost().catch(() => null);

/**
 * Decision 12: a signed-in/guest viewer's own agency branding; else (signed out or member-less) the agency of the host the
 * request is on (13a1), else the default (`DEFAULT_AGENCY_ID`'s or Rival Monday's).
 * `assistantName` (6b e10) is the agency's Ask assistant, "Friday" when unset or blank.
 *
 * 15a: `cache()` (per request, keyed by the viewer object) so the root layout, `(app)`'s `generateMetadata` and the
 * `AppShell` share one branding read: they all get the same object from the cached `getViewer()`/`getOperatorViewer()`.
 */
export const themeForViewer = cache(async (viewer: Viewer | null): Promise<{ branding: Branding; style: Record<string, string>; assistantName: string }> => {
  const own = viewer && viewer.kind !== 'member-less';
  // Without a viewer agency the host picks the branding, so a bad host header still fails closed (never Rival Monday on an agency host).
  const host = own ? await hostForLogo() : await requestHost();
  const agencyId = own ? viewer.ctx.agencyId : host?.info.kind === 'agency' ? host.info.agencyId : null;
  if (agencyId) {
    const { stored, resolved } = await agencyBrandingOf(agencyId);
    // 13a1 P12: on an agency host the logo is served from that host, never the platform's `/files/logo/…`.
    const branding = host?.info.kind === 'agency' ? { ...resolved, logoUrl: rehostLogoUrl(resolved.logoUrl, webEnv().hostEnv, host.origin) } : resolved;
    return { branding, style: themeVars(branding), assistantName: stored.assistantName?.trim() || 'Friday' };
  }
  const branding = await defaultBranding(dbs().service, webEnv());
  return { branding, style: themeVars(branding), assistantName: 'Friday' };
});
