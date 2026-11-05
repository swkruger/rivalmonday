import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { brandInk, brandInkHover, contrastRatio, mixHex, readableTextOn, themeVars } from './theme';

const RM_P = '#47A8E7';
const RM_S = '#2A6BAC';
const FLOOR: ReadonlyArray<readonly [string, number]> = [['#FFFFFF', 7], ['#B7C7DA', 4.5], ['#7FC3F0', 4.5]];
const passesFloor = (c: string) => FLOOR.every(([fg, min]) => contrastRatio(fg, c) >= min);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('brandInk', () => {
  it('RM defaults give #0B2540 and its hover #2D435B', () => {
    expect(brandInk(RM_P, RM_S)).toBe('#0B2540');
    expect(brandInkHover('#0B2540')).toBe('#2D435B');
  });
  it('teal secondary', () => expect(brandInk(RM_P, '#0F766E')).toBe('#0b554f'));
  it('red secondary', () => expect(brandInk(RM_P, '#C0262D')).toBe('#921d22'));
  it('yellow secondary + RM primary falls back to ink', () => expect(brandInk('#47A8E7', '#FFD400')).toBe('#0B2540'));
  it('yellow secondary + teal primary uses the primary', () => expect(brandInk('#0F766E', '#FFD400')).toBe('#0b554f'));
  it('RM secondary + custom violet primary uses the primary', () => expect(brandInk('#7C3AED', RM_S)).toBe('#5c2baf'));
  it('lower-case RM defaults still give #0B2540', () => expect(brandInk('#47a8e7', '#2a6bac')).toBe('#0B2540'));
  it('hover is lighter than its base', () => {
    for (const base of ['#0B2540', '#0b554f', '#921d22', '#5c2baf']) {
      const hover = brandInkHover(base);
      expect(hover).not.toBe(base);
      expect(contrastRatio('#FFFFFF', hover)).toBeLessThan(contrastRatio('#FFFFFF', base));
    }
  });
  it('invalid hex falls back like themeVars', () => {
    expect(brandInk('nope', 'url(x)')).toBe('#0B2540');
  });
  it('property: every output passes the floor and every hover keeps white >= 4.5', () => {
    const rnd = mulberry32(20261105);
    const hexes = ['#0F766E', '#C0262D', '#FFD400', '#7C3AED', '#000000', '#FFFFFF', '#111111', '#9CA3AF', RM_P, RM_S];
    for (let i = 0; i < 200; i++) hexes.push(`#${Math.floor(rnd() * 0x1000000).toString(16).padStart(6, '0')}`);
    for (const s of hexes) for (const p of [RM_P, '#0F766E', s]) {
      const ink = brandInk(p, s);
      expect(passesFloor(ink), `${p}/${s} -> ${ink}`).toBe(true);
      expect(contrastRatio('#FFFFFF', brandInkHover(ink))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('mixHex', () => {
  it('mixes channel-wise and rounds', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#47A8E7', '#47A8E7', 0.3)).toBe('#47a8e7');
  });
});

describe('themeVars', () => {
  it('uses the brand constants for the default primary', () => {
    expect(themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' })).toEqual({
      '--primary': '#47A8E7', '--secondary': '#2A6BAC', '--primary-foreground': '#0B2540', '--secondary-foreground': '#FFFFFF', '--primary-soft': '#E3F2FC', '--primary-soft-text': '#1F6FA8', '--primary-hover': '#56afe9', '--primary-active': '#64b6eb', '--primary-band-ring': '#47A8E7', '--brand-ink': '#0B2540', '--brand-ink-hover': '#2D435B',
    });
  });

  it('emits --brand-ink / --brand-ink-hover derived from the agency colours', () => {
    const v = themeVars({ primary: '#47A8E7', secondary: '#0F766E' });
    expect(v['--brand-ink']).toBe('#0b554f');
    expect(v['--brand-ink-hover']).toBe(brandInkHover('#0b554f'));
  });

  it('ring falls back to #B7C7DA when primary is within 3:1 of brandInk', () => {
    const v = themeVars({ primary: '#47A8E7', secondary: '#0F766E' });
    expect(contrastRatio(v['--primary']!, v['--brand-ink']!)).toBeGreaterThanOrEqual(3);
    expect(v['--primary-band-ring']).toBe('#47A8E7');
    const dark = themeVars({ primary: '#0d5a54', secondary: '#0F766E' });
    expect(contrastRatio('#0d5a54', dark['--brand-ink']!)).toBeLessThan(3);
    expect(dark['--primary-band-ring']).toBe('#B7C7DA');
  });

  it('derives soft colours for an agency primary', () => {
    const v = themeVars({ primary: '#123ABC', secondary: '#000000' });
    expect(v['--primary-soft']).toBe(mixHex('#123ABC', '#ffffff', 0.86));
    expect(v['--primary-soft-text']).toBe(mixHex('#123ABC', '#0B2540', 0.45));
  });

  it('band ring: primary when it stands out on ink, else the light fallback', () => {
    expect(themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' })['--primary-band-ring']).toBe('#47A8E7');
    expect(themeVars({ primary: '#102A43', secondary: '#2A6BAC' })['--primary-band-ring']).toBe('#B7C7DA');
  });

  it('every value is a lowercase-or-upper 6-digit hex', () => {
    expect(Object.values(themeVars({ primary: '#102A43', secondary: '#2A6BAC' })).every((x) => /^#[0-9a-f]{6}$/i.test(x))).toBe(true);
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
