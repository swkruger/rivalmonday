import type { AgencyBranding } from '@cs/db';

/** docs/brand/brand.md tokens: the defaults for any agency that has not set its own. */
export const RIVAL_MONDAY_TOKENS = { primary: '#47A8E7', secondary: '#2A6BAC', accent: '#F5A524', ink: '#0B2540', canvas: '#F6F9FC', panel: '#EEF2F6' } as const;

export interface Branding {
  displayName: string;
  logoUrl: string | null;
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
  canvas: string;
  panel: string;
  fromName: string;
  fromEmail: string | null;
  signOff: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const text = (s: string | undefined, max: number) => (s && s.trim() ? s.trim().slice(0, max) : null);
const color = (s: string | undefined, fallback: string) => (s && HEX.test(s) ? s : fallback);
function httpsUrl(s: string | undefined): string | null {
  if (!s) return null;
  try {
    return new URL(s).protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

/** Phase 4b decision 14: stored agency settings with every unsafe or missing value replaced by a default. */
export function resolveBranding(agencyName: string, stored: AgencyBranding | null): Branding {
  const b = stored ?? {};
  const displayName = text(b.displayName, 80) ?? agencyName;
  return {
    displayName, logoUrl: httpsUrl(b.logoUrl),
    primary: color(b.primary, RIVAL_MONDAY_TOKENS.primary), secondary: color(b.secondary, RIVAL_MONDAY_TOKENS.secondary), accent: color(b.accent, RIVAL_MONDAY_TOKENS.accent),
    ink: RIVAL_MONDAY_TOKENS.ink, canvas: RIVAL_MONDAY_TOKENS.canvas, panel: RIVAL_MONDAY_TOKENS.panel,
    fromName: text(b.fromName, 80) ?? displayName, fromEmail: b.fromEmail && EMAIL.test(b.fromEmail) ? b.fromEmail : null, signOff: text(b.signOff, 300),
  };
}
