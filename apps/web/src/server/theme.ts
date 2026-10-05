import 'server-only';
import type { Branding } from '@cs/email';
import { getAgencyBranding } from '@cs/tools';
import { themeVars } from '@cs/ui';
import { defaultBranding } from './branding';
import { dbs } from './db';
import { webEnv } from './env';
import type { Viewer } from './viewer';

/** Decision 12: a signed-in/guest viewer's own agency branding, else the host agency's (or Rival Monday's) default. */
export async function themeForViewer(viewer: Viewer | null): Promise<{ branding: Branding; style: Record<string, string> }> {
  const branding = viewer && viewer.kind !== 'member-less' ? (await getAgencyBranding(dbs().service, viewer.ctx)).resolved : await defaultBranding(dbs().service, webEnv());
  return { branding, style: themeVars(branding) };
}
