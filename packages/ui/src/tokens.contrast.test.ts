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
  ['white on ink-hover', '#FFFFFF', '#2D435B', 4.5],
  ['white on success-strong', '#FFFFFF', '#15803D', 4.5],
  ['white on success-strong-hover', '#FFFFFF', '#166534', 4.5],
  ['on-ink-muted on ink', '#B7C7DA', INK, 4.5],
  ['on-ink-link on ink', '#7FC3F0', INK, 4.5],
  ['muted on chrome', MUTED, '#FBFCFE', 4.5],
  ['chip-info-text on chip-info-bg', '#1F5F8F', '#E3F2FC', 4.5],
  ['amber-text on amber', '#3B2300', '#F5A524', 4.5],
  ['muted on lane info', MUTED, '#E3F2FC', 4.5],
  ['muted on lane success', MUTED, '#E7F6EC', 4.5],
  ['focus(on-ink) on ink (UI)', '#FFFFFF', INK, 3.0],
  // KPI cell: 3 % wash + 7 % trace area, for a near-black agency colour (the worst case). `.rm-kpi` --muted-ink.
  ['kpi caption on wash and trace', '#4F5F73', '#E6E6E6', 4.5],
];

describe('approved contrast pairs (05 § 2)', () => {
  it.each(PAIRS)('%s', (_n, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('styles.css v1 tokens', () => {
  const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
  it(':root --brand-ink passes the band floor', () => {
    const m = css.match(/:root\s*\{[^}]*--brand-ink:\s*(#[0-9a-fA-F]{6});/);
    expect(m).not.toBeNull();
    for (const [fg, min] of [['#FFFFFF', 7], ['#B7C7DA', 4.5], ['#7FC3F0', 4.5]] as const) {
      expect(contrastRatio(fg, m![1]!)).toBeGreaterThanOrEqual(min);
    }
  });
  it('wires --color-brand-ink and the ink band to --brand-ink', () => {
    expect(css).toContain('--color-brand-ink: var(--brand-ink);');
    expect(css).toContain('--color-brand-ink-hover: var(--brand-ink-hover);');
    expect(css).toMatch(/\.rm-ink-band\s*\{\s*background:\s*var\(--brand-ink\)/);
  });
  it.each([
    '--radius-md: 8px', '--muted-ink: #5B6B80', '--focus: #2A6BAC', '--radius: 0.5rem',
    '--text-13: 0.8125rem', '--text-11: 0.6875rem', '--chip-warning-bg: #FFF7E6',
    '--color-input: var(--line-strong)', '--color-ring: var(--focus)',
    '--secondary-foreground: #FFFFFF', '--color-secondary-foreground: var(--secondary-foreground)',
    '--chrome: #FBFCFE', '--success-strong: #15803D', '--on-ink-muted: #B7C7DA', '--primary-band-ring: var(--primary)', '.rm-ink-band',
    '.rm-ink-band [data-slot="pressure-badge"]', '.rm-ink-band [data-slot="business-avatar"]', '.rm-ink-band [data-slot="help-tip"]:hover',
  ])('contains %s', (s) => {
    expect(css).toContain(s);
  });
});
