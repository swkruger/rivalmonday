import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeGoogleAd } from '../ads/google';
import { normalizeMetaAd } from '../ads/meta';
import { scrubReviewerIdentity } from '../evidence/privacy';
import { extractGbpProfile } from '../gbp/collect-gbp';
import { employerMatches, parseJobPosting } from '../jobs/collect';
import { parseMapsItems } from '../local/maps';
import { parseReviewItem } from '../reviews/upsert';

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

type Result = { items: unknown[] } & Record<string, unknown>;
type Envelope = { status_code: number; tasks: { id: string; status_code: number; cost: number; data: Record<string, unknown>; result: Result[] | null }[] };

describe('DataForSEO fixtures (production unless noted, 2026-10-01)', () => {
  it('maps live: the "lat,lng,zoomz" location_coordinate is accepted and items parse', () => {
    const env = fixture('dfs-maps-live.json') as Envelope;
    const [task] = env.tasks;
    expect(task?.status_code).toBe(20000);
    expect(task?.data.location_coordinate).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+z$/);
    expect(task?.cost).toBe(0.002);
    const places = parseMapsItems(task?.result ?? []);
    expect(places.length).toBeGreaterThan(0);
    for (const p of places) {
      expect(p.placeId).toMatch(/^ChIJ/);
      expect(p.cid).toMatch(/^\d+$/);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.rating).toBeGreaterThan(0);
      expect(p.lat).toBeTypeOf('number');
    }
  });

  it('my_business_info live: the profile extracts, with current_status from work_time.work_hours', () => {
    const [result] = fixture('dfs-my-business-info-live.json') as Result[];
    const profile = extractGbpProfile(result?.items[0]);
    expect(profile).toMatchObject({ category: 'HVAC contractor', isClaimed: true, domain: 'www.aireserv.com' });
    expect(profile?.placeId).toMatch(/^ChIJ/);
    expect(profile?.cid).toMatch(/^\d+$/);
    expect(profile?.rating).toBeGreaterThan(0);
    expect(profile?.votes).toBeGreaterThan(0);
    expect(['open', 'close', 'closed', 'temporarily_closed', 'closed_forever']).toContain(profile?.currentStatus);
    expect(profile?.workHours).toBeTruthy();
    expect(Array.isArray(profile?.additionalCategories)).toBe(true);
  });

  it('ads_search live: every creative normalises with first/last shown', () => {
    const [result] = fixture('dfs-ads-search-live.json') as Result[];
    const now = new Date('2026-10-01T19:00:00Z');
    for (const item of result?.items ?? []) {
      const ad = normalizeGoogleAd(item, now);
      expect(ad?.externalId).toMatch(/^CR\d+$/);
      expect(ad?.advertiserId).toMatch(/^AR\d+$/);
      expect(ad?.startedAt).toBeInstanceOf(Date);
      expect(ad?.isActive).toBe(true);
      expect(['text', 'image', 'video']).toContain(ad?.format);
    }
  });

  it('jobs task_get/advanced: postings parse; franchisee employers match the brand name', () => {
    const [result] = fixture('dfs-jobs-task-get.json') as Result[];
    const jobs = (result?.items ?? []).map(parseJobPosting);
    expect(jobs.every((j) => j !== null && j.jobId.length > 0 && j.title)).toBe(true);
    // Known limitation, live-verified: "Aire Serv of <city>" franchisees elsewhere match "Aire Serv".
    expect(jobs.filter((j) => employerMatches(j?.employer, 'Aire Serv')).length).toBe(jobs.length);
  });

  it('reviews task_post (sandbox): the posted tag is echoed under data.tag', () => {
    const env = fixture('dfs-reviews-task-post.json') as Envelope;
    expect(env.tasks[0]?.status_code).toBe(20100);
    expect(env.tasks[0]?.data.tag).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('reviews tasks_ready (sandbox): entries carry id, tag and endpoint', () => {
    const env = fixture('dfs-reviews-tasks-ready.json') as Envelope;
    const [entry] = (env.tasks[0]?.result ?? []) as unknown as Record<string, unknown>[];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('tag');
    expect(String(entry?.endpoint)).toContain('/business_data/google/reviews/task_get/');
  });

  it('reviews task_get (production): items parse with review_id, and nothing identifying survives the scrubber', () => {
    const result = fixture('dfs-reviews-task-get.json') as Result[];
    const salt = 's'.repeat(32);
    const parsed = (result[0]?.items ?? []).map((i) => parseReviewItem(i, salt));
    expect(parsed.length).toBeGreaterThan(0);
    for (const r of parsed) {
      expect(r?.externalId).toBeTruthy();
      expect(r?.dedupeKey).toMatch(/^id:/);
      expect(r?.rating).toBeGreaterThanOrEqual(1);
      expect(r?.postedAt).toBeInstanceOf(Date);
      expect(r?.reviewerHash).toMatch(/^[0-9a-f]{64}$/);
    }
    const scrubbed = JSON.stringify(scrubReviewerIdentity(result, salt));
    expect(scrubbed).not.toMatch(/profile_|"images"|image_url|contrib|googleusercontent/);
    expect(scrubbed).toMatch(/reviewer_hash/);
  });
});
