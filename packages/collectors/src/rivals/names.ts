const SUFFIXES = new Set(['llc', 'inc', 'pc', 'dds', 'dmd', 'pllc', 'co', 'corp']);

const squash = (s: string) => s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Lowercase; drop " - city, st" tails, punctuation, legal/credential suffixes and "of <city>"; collapse spaces. */
export function normaliseName(name: string, city?: string | null): string {
  let s = squash((name.toLowerCase().replace(/&/g, ' and ').split(/\s[-–—]\s/)[0]) ?? '');
  const c = city ? squash(city.toLowerCase()) : '';
  // Brand mode (no city): drop a trailing "of <place>" so franchises share one brand. City mode also drops a trailing state.
  if (c) s = s.replace(new RegExp(`(\\s+of)?\\s+${c}(\\s+[a-z]{2})?$`), '');
  else s = s.replace(/\s+of\s+.+$/, '');
  const words = s.split(' ').filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join(' ');
}

export function normaliseDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
  return s || null;
}

/** Digits only, last 10 (drops a leading country code); null when too short to compare. */
export function digitsOnly(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : null;
}

/** Lowercase and punctuation-squashed only (keeps "of <city>" and state), for containment checks. */
export const plainName = (name: string): string => squash(name.toLowerCase().replace(/&/g, ' and '));

/** True when the name ends in "of <city>" (optionally a state): a franchisee naming its location, e.g. "Aire Serv of Granbury". */
export function hasOfCity(name: string, city: string | null | undefined): boolean {
  const c = city ? squash(city.toLowerCase()) : '';
  if (!c) return false;
  const head = plainName(name.split(/\s[-–—]\s/)[0] ?? '');
  return new RegExp(`\\sof\\s${c}(\\s[a-z]{2})?$`).test(head);
}

/** The name with every "<city>" / "of <city>" (and a state right after it) removed anywhere, then normalised. */
export function normaliseWithoutCity(name: string, city: string | null | undefined): string {
  const c = city ? squash(city.toLowerCase()) : '';
  if (!c) return normaliseName(name);
  const stripped = ` ${plainName(name)} `.replace(new RegExp(`(\\sof)?\\s${c}(\\s[a-z]{2}(?=\\s$))?(?=\\s)`, 'g'), ' ');
  return normaliseName(stripped, c);
}
