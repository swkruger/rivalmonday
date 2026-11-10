// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GALLERY } from './gallery';

describe('gallery content', () => {
  it('five slides in the decided order with the decided labels', () => {
    expect(GALLERY.slides.map((s) => s.id)).toEqual(['dashboard', 'brief', 'map', 'ads', 'friday']);
    expect(GALLERY.slides.map((s) => s.label)).toEqual(['Dashboard', 'Monday brief', 'Map rankings', 'Ads', 'Friday']);
    expect([GALLERY.caption, GALLERY.tablist, GALLERY.pause, GALLERY.play]).toEqual(['Sample data from a fictional business.', 'Product screenshots', 'Pause', 'Play']);
  });

  it('every picture file exists in public/sample in both sizes', () => {
    for (const s of GALLERY.slides) {
      expect(s.src).toBe(`/sample/gallery-${s.id}.webp`);
      expect(s.srcSmall).toBe(`/sample/gallery-${s.id}-720.webp`);
      expect(existsSync(join(__dirname, '..', 'public', s.src)), s.src).toBe(true);
      expect(existsSync(join(__dirname, '..', 'public', s.srcSmall)), s.srcSmall).toBe(true);
      expect([s.width, s.height]).toEqual([1440, 900]);
    }
  });

  it('alts are 40–200 characters and name no vendor', () => {
    for (const s of GALLERY.slides) {
      expect(s.alt.length).toBeGreaterThanOrEqual(40);
      expect(s.alt.length).toBeLessThanOrEqual(200);
      expect(s.alt).not.toMatch(/dataforseo|apify|scrapecreators|stadia|openrouter|google/i);
    }
  });

  it('dwell is 6000 ms', () => {
    expect(GALLERY.dwellMs).toBe(6000);
  });
});
