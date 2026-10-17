import 'server-only';
import { loadBranding } from '@cs/engine';
import { resolveBranding } from '@cs/email';
import { resolveIntake } from '@cs/tools';
import { themeVars } from '@cs/ui';
import { cache } from 'react';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';

/**
 * Phase 11c: how a public intake page looks. `platform` = Rival Monday (L4, `/start` only); an agency page carries only the
 * agency's branding; `neutral` names nobody (an expired link whose intake page is unknown). `style` holds only the
 * validated hex colours `themeVars` returns.
 */
export type IntakeBrand =
  | { kind: 'platform'; displayName: 'Rival Monday'; logoUrl: null; style: Record<string, string> }
  | { kind: 'agency'; displayName: string; logoUrl: string | null; style: Record<string, string> }
  | { kind: 'neutral'; displayName: null; logoUrl: null; style: Record<string, string> };

const platformStyle = () => themeVars(resolveBranding('Rival Monday', null));

export const platformBrand = (): IntakeBrand => ({ kind: 'platform', displayName: 'Rival Monday', logoUrl: null, style: platformStyle() });
export const neutralBrand = (): IntakeBrand => ({ kind: 'neutral', displayName: null, logoUrl: null, style: platformStyle() });
export const agencyBrand = (b: { displayName: string; logoUrl: string | null; primary: string; secondary: string }): IntakeBrand =>
  ({ kind: 'agency', displayName: b.displayName, logoUrl: b.logoUrl, style: themeVars(b) });

/** An enabled agency intake page's branding, or null (unknown, disabled, non-serviceable → the page 404s). */
export const agencyIntake = cache(async (slug: string): Promise<IntakeBrand | null> => {
  const { service } = dbs();
  const target = await resolveIntake(service, slug);
  if (!target?.agencyId) return null;
  return agencyBrand(await loadBranding(service, target.agencyId));
});

/** The Turnstile site key reaches the browser only in DEV (never DEMO/TEST), exactly as on `/sign-up`. */
export const turnstileSiteKey = (): string | null => (activeEnvName() === 'dev' ? (webEnv().turnstile?.siteKey ?? null) : null);

export const NOINDEX = { index: false, follow: false } as const;
