import { describe, expect, it } from 'vitest';
import { validateDraft } from './draft';

const source = { text: 'We offer “Barrel tastings” and café-style tours.\nCategories: Distillery, Whisky distillery\nFollow us 🥃 for Rye whiskey', categories: ['Distillery', 'Whisky distillery', 'Liquor store'] };
const base = {
  name: 'Craft distilleries', audienceNoun: 'guests',
  areas: [{ name: 'Tastings', aliases: [], quote: 'barrel tastings' }],
  seedKeywords: [], categories: ['distillery'], relatedCategories: [], topics: [],
};

describe('validateDraft', () => {
  it('drops an area whose quote is invented, keeps the others', () => {
    const d = validateDraft({ ...base, areas: [...base.areas, { name: 'Weddings', aliases: [], quote: 'wedding venue hire' }] }, source);
    expect(d?.areas.map((a) => a.name)).toEqual(['Tastings']);
  });

  it('matches curly quotes, accents, emoji and nbsp after normalising', () => {
    const d = validateDraft({
      ...base,
      areas: [{ name: 'Tastings', aliases: [], quote: '"Barrel tastings"' }, { name: 'Tours', aliases: [], quote: 'CAFÉ-style tours' }, { name: 'Rye', aliases: [], quote: 'rye whiskey' }],
      topics: [{ name: 'Social', quote: 'Follow us 🥃 for' }],
    }, source);
    expect(d?.areas).toHaveLength(3);
    expect(d?.topics).toHaveLength(1);
  });

  it('drops categories that are not in the source list', () => {
    const d = validateDraft({ ...base, categories: ['Distillery', 'Brewery'], relatedCategories: ['liquor store', 'Distillery', 'Winery'] }, source);
    expect(d?.categories).toEqual(['Distillery']);
    expect(d?.relatedCategories).toEqual(['Liquor store']);
  });

  it('returns null when every area is dropped, or no category survives, or the shape is wrong', () => {
    expect(validateDraft({ ...base, areas: [{ name: 'Weddings', aliases: [], quote: 'wedding venue hire' }] }, source)).toBeNull();
    expect(validateDraft({ ...base, categories: ['Brewery'] }, source)).toBeNull();
    expect(validateDraft({ nope: true }, source)).toBeNull();
  });
});
