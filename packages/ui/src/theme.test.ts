import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mixHex, themeVars } from './theme';

describe('mixHex', () => {
  it('mixes channel-wise and rounds', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#47A8E7', '#47A8E7', 0.3)).toBe('#47a8e7');
  });
});

describe('themeVars', () => {
  it('uses the brand constants for the default primary', () => {
    expect(themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' })).toEqual({
      '--primary': '#47A8E7', '--secondary': '#2A6BAC', '--primary-soft': '#E3F2FC', '--primary-soft-text': '#1F6FA8',
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

describe('styles.css tokens', () => {
  const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
  it('maps --color-line so border-line / bg-line / divide-line draw', () => {
    expect(css).toMatch(/--color-line:\s*var\(--line\);/);
  });
  it('maps the You token to the secondary brand colour', () => {
    expect(css).toMatch(/--you:\s*var\(--secondary\);/);
    expect(css).toMatch(/--color-you:\s*var\(--you\);/);
  });
});
