import { z } from 'zod';

/** NFKC, curly quotes straightened, whitespace collapsed, lowercase: the one quote normaliser (setup suggestions and vertical drafts). */
export const normaliseQuote = (s: string): string =>
  s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

export const verticalDraftSchema = z.strictObject({
  name: z.string().min(2).max(60),
  audienceNoun: z.string().min(2).max(40),
  areas: z.array(z.strictObject({ name: z.string().min(2).max(80), aliases: z.array(z.string().max(80)).max(8), quote: z.string().min(3).max(300) })).min(1).max(12),
  seedKeywords: z.array(z.strictObject({ value: z.string().min(2).max(60), quote: z.string().min(3).max(300) })).max(5),
  categories: z.array(z.string().min(2).max(80)).min(1).max(10),
  relatedCategories: z.array(z.string().min(2).max(80)).max(10),
  themes: z.array(z.strictObject({ name: z.string().min(2).max(60), quote: z.string().min(3).max(300) })).max(12),
});
export type VerticalDraft = z.infer<typeof verticalDraftSchema>;

/**
 * Deterministic gate on the model's draft (*no evidence, no claim*): drops areas, keywords and themes whose quote is not
 * in `source.text`; categories must be in the source category list; null when the shape is wrong, no area survives
 * or no category survives.
 */
export function validateDraft(raw: unknown, source: { text: string; categories: string[] }): VerticalDraft | null {
  const parsed = verticalDraftSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const haystack = normaliseQuote(source.text);
  const quoted = (q: string) => normaliseQuote(q).length >= 3 && haystack.includes(normaliseQuote(q));
  const allowed = new Map(source.categories.map((c) => [normaliseQuote(c), c.trim()]));
  const cats = (list: string[]) => [...new Set(list.map((c) => allowed.get(normaliseQuote(c))).filter((c): c is string => Boolean(c)))];

  const areas = d.areas.filter((a) => quoted(a.quote));
  if (areas.length === 0) return null;
  const categories = cats(d.categories);
  if (categories.length === 0) return null;
  return {
    name: d.name,
    audienceNoun: d.audienceNoun,
    areas,
    seedKeywords: d.seedKeywords.filter((k) => quoted(k.quote)),
    categories,
    relatedCategories: cats(d.relatedCategories).filter((c) => !categories.includes(c)),
    themes: d.themes.filter((t) => quoted(t.quote)),
  };
}
