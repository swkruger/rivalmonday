import { describe, expect, it } from 'vitest';
import { matchTripadvisor, parseTripadvisorItem, parseUrlPath, type TripadvisorItem } from './parse';
import fixture from './__fixtures__/tripadvisor-search.json';

type Raw = Record<string, unknown>;
const items = (fixture as unknown as { tasks: { result: { items: Raw[] }[] }[] }).tasks[0]!.result[0]!.items;
const dripping = items[0]!; // d11750497, Dripping Springs, 4.4 / 113
const austin = items[1]!; // d19987654, Austin, same name
const otherName = items[2]!; // Dripping Springs Distilling, d14567890
const ranch = items[3]!; // Treaty Oak Ranch, Lakeway, d8123456
const biz = { name: 'Treaty Oak Distilling', city: 'Dripping Springs' };

function parsed(raw: Raw): TripadvisorItem {
  const item = parseTripadvisorItem(raw);
  if (!item) throw new Error('fixture item did not parse');
  return item;
}
const withFields = (over: Raw, base: Raw = dripping): Raw => ({ ...base, ...over });

describe('parseUrlPath', () => {
  it('reads the id and Dripping Springs city from the probe path', () => {
    expect(parseUrlPath(dripping.url_path as string)).toEqual({ id: 'd11750497', city: 'Dripping Springs' });
  });

  it('reads the city from an Austin_Texas path', () => {
    expect(parseUrlPath('/Attraction_Review-g30196-d19987654-Reviews-Treaty_Oak_Distilling-Austin_Texas.html')).toEqual({
      id: 'd19987654',
      city: 'Austin',
    });
  });

  it('keeps multi-word cities such as New York City', () => {
    expect(parseUrlPath('/Attraction_Review-g60763-d1234567-Reviews-Some_Place-New_York_City_New_York.html')).toEqual({
      id: 'd1234567',
      city: 'New York City',
    });
  });

  it('returns null for non-review paths and empty input', () => {
    expect(parseUrlPath('/Restaurants-g55765-Dripping_Springs_Texas.html')).toBeNull();
    expect(parseUrlPath(null)).toBeNull();
    expect(parseUrlPath(undefined)).toBeNull();
  });
});

describe('parseTripadvisorItem', () => {
  it('maps a fixture item to the typed shape', () => {
    expect(parseTripadvisorItem(dripping)).toEqual({
      id: 'd11750497',
      url: `https://www.tripadvisor.com${dripping.url_path as string}`,
      title: 'Treaty Oak Distilling',
      rating: 4.4,
      reviews: 113,
      city: 'Dripping Springs',
    });
  });

  it('builds the url from the trimmed url_path', () => {
    expect(parsed(withFields({ url_path: `  ${dripping.url_path as string}
` })).url).toBe(`https://www.tripadvisor.com${dripping.url_path as string}`);
  });

  it('keeps a rating only when 0 < value <= 5', () => {
    expect(parsed(withFields({ rating: { value: 5 } })).rating).toBe(5);
    expect(parsed(withFields({ rating: { value: 0 } })).rating).toBeNull();
    expect(parsed(withFields({ rating: { value: 6 } })).rating).toBeNull();
    expect(parsed(withFields({ rating: { value: '4.4' } })).rating).toBeNull();
  });

  it('keeps reviews only as a non-negative integer', () => {
    expect(parsed(withFields({ reviews_count: 0 })).reviews).toBe(0);
    expect(parsed(withFields({ reviews_count: -1 })).reviews).toBeNull();
    expect(parsed(withFields({ reviews_count: 2.5 })).reviews).toBeNull();
    expect(parsed(withFields({ reviews_count: '113' })).reviews).toBeNull();
  });

  it('gives null rating and reviews when they are missing, not an error', () => {
    const { rating: _r, reviews_count: _c, ...bare } = dripping;
    expect(parsed(bare)).toMatchObject({ id: 'd11750497', rating: null, reviews: null });
  });

  it('skips sponsored items', () => {
    expect(parseTripadvisorItem(withFields({ is_sponsored: true }))).toBeNull();
  });

  it('drops items without a parseable url_path', () => {
    expect(parseTripadvisorItem(withFields({ url_path: '/Restaurants-g1-Dripping_Springs_Texas.html' }))).toBeNull();
    expect(parseTripadvisorItem(withFields({ url_path: undefined }))).toBeNull();
  });

  it('drops items without a title', () => {
    expect(parseTripadvisorItem(withFields({ title: '' }))).toBeNull();
    expect(parseTripadvisorItem(withFields({ title: undefined }))).toBeNull();
  });

  it('returns null for values that are not objects', () => {
    expect(parseTripadvisorItem(null)).toBeNull();
    expect(parseTripadvisorItem('Treaty Oak')).toBeNull();
    expect(parseTripadvisorItem(42)).toBeNull();
  });
});

describe('matchTripadvisor', () => {
  const all = items.map((raw) => parseTripadvisorItem(raw)).filter((i): i is TripadvisorItem => i !== null);

  it('returns the single name+city match', () => {
    expect(matchTripadvisor(all, biz)?.id).toBe('d11750497');
  });

  it('matches the city case-insensitively', () => {
    expect(matchTripadvisor(all, { name: biz.name, city: 'dripping springs' })?.id).toBe('d11750497');
  });

  it('RF4: two name+city matches return null', () => {
    const duplicate = parsed(withFields({ url_path: '/Attraction_Review-g55765-d99999999-Reviews-Treaty_Oak_Distilling-Dripping_Springs_Texas.html' }));
    expect(matchTripadvisor([parsed(dripping), duplicate], biz)).toBeNull();
  });

  it('RF4: a name match in another city returns null', () => {
    expect(matchTripadvisor([parsed(austin)], biz)).toBeNull();
    expect(matchTripadvisor(all, { name: biz.name, city: 'Houston' })).toBeNull();
  });

  it('returns the item when the city is unknown and only one name matches', () => {
    expect(matchTripadvisor([parsed(dripping), parsed(otherName)], { name: biz.name, city: null })?.id).toBe('d11750497');
  });

  it('returns null when the city is unknown and two names match', () => {
    expect(matchTripadvisor(all, { name: biz.name, city: null })).toBeNull();
  });

  it('returns null when no item carries the business name', () => {
    expect(matchTripadvisor(all, { name: "Emo's", city: 'Austin' })).toBeNull();
    expect(parsed(ranch).title).toBe('Treaty Oak Ranch');
  });
});
