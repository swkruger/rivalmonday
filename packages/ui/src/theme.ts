import { type Branding, RIVAL_MONDAY_TOKENS } from '@cs/email/branding';

const HEX = /^#[0-9a-fA-F]{6}$/;
const safe = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Linear mix: t = 0 → a, t = 1 → b. Inputs must be #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca.map((x, i) => Math.round(x + (cb[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

const DEFAULT_SOFT = { soft: '#E3F2FC', text: '#1F6FA8' };

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
  return {
    '--primary': primary,
    '--secondary': secondary,
    '--primary-soft': isDefault ? DEFAULT_SOFT.soft : mixHex(primary, '#ffffff', 0.86),
    '--primary-soft-text': isDefault ? DEFAULT_SOFT.text : mixHex(primary, RIVAL_MONDAY_TOKENS.ink, 0.45),
  };
}
