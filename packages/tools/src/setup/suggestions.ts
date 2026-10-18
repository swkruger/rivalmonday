import type { GbpProfile } from '@cs/collectors';
import type { JsonSchemaFormat } from '@cs/ai';
import type { SetupSuggestion } from '@cs/db';
import { normaliseQuote } from '@cs/verticals';
import { z } from 'zod';
import { MAX_KEYWORDS } from '../client-input';

export type SuggestionSource = { text: string; sources: ('gbp' | 'reviews' | 'website')[] };

const MAX_REVIEWS = 10;
const MAX_ATTRIBUTE_STRINGS = 40;

/** Every string leaf of a vendor JSON value (service names, attribute labels), capped. Shapes vary, so this is deliberately shape-agnostic. */
function strings(v: unknown, out: string[] = [], depth = 0): string[] {
  if (out.length >= MAX_ATTRIBUTE_STRINGS || depth > 4) return out;
  if (typeof v === 'string') {
    if (v.trim()) out.push(v.trim());
  } else if (Array.isArray(v)) {
    for (const x of v) strings(x, out, depth + 1);
  } else if (v && typeof v === 'object') {
    for (const x of Object.values(v)) strings(x, out, depth + 1);
  }
  return out;
}

/** The text the model may quote from: GBP description, categories, services, attributes and up to 10 review snippets. */
export function buildSuggestionSource(gbp: GbpProfile, reviews: string[]): SuggestionSource {
  const lines: string[] = [];
  if (gbp.description) lines.push(gbp.description);
  const cats = [gbp.category, ...gbp.additionalCategories].filter((c): c is string => Boolean(c));
  if (cats.length) lines.push(`Categories: ${cats.join(', ')}`);
  const services = strings(gbp.services);
  if (services.length) lines.push(`Services: ${services.join(', ')}`);
  const attrs = strings(gbp.attributes);
  if (attrs.length) lines.push(`Attributes: ${attrs.join(', ')}`);
  const snippets = reviews.map((r) => r.trim()).filter(Boolean).slice(0, MAX_REVIEWS);
  for (const r of snippets) lines.push(`Review: ${r}`);
  return { text: lines.join('\n'), sources: snippets.length ? ['gbp', 'reviews'] : ['gbp'] };
}

export const setupSuggestionsJsonSchema: JsonSchemaFormat = {
  name: 'setup_suggestions',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['services', 'keywords'],
    properties: {
      services: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['id', 'quote'], properties: { id: { type: 'string' }, quote: { type: 'string' } } },
      },
      keywords: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['text', 'quote'], properties: { text: { type: 'string' }, quote: { type: 'string' } } },
      },
    },
  },
};

const rawSchema = z.object({
  services: z.array(z.object({ id: z.string(), quote: z.string() })),
  keywords: z.array(z.object({ text: z.string(), quote: z.string() })),
});

/**
 * Deterministic gate on the model's answer (spec §6.4): *no evidence, no claim*. Keeps only items whose quote appears in
 * the source text; null when the answer is not the expected shape.
 */
export function validateSuggestions(
  raw: unknown,
  ctx: { packServices: { id: string; name: string }[]; sourceText: string; city: string | null },
): { services: SetupSuggestion[]; keywords: SetupSuggestion[] } | null {
  const parsed = rawSchema.safeParse(raw);
  if (!parsed.success) return null;
  const haystack = normaliseQuote(ctx.sourceText);
  const quoted = (quote: string) => normaliseQuote(quote).length >= 3 && haystack.includes(normaliseQuote(quote));
  const names = new Map(ctx.packServices.map((s) => [s.id, s.name]));

  const services: SetupSuggestion[] = [];
  const seenServices = new Set<string>();
  for (const s of parsed.data.services) {
    if (!names.has(s.id) || seenServices.has(s.id) || !quoted(s.quote)) continue;
    seenServices.add(s.id);
    services.push({ value: s.id, quote: s.quote });
  }

  const keywords: SetupSuggestion[] = [];
  const seenKeywords = new Set<string>();
  const addKeyword = (text: string, quote: string) => {
    const value = text.trim();
    const key = normaliseQuote(value);
    if (value.length < 2 || value.length > 60 || seenKeywords.has(key)) return;
    seenKeywords.add(key);
    keywords.push({ value, quote });
  };
  for (const k of parsed.data.keywords) if (quoted(k.quote)) addKeyword(k.text, k.quote);
  if (keywords.length < MAX_KEYWORDS && ctx.city) {
    for (const s of services) {
      if (keywords.length >= MAX_KEYWORDS) break;
      addKeyword(`${names.get(s.value)!.toLowerCase()} ${ctx.city.toLowerCase()}`, s.quote);
    }
  }
  return { services, keywords: keywords.slice(0, MAX_KEYWORDS) };
}
