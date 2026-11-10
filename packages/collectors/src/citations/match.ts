import type { SerpOrganicItem } from '@cs/db';
import { isBannedHost, onHost } from '@cs/verticals';
const LEGAL = new Set(['llc', 'inc', 'co', 'corp', 'corporation', 'company', 'ltd', 'pllc', 'pc', 'dds', 'dmd', 'the', 'of', 'and']);
export const GENERIC_NAME_TOKENS = new Set(['plumbing', 'plumber', 'plumbers', 'heating', 'cooling', 'air', 'conditioning', 'hvac', 'ac', 'service', 'services',
  'repair', 'home', 'pros', 'experts', 'dental', 'dentist', 'dentists', 'dentistry', 'family', 'care', 'center', 'clinic', 'smile', 'smiles', 'best', 'top', 'near', 'in', 'me',
  'emergency', '24', 'hour', 'hr', 'quality', 'affordable', 'reliable', 'residential', 'commercial', 'mechanical', 'water', 'heater', 'heaters', 'drain', 'drains',
  'sewer', 'electric', 'electrical', 'general', 'cosmetic', 'pediatric', 'local', 'pro', 'expert', 'professional', 'company', 'co', 'group', 'team', 'solutions', 'association']);
/** US state names (split into words, so "new york" gives "new" and "york") and postal abbreviations, plus DC. */
export const US_STATE_TOKENS = new Set(['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
  'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new', 'hampshire', 'jersey', 'mexico', 'york', 'north', 'south', 'carolina', 'dakota',
  'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode', 'island', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west', 'wisconsin', 'wyoming',
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt',
  'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc']);
const isGeneric = (t: string): boolean => GENERIC_NAME_TOKENS.has(t) || US_STATE_TOKENS.has(t);
const words = (s: string): string[] =>
  s.normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
/** Tokens with legal suffixes removed but the city kept (used for the generic-name exact-head rule). */
const coreTokens = (s: string): string[] => words(s).filter((t) => !LEGAL.has(t));
export function normaliseName(s: string, city: string | null): string[] {
  const drop = new Set(words(city ?? ''));
  return words(s).filter((t) => !LEGAL.has(t) && !drop.has(t));
}
/** "ABC Plumbing - Dallas, TX - Yelp" -> "ABC Plumbing" (also |, en/em dash). */
export const titleHead = (title: string): string => title.split(/\s+[-|–—]\s+/)[0] ?? title;
const distinctive = (xs: string[]) => xs.some((t) => !isGeneric(t));
export function nameHit(title: string | null, name: string, city: string | null): boolean {
  if (!title) return false;
  const a = normaliseName(name, city), b = normaliseName(titleHead(title), city);
  if (a.length === 0 || b.length === 0) return false;
  if (!distinctive(a)) {
    // generic name: the title head must equal the name before city stripping, so "Dallas Plumbing - Yelp" hits but "Plumbing - Dallas, TX - Yelp" does not
    const ca = coreTokens(name), cb = coreTokens(titleHead(title));
    return ca.length === cb.length && ca.every((t, i) => t === cb[i]);
  }
  const A = new Set(a), B = new Set(b);
  return a.every((t) => B.has(t)) || (b.length >= 2 && distinctive(b) && b.every((t) => A.has(t)));
}
export const digitsOnly = (s: string): string => s.replace(/\D/g, '');
export function phone10(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw ?? '');
  const t = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return t.length === 10 && /^[2-9]/.test(t) ? t : null;
}
const US_PHONE = /(?<![\d-])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})(?![\d-])|(?<![\d-])([2-9]\d{9})(?![\d-])/g;
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

/** Category / roundup titles: "Best ...", "Top 10 ...", "... near me", "<trade> in <city>" (a "Plumbers in Dallas" page is not this business). */
export function isCategoryTitle(title: string | null): boolean {
  const t = titleHead(title ?? '').trim().toLowerCase();
  if (!t) return false;
  if (/^(best|top)/.test(t) || /near me$/.test(t)) return true;
  const m = /^(.+?)\s+in\s+[a-z .'-]+(,\s*[a-z]{2})?$/.exec(t);
  return !!m && words(m[1]!).every((w) => isGeneric(w));
}

export interface CitationBiz { name: string; phone: string | null; city: string | null; domain: string | null }
export interface ListingMatch { url: string; title: string | null; nameMatch: boolean | null; phoneMatch: boolean | null; shownPhone: string | null }
export const NOT_DIRECTORY_HOSTS = ['youtube.com', 'wikipedia.org'] as const; // plus any google.<tld>, the business's own domain
export const ALSO_FOUND_MAX = 10;
const hostOf = (it: SerpOrganicItem): string | null => (it.domain ?? '').toLowerCase().replace(/^www\./, '') || null;
const bare = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]!;
const cityHit = (text: string, city: string | null) => !city || text.toLowerCase().includes(city.toLowerCase());
/** C6: rank order; best = name and phone, else the first listed item. */
export function matchListing(items: SerpOrganicItem[], host: string, biz: CitationBiz): ListingMatch | null {
  const p = phone10(biz.phone);
  let best: ListingMatch | null = null;
  for (const it of items) {
    const h = hostOf(it);
    if (!h || !onHost(h, host) || isBannedHost(h)) continue;
    const text = `${it.title ?? ''} ${it.description ?? ''}`, phones = usPhones(text);
    const nh = nameHit(it.title, biz.name, biz.city), ph = p !== null && phones.includes(p);
    if (!ph && !(nh && cityHit(text, biz.city))) continue; // P15
    const other = p !== null && nh && !ph ? (phones.find((x) => x !== p) ?? null) : null;
    const nameFalse = ph && !nh && phones.length === 1 && !isCategoryTitle(it.title); // P16
    const m: ListingMatch = { url: it.listingUrl ?? `https://${h}`, title: it.title, nameMatch: nh ? true : nameFalse ? false : null,
      phoneMatch: ph ? true : other ? false : null, shownPhone: other };
    if (nh && ph) return m;
    best ??= m;
  }
  return best;
}
/** C12: hits outside the catalogue, name AND phone, never own/banned/not-a-directory hosts; <= 10, one per host. */
export function alsoFoundOn(items: SerpOrganicItem[], catalogueHosts: string[], biz: CitationBiz): { host: string; url: string; title: string | null }[] {
  const p = phone10(biz.phone);
  if (!p) return [];
  const own = biz.domain ? bare(biz.domain) : null, out = new Map<string, { host: string; url: string; title: string | null }>();
  for (const it of items) {
    const h = hostOf(it);
    if (!h || out.has(h) || out.size >= ALSO_FOUND_MAX) continue;
    if (catalogueHosts.some((c) => onHost(h, c)) || isBannedHost(h) || NOT_DIRECTORY_HOSTS.some((n) => onHost(h, n))
      || /(^|\.)google\.[a-z.]+$/.test(h) || (own && onHost(h, own))) continue;
    if (nameHit(it.title, biz.name, biz.city) && usPhones(`${it.title ?? ''} ${it.description ?? ''}`).includes(p)) out.set(h, { host: h, url: it.listingUrl ?? `https://${h}`, title: it.title });
  }
  return [...out.values()];
}
