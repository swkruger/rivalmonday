import 'server-only';
import type { Branding } from '@cs/email';
import { getAgencyBranding } from '@cs/tools';
import { themeVars } from '@cs/ui';
import { cache } from 'react';
import { defaultBranding } from './branding';
import { dbs } from './db';
import { webEnv } from './env';
import type { Viewer } from './viewer';

/**
 * Launch-gate 6b: the agency's branding row, read once per request (React `cache`, never across requests). `viewerWith`
 * starts it as soon as the membership is known, beside the access-context reads, so the root layout's theme does not
 * wait for them (it is a stage of its own on a 404 or redirect, whose error tree renders the layout again).
 */
export const agencyBrandingOf = cache((agencyId: string) => getAgencyBranding(dbs().service, { agencyId }));

/**
 * Decision 12: a signed-in/guest viewer's own agency branding, else the host agency's (or Rival Monday's) default.
 * `assistantName` (6b e10) is the agency's Ask assistant, "Friday" when unset or blank.
 *
 * 15a: `cache()` (per request, keyed by the viewer object) so the root layout, `(app)`'s `generateMetadata` and the
 * `AppShell` share one branding read: they all get the same object from the cached `getViewer()`/`getOperatorViewer()`.
 */
export const themeForViewer = cache(async (viewer: Viewer | null): Promise<{ branding: Branding; style: Record<string, string>; assistantName: string }> => {
  if (viewer && viewer.kind !== 'member-less') {
    const { stored, resolved } = await agencyBrandingOf(viewer.ctx.agencyId);
    return { branding: resolved, style: themeVars(resolved), assistantName: stored.assistantName?.trim() || 'Friday' };
  }
  const branding = await defaultBranding(dbs().service, webEnv());
  return { branding, style: themeVars(branding), assistantName: 'Friday' };
});
