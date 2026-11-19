import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { bandColor, brandInk, deltaE, nearestBandShade, passesBandFloor, resolveBranding } from './branding';
import { ReportCover } from './templates/report-cover';

const fixed = ['#0F766E', '#7C3AED', '#C0262D', '#16A34A', '#E05A2B', '#FFD400', '#F5A524', '#9CA3AF', '#FFFFFF', '#000000'];
const seeded = (n: number) => {
  let s = 12345;
  return Array.from({ length: n }, () => '#' + [0, 1, 2].map(() => ((s = (s * 1103515245 + 12345) & 0x7fffffff), (s >> 16) & 255).toString(16).padStart(2, '0')).join(''));
};
const samples = [...fixed, ...seeded(200)];

describe('band colour', () => {
  it('nearestBandShade keeps a passing colour and fixes failing ones', () => {
    expect(nearestBandShade('#0b554f')).toBe('#0b554f');
    for (const x of ['#FFD400', '#47A8E7', '#FFFFFF']) expect(passesBandFloor(nearestBandShade(x))).toBe(true);
  });
  it('always yields a passing shade and band colour', () => {
    samples.forEach((x, i) => {
      expect(passesBandFloor(nearestBandShade(x))).toBe(true);
      expect(passesBandFloor(bandColor({ primary: x, secondary: samples[(i + 7) % samples.length]!, headerColor: null }))).toBe(true);
    });
  });
  it('passesBandFloor rejects non-hex input', () => {
    expect(passesBandFloor('red')).toBe(false);
    expect(passesBandFloor('#abc')).toBe(false);
  });
  it('bandColor prefers headerColor and tolerates it being undefined', () => {
    expect(bandColor({ primary: '#0F766E', secondary: '#2A6BAC', headerColor: '#0b554f' })).toBe('#0b554f');
    expect(bandColor({ primary: '#0F766E', secondary: '#2A6BAC' })).toBe(brandInk('#0F766E', '#2A6BAC'));
  });
  it('resolveBranding keeps only a passing headerColor', () => {
    expect(resolveBranding('A', { headerColor: '#FFD400' }).headerColor).toBeNull();
    expect(resolveBranding('A', { headerColor: 'red' } as never).headerColor).toBeNull();
    expect(resolveBranding('A', { headerColor: '#0b554f' }).headerColor).toBe('#0b554f');
    expect(resolveBranding('A', null).headerColor).toBeNull();
  });
  it('deltaE is about 100 for black vs white and 0 for identical colours', () => {
    expect(Math.abs(deltaE('#000000', '#FFFFFF') - 100)).toBeLessThanOrEqual(0.5);
    expect(deltaE('#0F766E', '#0F766E')).toBe(0);
  });
  it('the report cover band uses the header colour when set', () => {
    const b = resolveBranding('Acme', { headerColor: '#0b554f' });
    const html = renderToStaticMarkup(createElement(ReportCover, { branding: b, clientName: 'C', deliveryDate: '2026-10-05', periodLabel: '' }));
    expect(html.toLowerCase()).toContain('background-color:#0b554f');
  });
});
