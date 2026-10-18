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
 * Decision 12: a signed-in/guest viewer's own agency branding, else the host agency's (or Rival Monday's) default.
 * `assistantName` (6b e10) is the agency's Ask assistant, "Friday" when unset or blank.
 *
 * 15a: `cache()` (per request, keyed by the viewer object) so the root layout, `(app)`'s `generateMetadata` and the
 * `AppShell` share one branding read: they all get the same object from the cached `getViewer()`/`getOperatorViewer()`.
 */
export const themeForViewer = cache(async (viewer: Viewer | null): Promise<{ branding: Branding; style: Record<string, string>; assistantName: string }> => {
  if (viewer && viewer.kind !== 'member-less') {
    const { stored, resolved } = await getAgencyBranding(dbs().service, viewer.ctx);
    return { branding: resolved, style: themeVars(resolved), assistantName: stored.assistantName?.trim() || 'Friday' };
  }
  const branding = await defaultBranding(dbs().service, webEnv());
  return { branding, style: themeVars(branding), assistantName: 'Friday' };
});
