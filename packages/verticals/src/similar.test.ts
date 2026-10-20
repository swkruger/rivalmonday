import { describe, expect, it } from 'vitest';
import { normaliseName, similarVerticals } from './similar';

const cat = (...names: string[]) => names.map((name, i) => ({ id: `v${i}`, name, categories: [] }));
const matches = (a: string, b: string) => similarVerticals(a, cat(b)).length === 1;

describe('normaliseName', () => {
  it('lowercases, strips punctuation and generic words, singularises', () => {
    expect(normaliseName('Craft Distillery')).toBe('distillery');
    expect(normaliseName('Distilleries')).toBe('distillery');
    expect(normaliseName('  HVAC & Plumbing Services! ')).toBe('hvac plumbing');
    expect(normaliseName('The Local Shop')).toBe('');
  });
});

describe('similarVerticals', () => {
  it.each([
    ['Craft Distillery', 'Distillery', true],
    ['Distilleries', 'Distillery', true],
    ['Dental practices', 'Dental practice', true],
    ['Brewery', 'Winery', false],
    ['Dental clinic', 'Veterinary clinic', false],
  ])('%s vs %s -> %s', (a, b, expected) => {
    expect(matches(a, b)).toBe(expected);
  });

  it('returns best first, capped at max, and nothing for a name of only generic words', () => {
    const list = cat('Dental clinic group', 'Dental clinics', 'Dental clinic', 'Dental clinical');
    const out = similarVerticals('Dental clinic', list);
    expect(out).toHaveLength(3);
    expect(out[0]!.name).toBe('Dental clinics');
    expect(similarVerticals('Dental clinic', list, 1)).toHaveLength(1);
    expect(similarVerticals('The Local Shop', list)).toEqual([]);
  });
});
