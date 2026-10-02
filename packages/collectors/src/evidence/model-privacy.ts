import nlp from 'compromise';
import { redactContactInfo } from './privacy';

/**
 * Serious health conditions (spec §4.5: "PII and health details stripped before any model call").
 * Dental procedures and HVAC services are deliberately absent — "root canal", "sedation", "pain",
 * "AC repair" are what themes, tags and service mapping analyse.
 */
const HEALTH = new RegExp(
  String.raw`\b(?:diabet(?:es|ic)|cancer|chemo(?:therapy)?|pregnan(?:t|cy)|miscarriage|hepatitis|heart attack|stroke|seizures?|epilep(?:sy|tic)|dementia|alzheimer'?s|autis(?:m|tic)|adhd|depression|bipolar|ptsd|schizophreni(?:a|c)|parkinson'?s|multiple sclerosis|chronic (?:illness|pain)|disabilit(?:y|ies)|disabled)\b`,
  'gi',
);
/** Case-sensitive: "aids" is also a common noun ("hearing aids"). */
const HEALTH_ACRONYMS = /\b(?:HIV|AIDS)\b/g;

/** Titles are never a name on their own ("Dr." alone is not redacted). */
const TITLE_WORDS = new Set(['dr', 'mr', 'mrs', 'ms', 'mx', 'miss', 'prof', 'doctor', 'the']);

const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Person names found by compromise's named-entity tagger, longest first. Leading/trailing
 * punctuation that compromise attaches to a term ("Mike!", "Emma.") is trimmed, and a name whose
 * words all belong to the business's own name ("Smith" in "Smith HVAC") is dropped.
 */
export function personNames(text: string, businessNames: readonly (string | null | undefined)[] = []): string[] {
  if (!/\p{Lu}/u.test(text)) return [];
  const business = new Set(businessNames.flatMap((b) => (b ? words(b) : [])));
  const found = (nlp(text).people().out('array') as string[])
    .map((n) => n.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((n) => n.length >= 2 && words(n).some((w) => !business.has(w) && !TITLE_WORDS.has(w)));
  return [...new Set(found)].sort((a, b) => b.length - a.length);
}

export function redactPersonNames(text: string, businessNames: readonly (string | null | undefined)[] = []): string {
  let out = text;
  for (const name of personNames(text, businessNames)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'gu'), '[name]');
  }
  return out;
}

export function redactHealthDetails(text: string): string {
  return text.replace(HEALTH, '[health]').replace(HEALTH_ACRONYMS, '[health]');
}

/**
 * Everything a model may see of scraped or review text (spec §4.5): contact details, person names and
 * serious health conditions removed. Stored evidence and review rows stay as stored — this is applied
 * at the model boundary only. Pass the business's own name(s) so they are never mistaken for people.
 */
export function redactForModel(text: string, opts: { businessNames?: readonly (string | null | undefined)[] } = {}): string {
  return redactPersonNames(redactHealthDetails(redactContactInfo(text)), opts.businessNames ?? []);
}
