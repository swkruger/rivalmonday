import { describe, expect, it } from 'vitest';
import { canCreate, formFromDraft, manualForm, toCreateInput } from './new-business-type-model';

const draft = {
  name: 'Craft distilleries', audienceNoun: 'guests',
  areas: [{ name: 'Tasting room', aliases: ['tastings'], quote: 'Tasting room open' }, { name: 'Tours', aliases: [], quote: 'Guided tours' }],
  seedKeywords: [{ value: 'distillery tour', quote: 'Guided tours' }],
  categories: ['Distillery'], relatedCategories: ['Liquor store'], themes: [{ name: 'Tour quality', quote: 'Guided tours' }],
};

describe('new business type mapping', () => {
  it('a draft maps to create_vertical input with the place id as draftPlaceId', () => {
    expect(toCreateInput(formFromDraft(draft), 'pl-1')).toEqual({
      name: 'Craft distilleries', audienceNoun: 'guests',
      areas: [{ name: 'Tasting room', aliases: ['tastings'] }, { name: 'Tours', aliases: [] }],
      seedKeywords: ['distillery tour'], categories: ['Distillery'], relatedCategories: ['Liquor store'], themes: [{ name: 'Tour quality' }], draftPlaceId: 'pl-1',
    });
  });

  it('passes the business being onboarded as businessName (trimmed), omitted when blank', () => {
    expect(toCreateInput(formFromDraft(draft), 'pl-1', '  Hill Country Distillery ').businessName).toBe('Hill Country Distillery');
    expect(toCreateInput(formFromDraft(draft), null, ' ')).not.toHaveProperty('businessName');
    expect(toCreateInput(formFromDraft(draft), null)).not.toHaveProperty('businessName');
  });

  it('unticked categories and removed areas are left out; blank optional fields are omitted', () => {
    const f = formFromDraft(draft);
    f.categories = [{ value: 'Distillery', checked: true }, { value: 'Bar', checked: false }];
    f.areas = f.areas.slice(1);
    f.audienceNoun = ' ';
    f.keywords = [];
    const out = toCreateInput(f, null);
    expect(out.categories).toEqual(['Distillery']);
    expect(out.areas).toHaveLength(1);
    expect(out).not.toHaveProperty('audienceNoun');
    expect(out).not.toHaveProperty('seedKeywords');
    expect(out).not.toHaveProperty('draftPlaceId');
  });

  it('the manual form prefills only the place category and needs a name and an area', () => {
    const f = manualForm('Distillery');
    expect(f.categories).toEqual([{ value: 'Distillery', checked: true }]);
    expect(canCreate(f)).toBe(false);
    f.name = 'Distilleries';
    f.areas = [{ name: 'Tours', aliases: [] }];
    expect(canCreate(f)).toBe(true);
    f.categories[0]!.checked = false;
    expect(canCreate(f)).toBe(false);
  });
});
