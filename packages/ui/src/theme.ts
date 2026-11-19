import { bandColor, brandInk, type Branding, contrastRatio, deltaE, nearestBandShade, passesBandFloor, mixHex, readableTextOn, RIVAL_MONDAY_TOKENS } from '@cs/email/branding';

// One implementation, shared with the emails' button labels and the weekly report PDF's cover band.
export { bandColor, brandInk, contrastRatio, deltaE, mixHex, nearestBandShade, passesBandFloor, readableTextOn };

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

/** Default rival chart slots (styles.css `--chart-rival-1/2`). */
const RIVAL_DEFAULTS = ['#E05A2B', '#14936A'] as const;
/**
 * Replacement rival colours when an agency secondary (`--you`) lands within dE 20 of a default slot.
 * dataviz validator (light, all pairs) with #2A6BAC, #E05A2B, #14936A: lightness band, chroma floor and
 * normal-vision floor pass; each >= 3:1 on white; CVD worst pairs are the same 7.6-7.7 (protan/tritan)
 * floor the defaults have (legend + direct labels carry identity). #B0338C magenta, #7A5C00 dark gold
 * (normal dE >= 17.1), #8A2BE2 violet (>= 16.2). Grey #A3B1C2 is a deliberate neutral (chroma floor n/a).
 */
export const CHART_RIVAL_FALLBACKS: readonly string[] = ['#B0338C', '#7A5C00', '#8A2BE2'];
const SWAP_DELTA_E = 20;

/** Rival slot colours that need swapping (only slots that clash with `secondary`). */
function rivalSwaps(secondary: string): Record<string, string> {
  const out: Record<string, string> = {};
  const slots: string[] = [...RIVAL_DEFAULTS];
  slots.forEach((def, i) => {
    if (deltaE(def, secondary) >= SWAP_DELTA_E) return;
    const other = slots[1 - i]!;
    const pick = CHART_RIVAL_FALLBACKS.find((f) => deltaE(f, secondary) >= SWAP_DELTA_E && deltaE(f, other) >= SWAP_DELTA_E);
    if (!pick) return;
    slots[i] = pick;
    out[`--chart-rival-${i + 1}`] = pick;
  });
  return out;
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
export function themeVars(b: Pick<Branding, 'primary' | 'secondary'> & { headerColor?: string | null }): Record<string, string> {
  const primary = safe(b.primary, RIVAL_MONDAY_TOKENS.primary);
  const secondary = safe(b.secondary, RIVAL_MONDAY_TOKENS.secondary);
  const isDefault = primary.toLowerCase() === RIVAL_MONDAY_TOKENS.primary.toLowerCase();
  const primaryFg = readableTextOn(primary);
  const ink = bandColor({ primary, secondary, headerColor: b.headerColor });
  return {
    '--primary': primary,
    '--secondary': secondary,
    '--primary-foreground': primaryFg,
    '--primary-hover': stateShade(primary, primaryFg, 0.08),
    '--primary-active': stateShade(primary, primaryFg, 0.16),
    '--secondary-foreground': readableTextOn(secondary),
    '--brand-ink': ink,
    '--brand-ink-hover': brandInkHover(ink),
    '--switch-on': contrastRatio('#FFFFFF', secondary) >= 3 ? secondary : ink,
    ...rivalSwaps(secondary),
    '--primary-band-ring': contrastRatio(primary, ink) >= 3 ? primary : '#B7C7DA',
    '--primary-soft': isDefault ? DEFAULT_SOFT.soft : mixHex(primary, '#ffffff', 0.86),
    '--primary-soft-text': isDefault ? DEFAULT_SOFT.text : mixHex(primary, RIVAL_MONDAY_TOKENS.ink, 0.45),
  };
}
