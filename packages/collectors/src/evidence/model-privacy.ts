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
 * punctuation that compromise attaches to a term ("Mike!", "Emma.") is trimmed. A bare title
 * ("Dr." alone) is dropped; words that overlap a business's own name are NOT filtered here —
 * `redactPersonNames` protects whole business-name phrase occurrences instead (a real person who
 * shares a word with the business, e.g. "Mike" in "Mike's AC Repair", must still be redacted
 * everywhere the business's own name isn't actually written).
 */
export function personNames(text: string, businessNames: readonly (string | null | undefined)[] = []): string[] {
  const found = (nlp(text).people().out('array') as string[])
    .map((n) => n.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((n) => n.length >= 2 && words(n).some((w) => !TITLE_WORDS.has(w)));
  return [...new Set(found)].sort((a, b) => b.length - a.length);
}

interface Span {
  start: number;
  end: number;
}

/** Whole-word (unicode letter/number boundary) occurrences of `phrase` in `text`, case as given by `flags`. */
const findSpans = (text: string, phrase: string, flags: string): Span[] => {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(phrase)}(?![\\p{L}\\p{N}])`, flags);
  const spans: Span[] = [];
  for (const m of text.matchAll(re)) spans.push({ start: m.index, end: m.index + m[0].length });
  return spans;
};

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/**
 * Replaces every detected person name with "[name]", except an occurrence that falls inside a
 * span where one of `businessNames` is itself written out (whole phrase, case-insensitive) — so
 * "Smith" in "Smith HVAC" stays, but a technician named "Smith" mentioned elsewhere does not, and
 * "Mike" in "Mike's AC Repair" stays while "Mike" the person is still redacted everywhere else.
 * Longest names are claimed first so a shorter name is never independently redacted inside a
 * longer one already handled ("Smith" inside an already-redacted "Mr. Smith").
 */
export function redactPersonNames(text: string, businessNames: readonly (string | null | undefined)[] = []): string {
  const names = personNames(text, businessNames);
  if (names.length === 0) return text;
  const claimed: Span[] = [];
  for (const b of businessNames) {
    if (!b) continue;
    claimed.push(...findSpans(text, b, 'giu'));
  }
  const redact: Span[] = [];
  for (const name of names) {
    for (const span of findSpans(text, name, 'giu')) {
      if (claimed.some((c) => overlaps(c, span))) continue;
      redact.push(span);
      claimed.push(span);
    }
  }
  if (redact.length === 0) return text;
  redact.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const span of redact) {
    out += text.slice(pos, span.start) + '[name]';
    pos = span.end;
  }
  return out + text.slice(pos);
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
