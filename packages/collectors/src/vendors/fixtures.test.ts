import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeMetaAd } from '../ads/meta';

// Sanitised raw samples captured from the real vendors (Task 12, 2026-10-01). These lock the live
// response shapes: if a vendor changes a field name, the matching parser must be updated here.
const fixture = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`../../test/fixtures/vendors/${name}`, import.meta.url)), 'utf8'));

describe('Apify Meta Ad Library fixture (curious_coder/facebook-ads-library-scraper, live 2026-10-01)', () => {
  const items = fixture('apify-meta-ad.json') as Record<string, unknown>[];

  it('is snake_case at the top level (not the camelCase the store page suggested)', () => {
    for (const i of items) {
      expect(i).toHaveProperty('ad_archive_id');
      expect(i).toHaveProperty('page_id');
      expect(i).toHaveProperty('is_active');
      expect(i).not.toHaveProperty('adArchiveID');
    }
  });

  it('normalises every item to sensible values', () => {
    for (const raw of items) {
      const ad = normalizeMetaAd(raw);
      expect(ad).not.toBeNull();
      expect(ad?.externalId).toMatch(/^\d+$/);
      expect(ad?.advertiserId).toMatch(/^\d+$/);
      expect(ad?.format).toMatch(/^[A-Z_]+$/);
      expect(ad?.text).toBeTruthy();
      expect(ad?.text).not.toMatch(/\{\{/);
      expect(ad?.mediaUrls.length).toBeGreaterThan(0);
      expect(ad?.landingUrl).toMatch(/^https?:\/\//);
      expect(ad?.publisherPlatforms).toContain('FACEBOOK');
      expect(ad?.isActive).toBe(true);
      expect(ad?.endedAt).toBeNull();
      // start_date is Unix seconds; a 2010s–2030s date proves the unit is right.
      expect(ad?.startedAt?.getUTCFullYear()).toBeGreaterThan(2010);
      expect(ad?.startedAt?.getUTCFullYear()).toBeLessThan(2035);
    }
  });

  it('takes copy and media from snapshot.cards for DCO ads whose body is a template', () => {
    const dco = items.find((i) => (i.snapshot as { display_format?: string }).display_format === 'DCO');
    expect(dco).toBeDefined();
    const ad = normalizeMetaAd(dco);
    expect(ad?.title).not.toMatch(/\{\{/);
    expect(ad?.mediaUrls.every((u) => u.includes('fbcdn'))).toBe(true);
  });
});
