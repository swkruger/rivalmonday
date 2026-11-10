import { CHANGE_TYPES } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { CHANGE_LABELS, GROUP_PHRASE, changeTypeLabel, groupPhrase } from './labels';

describe('CHANGE_LABELS', () => {
  it('has a hand-written label for every change type', () => {
    for (const t of CHANGE_TYPES) expect(CHANGE_LABELS[t], t).toBeTruthy();
  });
  it('labels the 18a-1 types', () => {
    expect(changeTypeLabel('status_change')).toBe('Opening status change');
    expect(changeTypeLabel('profile_change')).toBe('Profile change');
    expect(changeTypeLabel('audience_growth')).toBe('Audience growth');
  });
  it('labels the 18a-2 types', () => {
    expect(changeTypeLabel('site_feature')).toBe('Website tool change');
    expect(changeTypeLabel('new_page')).toBe('New website page');
  });
});

describe('rank_change labels', () => {
  it('reads neutrally, as one event type covers map and Google page-one changes', () => {
    expect(changeTypeLabel('rank_change')).toBe('Ranking change');
    expect(groupPhrase('rank_change', null, 2)).toBe('2 ranking changes');
  });
});

describe('GROUP_PHRASE', () => {
  it('has an entry for every CHANGE_LABELS key (except the cosmetic-only ones fall back sensibly)', () => {
    for (const t of Object.keys(CHANGE_LABELS)) expect(groupPhrase(t, null, 2), t).toMatch(/^2 \S/);
    for (const t of ['price_change', 'promo', 'new_service', 'service_removed', 'service_area_change', 'new_location', 'hiring', 'ad_started', 'ad_stopped', 'review_spike', 'rating_change', 'rank_change', 'tier_change', 'content']) expect(GROUP_PHRASE[t], t).toBeTypeOf('function');
    for (const t of ['status_change', 'profile_change', 'audience_growth', 'site_feature', 'new_page']) expect(GROUP_PHRASE[t], t).toBeTypeOf('function');
  });
  it('ad phrases name Google and Meta by channel', () => {
    expect(groupPhrase('ad_started', 'google_ads', 3)).toBe('3 Google ads started');
    expect(groupPhrase('ad_started', 'meta_ads', 2)).toBe('2 Meta ads started');
    expect(groupPhrase('ad_started', null, 2)).toBe('2 new ads');
    expect(groupPhrase('ad_stopped', 'google_ads', 2)).toBe('2 Google ads stopped');
    expect(groupPhrase('ad_stopped', 'meta_ads', 2)).toBe('2 Meta ads stopped');
    expect(groupPhrase('ad_stopped', 'x', 2)).toBe('2 ads stopped');
  });
  it('gives the 18a types plain plural phrases', () => {
    expect(groupPhrase('status_change', null, 2)).toBe('2 opening status changes');
    expect(groupPhrase('profile_change', null, 2)).toBe('2 profile changes');
    expect(groupPhrase('audience_growth', null, 2)).toBe('2 audience growth updates');
    expect(groupPhrase('site_feature', null, 2)).toBe('2 website tool changes');
    expect(groupPhrase('new_page', null, 2)).toBe('2 new website pages');
  });
  it('falls back to the label or a humanised type for an unmapped type', () => {
    expect(groupPhrase('brand_new_type', null, 2)).toBe('2 brand new type changes');
  });
});
