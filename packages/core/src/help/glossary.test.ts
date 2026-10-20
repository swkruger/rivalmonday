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
