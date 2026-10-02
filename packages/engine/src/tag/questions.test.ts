import { loadVerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import { choice, noul } from '../../test/fake-ai';
import { extractNumericFacts, diffFacts } from '../facts/numeric';
import { buildSummary, extractZips } from './tag-stage';
import { buildTagQuestions, buildTagState, resolveTag } from './questions';

const priceCut = diffFacts(extractNumericFacts('AC Tune-Up $89'), extractNumericFacts('AC Tune-Up $69'));
const result = (answers: Record<string, ReturnType<typeof noul>>, needsReview: string[] = []) => ({ answers, needsReview });

describe('tag questions', () => {
  it('asks meaningful, change type, and one service question per vertical', async () => {
    const q = buildTagQuestions([await loadVerticalPack('hvac_plumbing'), await loadVerticalPack('dental')]);
    expect(Object.keys(q)).toEqual(['meaningful', 'change_type', 'service_hvac_plumbing', 'service_dental']);
    const svc = q.service_hvac_plumbing;
    expect(svc?.type === 'choice' && Object.keys(svc.options)).toContain('ac_tune_up');
    expect(svc?.type === 'choice' && svc.options.none).toBeDefined();
  });

  it('redacts contact details and truncates text in the state', () => {
    const s = buildTagState({ competitorName: 'Smith HVAC', pageUrl: 'https://smithhvac.example/', pageType: 'home', kind: 'modified', beforeText: 'Call 972-555-0100', afterText: 'x'.repeat(5000), numericChanges: priceCut });
    expect(JSON.stringify(s)).not.toContain('555-0100');
    expect(String(s.after)).toHaveLength(1500);
    expect(s.numeric_changes).toEqual(['price: $89 → $69 (-22.5%)']);
  });
});

describe('resolveTag', () => {
  it('maps a meaningful price change and its service', async () => {
    const packs = [await loadVerticalPack('hvac_plumbing')];
    const r = resolveTag(priceCut, result({ meaningful: noul(true), change_type: choice('price_change'), service_hvac_plumbing: choice('ac_tune_up') }), packs);
    expect(r).toMatchObject({ meaningful: true, type: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, needsReview: [] });
  });

  it('forces a money change the model called cosmetic into a price_change', async () => {
    const r = resolveTag(priceCut, result({ meaningful: noul(false), change_type: choice('cosmetic') }, ['meaningful']), []);
    expect(r).toMatchObject({ meaningful: true, type: 'price_change', needsReview: [] });
  });

  it('turns a percent-only change typed as content into a promo', () => {
    const pct = diffFacts([], extractNumericFacts('Now 20% off'));
    expect(resolveTag(pct, result({ meaningful: noul(true), change_type: choice('content') }), []).type).toBe('promo');
  });

  it('marks non-meaningful, non-numeric changes cosmetic, and meaningful cosmetic as content', () => {
    expect(resolveTag([], result({ meaningful: noul(false), change_type: choice('content') }), []).type).toBe('cosmetic');
    expect(resolveTag([], result({ meaningful: noul(true), change_type: choice('cosmetic') }), []).type).toBe('content');
  });

  it('drops a service id outside the catalog and reports the lowest confidence', async () => {
    const packs = [await loadVerticalPack('hvac_plumbing')];
    const r = resolveTag([], result({ meaningful: noul(true, 0.9), change_type: choice('new_service', 0.7), service_hvac_plumbing: choice('teleportation', 0.8) }, ['change_type']), packs);
    expect(r).toMatchObject({ services: { hvac_plumbing: null }, confidence: 0.7, needsReview: ['change_type'] });
  });

  it('lets a date-only change be called cosmetic (only money forces meaningful)', () => {
    const dateOnly = diffFacts(extractNumericFacts('Posted Sep 3'), extractNumericFacts('Posted Sep 10'));
    const r = resolveTag(dateOnly, result({ meaningful: noul(false), change_type: choice('cosmetic') }), []);
    expect(r).toMatchObject({ meaningful: false, type: 'cosmetic' });
  });

  it('keeps a date-only change tagged as promo when the model calls it meaningful', () => {
    const dateOnly = diffFacts(extractNumericFacts('Posted Sep 3'), extractNumericFacts('Posted Sep 10'));
    const r = resolveTag(dateOnly, result({ meaningful: noul(true), change_type: choice('promo') }), []);
    expect(r).toMatchObject({ meaningful: true, type: 'promo' });
  });
});

describe('summary and zips', () => {
  it('summarises a price change with the page path', () => {
    expect(buildSummary({ kind: 'modified', beforeText: 'AC Tune-Up $89', afterText: 'AC Tune-Up $69', numericChanges: priceCut }, 'https://smithhvac.example/pricing'))
      .toBe('/pricing: price changed from $89 to $69 (-22.5%) — "AC Tune-Up $69"');
  });

  it('summarises added and removed text', () => {
    expect(buildSummary({ kind: 'added', beforeText: null, afterText: 'Now serving Frisco', numericChanges: [] }, null)).toBe('added "Now serving Frisco"');
    expect(buildSummary({ kind: 'removed', beforeText: 'Duct cleaning', afterText: null, numericChanges: [] }, 'https://x.example/')).toBe('/: removed "Duct cleaning"');
  });

  it('finds ZIP codes but not prices or phone fragments', () => {
    expect(extractZips('Now serving 75034 and 75035! Call 972-555-0100. Systems from $12000.')).toEqual(['75034', '75035']);
  });
});
