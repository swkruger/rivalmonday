const SUFFIXES = new Set(['llc', 'inc', 'pc', 'dds', 'dmd', 'pllc', 'co', 'corp']);

const squash = (s: string) => s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Lowercase; drop " - city, st" tails, punctuation, legal/credential suffixes and "of <city>"; collapse spaces. */
export function normaliseName(name: string, city?: string | null): string {
  let s = squash((name.toLowerCase().replace(/&/g, ' and ').split(/\s[-–—]\s/)[0]) ?? '');
  const c = city ? squash(city.toLowerCase()) : '';
  if (c) s = s.replace(new RegExp(`\\s+of\\s+${c}$`), '').replace(new RegExp(`\\s+${c}$`), '');
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
