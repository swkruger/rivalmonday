const LEGAL = new Set(['llc', 'inc', 'co', 'corp', 'corporation', 'company', 'ltd', 'pllc', 'pc', 'dds', 'dmd', 'the', 'of', 'and']);
export const GENERIC_NAME_TOKENS = new Set(['plumbing', 'plumber', 'plumbers', 'heating', 'cooling', 'air', 'conditioning', 'hvac', 'ac', 'service', 'services',
  'repair', 'home', 'pros', 'experts', 'dental', 'dentist', 'dentists', 'dentistry', 'family', 'care', 'center', 'clinic', 'smile', 'smiles', 'best', 'top', 'near', 'in', 'me']);
const words = (s: string): string[] =>
  s.normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
export function normaliseName(s: string, city: string | null): string[] {
  const drop = new Set(words(city ?? ''));
  return words(s).filter((t) => !LEGAL.has(t) && !drop.has(t));
}
/** "ABC Plumbing - Dallas, TX - Yelp" -> "ABC Plumbing" (also |, en/em dash). */
export const titleHead = (title: string): string => title.split(/\s+[-|–—]\s+/)[0] ?? title;
const distinctive = (xs: string[]) => xs.some((t) => !GENERIC_NAME_TOKENS.has(t));
export function nameHit(title: string | null, name: string, city: string | null): boolean {
  if (!title) return false;
  const a = normaliseName(name, city), b = normaliseName(titleHead(title), city);
  if (a.length === 0 || b.length === 0) return false;
  if (!distinctive(a)) return a.length === b.length && a.every((t, i) => t === b[i]); // generic name: exact head only
  const A = new Set(a), B = new Set(b);
  return a.every((t) => B.has(t)) || (b.length >= 2 && distinctive(b) && b.every((t) => A.has(t)));
}
export const digitsOnly = (s: string): string => s.replace(/\D/g, '');
export function phone10(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw ?? '');
  const t = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return t.length === 10 ? t : null;
}
const US_PHONE = /(?<![\d-])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})(?![\d-])|(?<!\d)([2-9]\d{9})(?!\d)/g;
export function usPhones(text: string): string[] {
  return [...new Set([...text.matchAll(US_PHONE)].map((m) => (m[4] ?? `${m[1]}${m[2]}${m[3]}`)))];
}
export const formatPhone = (p: string): string => `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
/** P5: "…, Dallas, TX 75201(, USA)" -> "Dallas", else null. */
export function cityFromAddress(a: string | null): string | null {
  const parts = (a ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (/^(usa|united states)$/i.test(parts.at(-1) ?? '')) parts.pop();
  const i = parts.findLastIndex((p) => /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p));
  return i >= 1 ? parts[i - 1]! : null;
}
