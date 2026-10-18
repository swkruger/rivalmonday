import type { GbpProfile } from '@cs/collectors';
import { describe, expect, it } from 'vitest';
import { buildSuggestionSource, setupSuggestionsJsonSchema, validateSuggestions } from './suggestions';

const packServices = [{ id: 'ac_repair', name: 'AC Repair' }, { id: 'drain_cleaning', name: 'Drain Cleaning' }];
const sourceText = 'We offer 24/7 AC repair and  drain\ncleaning.  “Emergency plumber” in Austin. It’s family-owned.';
const ctx = { packServices, sourceText, city: 'Austin' as string | null };

describe('validateSuggestions', () => {
  it('matches quotes across curly quotes, whitespace and case', () => {
    const r = validateSuggestions({
      services: [{ id: 'drain_cleaning', quote: 'DRAIN CLEANING' }],
      keywords: [{ text: 'emergency plumber', quote: '"emergency plumber" in austin' }, { text: 'family', quote: "it's family-owned" }],
    }, ctx);
    expect(r?.services).toEqual([{ value: 'drain_cleaning', quote: 'DRAIN CLEANING' }]);
    expect(r?.keywords.map((k) => k.value)).toEqual(['emergency plumber', 'family', 'drain cleaning austin']);
  });

  it('drops invented quotes, unknown ids and too-short quotes', () => {
    const r = validateSuggestions({
      services: [{ id: 'ac_repair', quote: 'we fix every roof' }, { id: 'roofing', quote: 'ac repair' }, { id: 'ac_repair', quote: 'ac' }],
      keywords: [{ text: 'roof repair', quote: 'roof repair' }],
    }, { ...ctx, city: null });
    expect(r).toEqual({ services: [], keywords: [] });
  });

  it('drops whitespace-only and padded too-short quotes (no evidence, no claim)', () => {
    const r = validateSuggestions({
      services: [{ id: 'ac_repair', quote: '   ' }, { id: 'ac_repair', quote: '\t\n  ' }, { id: 'ac_repair', quote: '  ac  ' }],
      keywords: [{ text: 'ac repair', quote: '     ' }],
    }, { ...ctx, city: null });
    expect(r).toEqual({ services: [], keywords: [] });
  });

  it('dedupes services by id and keywords by normalised text, trims, enforces 2..60 chars', () => {
    const r = validateSuggestions({
      services: [{ id: 'ac_repair', quote: 'ac repair' }, { id: 'ac_repair', quote: '24/7 ac repair' }],
      keywords: [{ text: ' AC Repair ', quote: 'ac repair' }, { text: 'ac repair', quote: 'ac repair' }, { text: 'x', quote: 'ac repair' }, { text: 'y'.repeat(61), quote: 'ac repair' }],
    }, { ...ctx, city: null });
    expect(r?.services).toHaveLength(1);
    expect(r?.keywords).toEqual([{ value: 'AC Repair', quote: 'ac repair' }]);
  });

  it('caps keywords at 5', () => {
    const words = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'];
    const r = validateSuggestions({ services: [], keywords: words.map((w) => ({ text: w, quote: 'ac repair' })) }, ctx);
    expect(r?.keywords).toHaveLength(5);
  });

  it('fills keywords from accepted services plus the city, only with a city', () => {
    const raw = { services: [{ id: 'ac_repair', quote: 'ac repair' }], keywords: [] };
    expect(validateSuggestions(raw, ctx)?.keywords).toEqual([{ value: 'ac repair austin', quote: 'ac repair' }]);
    expect(validateSuggestions(raw, { ...ctx, city: null })?.keywords).toEqual([]);
  });

  it('returns null for malformed input', () => {
    expect(validateSuggestions(null, ctx)).toBeNull();
    expect(validateSuggestions({ services: 'x' }, ctx)).toBeNull();
    expect(validateSuggestions({ services: [{ id: 1, quote: 'a' }], keywords: [] }, ctx)).toBeNull();
  });
});

describe('buildSuggestionSource', () => {
  const gbp = {
    title: 'Smith HVAC', category: 'HVAC contractor', additionalCategories: ['Plumber'], description: 'Family owned.',
    services: [{ name: 'AC tune-up' }, 'Duct cleaning'], attributes: { amenities: ['Online estimates'] },
  } as unknown as GbpProfile;

  it('builds text from the profile and at most 10 reviews', () => {
    const reviews = Array.from({ length: 12 }, (_, i) => `review number ${i}`);
    const s = buildSuggestionSource(gbp, reviews);
    expect(s.sources).toEqual(['gbp', 'reviews']);
    for (const t of ['Family owned.', 'HVAC contractor', 'Plumber', 'AC tune-up', 'Duct cleaning', 'Online estimates', 'review number 9']) expect(s.text).toContain(t);
    expect(s.text).not.toContain('review number 10');
  });

  it('lists only gbp when there are no reviews', () => {
    expect(buildSuggestionSource(gbp, []).sources).toEqual(['gbp']);
  });
});

describe('setupSuggestionsJsonSchema', () => {
  it('names the object shape', () => {
    expect(setupSuggestionsJsonSchema.name).toBe('setup_suggestions');
    expect(setupSuggestionsJsonSchema.schema).toMatchObject({ required: ['services', 'keywords'] });
  });
});
