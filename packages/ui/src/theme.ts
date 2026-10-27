import { type Branding, RIVAL_MONDAY_TOKENS } from '@cs/email/branding';

const HEX = /^#[0-9a-fA-F]{6}$/;
const safe = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Linear mix: t = 0 → a, t = 1 → b. Inputs must be #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca.map((x, i) => Math.round(x + (cb[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

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

const DEFAULT_SOFT = { soft: '#E3F2FC', text: '#1F6FA8' };

/**
 * Hover/active state of a filled `primary` button: mix away from the label
 * colour (toward white under an ink label, toward ink under a white label) by
 * `t`, stepping back toward the base in 1 % steps if the mix would drop the
 * label below 4.5:1. For #47A8E7 this gives #56afe9 (8 %) / #64b6eb (16 %),
 * the :root defaults in styles.css.
 */
function stateShade(primary: string, fg: string, t: number): string {
  const toward = fg === '#0B2540' ? '#FFFFFF' : RIVAL_MONDAY_TOKENS.ink;
  for (let step = Math.round(t * 100); step > 0; step--) {
    const c = mixHex(primary, toward, step / 100);
    if (contrastRatio(fg, c) >= 4.5) return c;
  }
  return primary;
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
  return {
    '--primary': primary,
    '--secondary': secondary,
    '--primary-foreground': primaryFg,
    '--primary-hover': stateShade(primary, primaryFg, 0.08),
    '--primary-active': stateShade(primary, primaryFg, 0.16),
    '--secondary-foreground': readableTextOn(secondary),
    '--primary-soft': isDefault ? DEFAULT_SOFT.soft : mixHex(primary, '#ffffff', 0.86),
    '--primary-soft-text': isDefault ? DEFAULT_SOFT.text : mixHex(primary, RIVAL_MONDAY_TOKENS.ink, 0.45),
  };
}
