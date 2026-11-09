import { brandInk, type Branding, contrastRatio, mixHex, readableTextOn, RIVAL_MONDAY_TOKENS } from '@cs/email/branding';

// One implementation, shared with the emails' button labels and the weekly report PDF's cover band.
export { brandInk, contrastRatio, mixHex, readableTextOn };

const HEX = /^#[0-9a-fA-F]{6}$/;
const safe = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);

/** Hover of a brand-ink fill (spec B3): lighter, white label kept >= 4.5:1. */
export function brandInkHover(base: string): string {
  if (base.toLowerCase() === RIVAL_MONDAY_TOKENS.ink.toLowerCase()) return '#2D435B';
  for (let step = 14; step > 0; step--) {
    const c = mixHex(base, '#FFFFFF', step / 100);
    if (contrastRatio('#FFFFFF', c) >= 4.5) return c;
  }
  return base;
}

const DEFAULT_SOFT = { soft: '#E3F2FC', text: '#1F6FA8' };

/**
 * Hover/active state of a filled `primary` button: mix away from the label
 * colour (toward white under an ink label, toward ink under a white label) by
 * `t`, stepping back toward the base in 1 % steps if the mix would drop the
 * label below 4.5:1; when no step reaches 4.5:1 (label already fails on the base) the full `t` mix is used. For #47A8E7 this gives #56afe9 (8 %) / #64b6eb (16 %),
 * the :root defaults in styles.css.
 */
function stateShade(primary: string, fg: string, t: number): string {
  const toward = fg === '#0B2540' ? '#FFFFFF' : RIVAL_MONDAY_TOKENS.ink;
  for (let step = Math.round(t * 100); step > 0; step--) {
    const c = mixHex(primary, toward, step / 100);
    if (contrastRatio(fg, c) >= 4.5) return c;
  }
  return mixHex(primary, toward, t); // mixing away from the label only raises contrast: never worse than the base
}

/**
 * CSS variables for the root element; every value is a validated 6-digit hex
 * (Review Focus 5 — nothing unvalidated reaches a style attribute). Only
 * `primary`/`secondary` are per-agency; `accent` (brand amber) is fixed and
 * lives in styles.css, not here.
 */
export function themeVars(b: Pick<Branding, 'primary' | 'secondary'>): Record<string, string> {
  const primary = safe(b.primary, RIVAL_MONDAY_TOKENS.primary);
  const secondary = safe(b.secondary, RIVAL_MONDAY_TOKENS.secondary);
  const isDefault = primary.toLowerCase() === RIVAL_MONDAY_TOKENS.primary.toLowerCase();
  const primaryFg = readableTextOn(primary);
  const ink = brandInk(primary, secondary);
  return {
    '--primary': primary,
    '--secondary': secondary,
    '--primary-foreground': primaryFg,
    '--primary-hover': stateShade(primary, primaryFg, 0.08),
    '--primary-active': stateShade(primary, primaryFg, 0.16),
    '--secondary-foreground': readableTextOn(secondary),
    '--brand-ink': ink,
    '--brand-ink-hover': brandInkHover(ink),
    '--primary-band-ring': contrastRatio(primary, ink) >= 3 ? primary : '#B7C7DA',
    '--primary-soft': isDefault ? DEFAULT_SOFT.soft : mixHex(primary, '#ffffff', 0.86),
    '--primary-soft-text': isDefault ? DEFAULT_SOFT.text : mixHex(primary, RIVAL_MONDAY_TOKENS.ink, 0.45),
  };
}
