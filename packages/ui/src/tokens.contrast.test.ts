import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './theme';

// Literal copy of docs/design-system/05-design-system-specification.md § 2 "Approved foreground/background pairs".
const INK = '#0B2540';
const MUTED = '#5B6B80';
const PAIRS: Array<[string, string, string, number]> = [
  ['text.primary on surface', INK, '#FFFFFF', 4.5],
  ['text.primary on app', INK, '#F6F9FC', 4.5],
  ['text.primary on muted', INK, '#EEF2F6', 4.5],
  ['text.muted on surface', MUTED, '#FFFFFF', 4.5],
  ['text.muted on app', MUTED, '#F6F9FC', 4.5],
  ['text.muted on muted', MUTED, '#EEF2F6', 4.5],
  ['text.link on surface', '#1F6FA8', '#FFFFFF', 4.5],
  ['text.link on selected', '#1F6FA8', '#E3F2FC', 4.5],
  ['text.inverse on inverse', '#FFFFFF', INK, 4.5],
  ['fridayPillText on fridayPillBg', '#3B2300', '#F5A524', 4.5],
  ['white on action.danger', '#FFFFFF', '#DC2626', 4.5],
  ['white on brand.secondary', '#FFFFFF', '#2A6BAC', 4.5],
  ['ink on action.primary', INK, '#47A8E7', 4.5],
  ['line-strong on surface (UI)', '#8796AB', '#FFFFFF', 3.0],
  ['focus on surface (UI)', '#2A6BAC', '#FFFFFF', 3.0],
];

describe('approved contrast pairs (05 § 2)', () => {
  it.each(PAIRS)('%s', (_n, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('styles.css v1 tokens', () => {
  const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
  it.each([
    '--radius-md: 8px', '--muted-ink: #5B6B80', '--focus: #2A6BAC', '--radius: 0.5rem',
    '--text-13: 0.8125rem', '--text-11: 0.6875rem', '--chip-warning-bg: #FFF7E6',
    '--color-input: var(--line-strong)', '--color-ring: var(--focus)',
    '--secondary-foreground: #FFFFFF', '--color-secondary-foreground: var(--secondary-foreground)',
  ])('contains %s', (s) => {
    expect(css).toContain(s);
  });
});
