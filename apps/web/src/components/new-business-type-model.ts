import type { VerticalDraft } from '@cs/verticals';

/** The editable state of the "new business type" panel (a draft or the manual fallback), and its mapping to `create_vertical`. */
export interface NewTypeForm {
  name: string;
  audienceNoun: string;
  areas: { name: string; aliases: string[]; quote?: string }[];
  keywords: { value: string; quote?: string }[];
  categories: { value: string; checked: boolean }[];
  relatedCategories: string[];
  themes: string[];
}

export interface CreateVerticalInput {
  name: string;
  areas: { name: string; aliases?: string[] }[];
  audienceNoun?: string;
  seedKeywords?: string[];
  categories: string[];
  relatedCategories?: string[];
  themes?: { name: string }[];
  draftPlaceId?: string;
  /** The business being onboarded: not a client yet, so the tool checks names against it (D3). */
  businessName?: string;
}

export const MAX_KEYWORDS = 5;

export function formFromDraft(d: VerticalDraft): NewTypeForm {
  return {
    name: d.name,
    audienceNoun: d.audienceNoun,
    areas: d.areas.map((a) => ({ name: a.name, aliases: a.aliases, quote: a.quote })),
    keywords: d.seedKeywords.map((k) => ({ value: k.value, quote: k.quote })),
    categories: d.categories.map((value) => ({ value, checked: true })),
    relatedCategories: d.relatedCategories,
    themes: d.themes.map((t) => t.name),
  };
}

/** Draft unavailable: name and areas blank, the place's own Google category as the only category. */
export function manualForm(category: string | null): NewTypeForm {
  return { name: '', audienceNoun: '', areas: [], keywords: [], categories: category ? [{ value: category, checked: true }] : [], relatedCategories: [], themes: [] };
}

export function canCreate(f: NewTypeForm): boolean {
  return f.name.trim().length >= 2 && f.areas.length > 0 && f.categories.some((c) => c.checked);
}

/** `draftPlaceId` is sent only for an AI draft, so the tool can re-key the cached draft's evidence. */
export function toCreateInput(f: NewTypeForm, placeId: string | null, businessName?: string | null): CreateVerticalInput {
  const noun = f.audienceNoun.trim();
  const keywords = f.keywords.map((k) => k.value.trim()).filter((v) => v.length >= 2).slice(0, MAX_KEYWORDS);
  return {
    name: f.name.trim(),
    areas: f.areas.map((a) => ({ name: a.name.trim(), aliases: a.aliases.map((x) => x.trim()).filter(Boolean).slice(0, 8) })),
    ...(noun ? { audienceNoun: noun } : {}),
    ...(keywords.length ? { seedKeywords: keywords } : {}),
    categories: f.categories.filter((c) => c.checked).map((c) => c.value),
    ...(f.relatedCategories.length ? { relatedCategories: f.relatedCategories } : {}),
    ...(f.themes.length ? { themes: f.themes.map((name) => ({ name })) } : {}),
    ...(placeId ? { draftPlaceId: placeId } : {}),
    ...(businessName?.trim() ? { businessName: businessName.trim().slice(0, 200) } : {}),
  };
}
