import type { AgencyBranding } from '@cs/db';

/** docs/brand/brand.md tokens: the defaults for any agency that has not set its own. */
export const RIVAL_MONDAY_TOKENS = { primary: '#47A8E7', secondary: '#2A6BAC', accent: '#F5A524', ink: '#0B2540', canvas: '#F6F9FC', panel: '#EEF2F6' } as const;

/**
 * `EMAIL_FROM` is a bare address: templates send as `"<brand>" <EMAIL_FROM>`, so a display name in the variable makes
 * a From Postmark refuses ("Error parsing 'From'"; staging, 2026-11-02). Web and worker refuse to start with one.
 */
export const isBareEmailAddress = (s: string) => /^[^\s<>"(),;:@]+@[^\s<>"(),;:@]+\.[^\s<>"(),;:@]+$/.test(s);
export const EMAIL_FROM_PROBLEM = 'EMAIL_FROM must be a bare address such as briefs@mail.example.com, without a display name';

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
};

/** WCAG 2.x contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Whichever of white / ink (#0B2540) has the higher contrast on `bg` (ties go to ink); design system v1 puts an ink label on the default #47A8E7. */
export function readableTextOn(bg: string): '#FFFFFF' | '#0B2540' {
  return contrastRatio('#FFFFFF', bg) > contrastRatio('#0B2540', bg) ? '#FFFFFF' : '#0B2540';
}

const safeHex = (v: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);

/** Linear mix: t = 0 → a, t = 1 → b. Inputs must be #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca.map((x, i) => Math.round(x + (cb[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

const BAND_FLOOR: ReadonlyArray<readonly [string, number]> = [['#FFFFFF', 7], ['#B7C7DA', 4.5], ['#7FC3F0', 4.5]];
const passesFloor = (c: string) => BAND_FLOOR.every(([fg, min]) => contrastRatio(fg, c) >= min);

/** Deep shade of the agency colour for the title band / ink buttons (spec B2). */
export function brandInk(primary: string, secondary: string): string {
  const candidates = [
    [safeHex(secondary, RIVAL_MONDAY_TOKENS.secondary), RIVAL_MONDAY_TOKENS.secondary],
    [safeHex(primary, RIVAL_MONDAY_TOKENS.primary), RIVAL_MONDAY_TOKENS.primary],
  ] as const;
  for (const [c, rmDefault] of candidates) {
    if (c.toLowerCase() === rmDefault.toLowerCase()) continue;
    for (let k = 0; k <= 50; k++) {
      const shade = mixHex(c, '#000000', k / 100);
      if (passesFloor(shade)) return shade;
    }
  }
  return RIVAL_MONDAY_TOKENS.ink;
}

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
  /** How clients reach the agency (`agency_profile`): only `loadBranding` fills it, and client-facing emails show it. Absent on platform branding. */
  contact?: AgencyContact | null;
}

export interface AgencyContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
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

/** The profile's contact fields made safe to print; null when they give a client no way to get in touch. */
export function resolveAgencyContact(p: { contactName?: string | null; contactEmail?: string | null; phone?: string | null; line1?: string | null; line2?: string | null; city?: string | null; region?: string | null; postalCode?: string | null } | null | undefined): AgencyContact | null {
  if (!p) return null;
  const part = (s: string | null | undefined) => text(s ?? undefined, 120);
  const email = part(p.contactEmail);
  const place = [part(p.city), [part(p.region), part(p.postalCode)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const contact = {
    name: part(p.contactName), phone: part(p.phone), email: email && EMAIL.test(email) ? email : null,
    address: [part(p.line1), part(p.line2), place].filter(Boolean).join(', ') || null,
  };
  return contact.phone || contact.email || contact.address ? contact : null;
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
