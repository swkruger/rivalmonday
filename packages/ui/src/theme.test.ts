import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, mixHex, readableTextOn, themeVars } from './theme';

describe('mixHex', () => {
  it('mixes channel-wise and rounds', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#47A8E7', '#47A8E7', 0.3)).toBe('#47a8e7');
  });
});

describe('themeVars', () => {
  it('uses the brand constants for the default primary', () => {
    expect(themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' })).toEqual({
      '--primary': '#47A8E7', '--secondary': '#2A6BAC', '--primary-foreground': '#0B2540', '--secondary-foreground': '#FFFFFF', '--primary-soft': '#E3F2FC', '--primary-soft-text': '#1F6FA8', '--primary-hover': '#56afe9', '--primary-active': '#64b6eb',
    });
  });

  it('derives soft colours for an agency primary', () => {
    const v = themeVars({ primary: '#123ABC', secondary: '#000000' });
    expect(v['--primary-soft']).toBe(mixHex('#123ABC', '#ffffff', 0.86));
    expect(v['--primary-soft-text']).toBe(mixHex('#123ABC', '#0B2540', 0.45));
  });

  it('never emits a non-hex value (Review Focus 5)', () => {
    const v = themeVars({ primary: 'red;}body{display:none', secondary: 'url(x)' });
    expect(Object.values(v).every((x) => /^#[0-9a-fA-F]{6}$/.test(x))).toBe(true);
  });
});

describe('readableTextOn', () => {
  it('readableTextOn picks ink on #47A8E7', () => {
    expect(readableTextOn('#47A8E7')).toBe('#0B2540');
  });
  it('readableTextOn picks white on #0B2540', () => {
    expect(readableTextOn('#0B2540')).toBe('#FFFFFF');
  });
  it('readableTextOn picks white on #2A6BAC', () => {
    expect(readableTextOn('#2A6BAC')).toBe('#FFFFFF');
  });
  it('readableTextOn picks ink on #F5D90A', () => {
    expect(readableTextOn('#F5D90A')).toBe('#0B2540');
  });
  it('themeVars sets --primary-foreground', () => {
    expect(themeVars({ primary: '#F5D90A', secondary: '#000000' })['--primary-foreground']).toBe('#0B2540');
    expect(themeVars({ primary: '#123ABC', secondary: '#000000' })['--primary-foreground']).toBe('#FFFFFF');
    expect(themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' })['--primary-foreground']).toBe('#0B2540');
  });
});

describe('foregrounds and focus', () => {
  const SAMPLES = ['#47A8E7', '#FFD400', '#111111', '#2A6BAC', '#E11D48'];
  it.each(SAMPLES)('%s as primary and as secondary has a readable foreground', (c) => {
    const asPrimary = themeVars({ primary: c, secondary: '#2A6BAC' });
    expect(contrastRatio(asPrimary['--primary-foreground']!, c)).toBeGreaterThanOrEqual(4.5);
    const asSecondary = themeVars({ primary: '#47A8E7', secondary: c });
    expect(contrastRatio(asSecondary['--secondary-foreground']!, c)).toBeGreaterThanOrEqual(4.5);
  });
  it('never returns --focus (fixed #2A6BAC in :root)', () => {
    for (const c of SAMPLES) expect('--focus' in themeVars({ primary: c, secondary: c })).toBe(false);
  });
  it.each(SAMPLES)('%s gets hover/active that differ and keep the foreground at >= 4.5', (c) => {
    const v = themeVars({ primary: c, secondary: '#2A6BAC' });
    const fg = v['--primary-foreground']!;
    for (const k of ['--primary-hover', '--primary-active'] as const) {
      expect(v[k]!.toLowerCase()).not.toBe(c.toLowerCase());
      expect(contrastRatio(fg, v[k]!)).toBeGreaterThanOrEqual(4.5);
    }
    expect(v['--primary-active']).not.toBe(v['--primary-hover']);
  });
  it('mid-tone #D9534F: hover differs from base, active differs from hover, label contrast never drops', () => {
    const c = '#D9534F';
    const v = themeVars({ primary: c, secondary: '#2A6BAC' });
    const fg = v['--primary-foreground']!;
    expect(v['--primary-hover']!.toLowerCase()).not.toBe(c.toLowerCase());
    expect(v['--primary-active']).not.toBe(v['--primary-hover']);
    for (const k of ['--primary-hover', '--primary-active'] as const) {
      expect(contrastRatio(fg, v[k]!)).toBeGreaterThanOrEqual(contrastRatio(fg, c));
    }
  });
  it('default primary gets the ink foreground', () => {
    expect(themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' })['--primary-foreground']).toBe('#0B2540');
  });
});

describe('styles.css tokens', () => {
  const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
  it('wires primary-foreground through the runtime var (not a literal) with an ink default', () => {
    expect(css).toMatch(/@theme inline\s*\{[^}]*--color-primary-foreground:\s*var\(--primary-foreground\);/);
    expect(css).toMatch(/:root\s*\{[^}]*--primary-foreground:\s*#0B2540;/);
  });
  it(':root hover/active defaults equal themeVars for #47A8E7', () => {
    const v = themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' });
    for (const k of ['--primary-hover', '--primary-active']) {
      const m = css.match(new RegExp(String.raw`:root\s*\{[^}]*${k}:\s*(#[0-9a-fA-F]{6});`));
      expect(m?.[1]?.toLowerCase()).toBe(v[k]!.toLowerCase());
    }
  });
  it('maps --color-line so border-line / bg-line / divide-line draw', () => {
    expect(css).toMatch(/--color-line:\s*var\(--line\);/);
  });
  it('maps the You token to the secondary brand colour', () => {
    expect(css).toMatch(/--you:\s*var\(--secondary\);/);
    expect(css).toMatch(/--color-you:\s*var\(--you\);/);
  });
});
