import { describe, expect, it } from 'vitest';
import { filterGlossary, GLOSSARY, glossaryFor, type GlossaryTerm } from './glossary';

const t = (id: string, term: string, audience: GlossaryTerm['audience']): GlossaryTerm => ({ id, term, audience, short: `${term}.` });
const fixture = [t('z', 'Zeta', 'all'), t('o', 'Op term', 'operator'), t('a', 'Alpha', 'agency'), t('c', 'Charlie', 'client'), t('b', 'bravo', 'all')];

describe('filterGlossary', () => {
  it('client sees all + client, sorted by term', () => {
    expect(filterGlossary(fixture, 'client').map((x) => x.id)).toEqual(['b', 'c', 'z']);
  });
  it('agency sees all + agency, never client-only or operator', () => {
    expect(filterGlossary(fixture, 'agency').map((x) => x.id)).toEqual(['a', 'b', 'z']);
  });
  it('operator sees all + agency + operator', () => {
    expect(filterGlossary(fixture, 'operator').map((x) => x.id)).toEqual(['a', 'b', 'o', 'z']);
  });
  it('does not mutate the input list', () => {
    const before = fixture.map((x) => x.id);
    filterGlossary(fixture, 'operator');
    expect(fixture.map((x) => x.id)).toEqual(before);
  });
});

describe('glossaryFor', () => {
  it('applies the filter to GLOSSARY', () => {
    expect(glossaryFor('client')).toEqual(filterGlossary(GLOSSARY, 'client'));
  });
});

/** 15b-1 pilot content: the real glossary's invariants (the owner signs off the wording; these keep it safe to render). */
describe('GLOSSARY content', () => {
  const REQUIRED = [
    'competitor', 'tier', 'change', 'move', 'signal', 'brief', 'report', 'alert', 'pressure', 'score', 'routing', 'confidence', 'seat',
    'business-type', 'paused', 'monitoring-paused', 'share-of-voice', 'local-pack', 'average-map-rank', 'review-velocity', 'reply-rate',
    'topic', 'starting-point', 'recommendation', 'evidence', 'upsell-tag',
  ];
  const text = (x: GlossaryTerm) => [x.term, x.short, x.long ?? ''].join('\n');
  const clientVisible = GLOSSARY.filter((x) => x.audience === 'all' || x.audience === 'client');

  it('has every pilot term, once, with kebab-case ids', () => {
    const ids = GLOSSARY.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED) expect(ids, id).toContain(id);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('agency-internal terms are agency-only', () => {
    for (const id of ['routing', 'seat', 'paused', 'upsell-tag']) expect(GLOSSARY.find((x) => x.id === id)!.audience, id).toBe('agency');
    expect(GLOSSARY.find((x) => x.id === 'monitoring-paused')!.audience).toBe('client');
  });

  it('uses no placeholders: the web ({x}) and KB ({{x}}) renderers would each leave the other kind literal', () => {
    for (const x of GLOSSARY) expect(text(x), x.id).not.toMatch(/[{}]/);
  });

  it('never names the product or the default assistant, and uses miles, not km', () => {
    for (const x of GLOSSARY) {
      expect(text(x), x.id).not.toMatch(/rival\s*monday|\bfriday\b/i);
      expect(text(x), x.id).not.toMatch(/\bkm\b|kilomet/i);
    }
  });

  it('client-visible terms never mention agency-internal concepts', () => {
    for (const x of clientVisible) expect(text(x), x.id).not.toMatch(/\bseats?\b|\brout(e|ed|ing)\b|upsell|AM check|place id|prospect/i);
  });

  it('seeAlso points at existing terms the same readers can see', () => {
    const byId = new Map(GLOSSARY.map((x) => [x.id, x]));
    for (const x of GLOSSARY) {
      for (const id of x.seeAlso ?? []) {
        const target = byId.get(id);
        expect(target, `${x.id} -> ${id}`).toBeDefined();
        if (x.audience !== 'agency' && x.audience !== 'operator') expect(['all', x.audience], `${x.id} -> ${id}`).toContain(target!.audience);
      }
    }
  });

  it('every term has a short definition of one to three sentences', () => {
    for (const x of GLOSSARY) {
      expect(x.short.length, x.id).toBeGreaterThan(20);
      expect(x.short.length, x.id).toBeLessThanOrEqual(320);
    }
  });
});
