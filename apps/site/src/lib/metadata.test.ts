// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PAGES } from '../../content/pages';
import { SITE_URL } from '../../content/site';
import { effectiveTitle, pageMetadata } from './metadata';

describe('pageMetadata', () => {
  it('canonical is SITE_URL + path', () => {
    const m = pageMetadata('/');
    expect(m.alternates?.canonical).toBe(SITE_URL + '/');
    expect(m.openGraph).toMatchObject({ url: SITE_URL + '/', siteName: 'Rival Monday', type: 'website' });
  });

  it('title within 60', () => {
    expect(String(pageMetadata('/').description).length).toBeLessThanOrEqual(155);
    for (const p of PAGES) expect(effectiveTitle(p).length, p.path).toBeLessThanOrEqual(60);
  });

  it('effective title never repeats the brand', () => {
    for (const p of PAGES) expect(effectiveTitle(p).split('Rival Monday').length - 1, p.path).toBeLessThanOrEqual(1);
  });

  it('brand-bearing titles are absolute, others use the template', () => {
    expect(pageMetadata('/').title).toEqual({ absolute: PAGES.find((p) => p.path === '/')!.title });
  });

  it('twitter card is summary_large_image', () => {
    expect(pageMetadata('/').twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('sets no config OG images (they would override each segment opengraph-image file)', () => {
    for (const p of PAGES) {
      const m = pageMetadata(p.path);
      expect(m.openGraph && 'images' in m.openGraph, p.path).toBeFalsy();
      expect(m.twitter && 'images' in m.twitter, p.path).toBeFalsy();
    }
  });
});
