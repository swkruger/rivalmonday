export interface RenameSources { client: string; businesses: string[]; places: string[]; domains: string[] }
export interface Renamer { apply(text: string): string; terms: ReadonlyMap<string, string> }

/** Owner signs. Odd compounds so no reader mistakes them for a real business or town. Names are DERIVED
 *  (stem × tail, 24 × 5 = 120 per kind), so the pool cannot run out on a bigger demo world. */
export const FICTIONAL = {
  client: 'Northwind Heating & Air',
  state: 'Westmarch', stateCode: 'WM',
  stems: ['Copperleaf', 'Bluejay', 'Kestrel', 'Summitpine', 'Owlbrook', 'Fernhollow', 'Larkspur', 'Tidewell', 'Quillstone', 'Marigold', 'Brightkettle', 'Juniperwell',
    'Hollowbrook', 'Saffronfield', 'Cobaltcreek', 'Wrenhaven', 'Amberglen', 'Ploverline', 'Mossgate', 'Thistledown', 'Heronmoor', 'Lindenvale', 'Sorrelby', 'Teaselwick'],
  businessTails: ['Comfort Co', 'Air Works', 'Mechanical', 'Climate Pros', 'Home Services'],
  placeStems: ['Lark', 'Quill', 'Briar', 'Wren', 'Amber', 'Tide', 'Fenn', 'Owls', 'Marlowe', 'Cobble', 'Juniper', 'Saffron',
    'Plover', 'Moss', 'Kettle', 'Thistle', 'Harrow', 'Fallow', 'Brindle', 'Gorse', 'Heron', 'Linden', 'Sorrel', 'Teasel'],
  placeTails: ['haven', 'more', 'field', 'mere', 'bury'],
} as const;
/** Explicit state rule: Texas words are never pool places. ", TX"/", Texas" after a place is dropped in `apply`; bare words map here. */
export const STATE_TERMS: Readonly<Record<string, string>> = { 'North Texas': `North ${FICTIONAL.state}`, Texas: FICTIONAL.state, TX: FICTIONAL.stateCode };

/** Towns, counties and streets the demo seed emits (tenancy, rankings, leads, setup, ads, changes). The exporter
 *  passes them as `places` and the guard denies them, so a place the exporter forgets still fails the export. */
export const DEMO_PLACES = ['Granbury', 'Acton', 'Tolar', 'Lipan', 'Stephenville', 'Weatherford', 'Glen Rose', 'Cresson', 'Pecan Plantation',
  'Hood County', 'Hood Co', 'Hill Country', 'Brazos Valley', 'Brazos', 'Paluxy', 'Pearl St', 'Houston St', 'Lake Country', 'Tarrant Valley',
  'Cleburne', 'Comanche Peak', 'Stockton Bend', 'Harbor Lakes', 'Mesquite'] as const;
/** ZIPs the seed uses. The renamer blanks every 5-digit number; the guard denies these as terms rather than flagging all 5-digit numbers (that would hit legitimate figures). */
export const DEMO_ZIPS = ['76048', '76049', '76050', '76031', '76033', '76476', '76462'] as const;
/** Real-looking business words in the seed beyond the competitor names the exporter reads from the DB (guard deny list). */
export const DEMO_REAL_BUSINESS_WORDS = ['Lone Star', 'Bluebonnet', 'Cowboy Comfort', 'Texan Temp', 'Rapid Air Solutions', 'Pinnacle Plumbing', 'Frontier Home Services',
  'Prairie Wind', 'Cedar Creek', 'Oakridge', 'Lakeside Family Dental', 'Granbury Smiles', 'Rival Monday',
  'Mustang Creek', 'Twin Oaks', 'Lakeview', 'Lakeshore', 'Lakeside', 'Bluestem', 'North Star', 'Two Rivers', 'Oak Hollow', 'Dropoff', 'Pool Plumbing',
  'Redbud', 'Summit Air', 'Comfort Pros', 'Cedar Street', 'Prairie Growth', 'Mesquite Creek', 'Mesquite Marketing'] as const;

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s: string) => s.trim().split(/\s+/).map(esc).join('\\s+'); // multi-word terms match across newlines, double spaces and NBSP
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
const PHONE = /(?<![\da-z])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}(?![\da-z])/i;
const matchCase =(found: string, repl: string) => (found === found.toLowerCase() ? repl.toLowerCase() : repl);
const derive = (stems: readonly string[], tails: readonly string[], sep: string, i: number, kind: string) => {
  if (i >= stems.length * tails.length) throw new Error(`rename: more than ${stems.length * tails.length} ${kind}`);
  return `${stems[i % stems.length]}${sep}${tails[Math.floor(i / stems.length)]}`;
};

export function buildRenamer(src: RenameSources): Renamer {
  const terms = new Map<string, string>();
  const assign = (from: readonly string[], name: (i: number) => string) => {
    const uniq = [...new Set(from.map((s) => s.trim()).filter(Boolean))].filter((s) => !terms.has(s)).sort();
    uniq.forEach((s, i) => terms.set(s, name(i)));
  };
  terms.set(src.client, FICTIONAL.client);
  for (const [k, v] of Object.entries(STATE_TERMS)) terms.set(k, v);
  assign(src.businesses, (i) => derive(FICTIONAL.stems, FICTIONAL.businessTails, ' ', i, 'businesses'));
  assign(src.places, (i) => derive(FICTIONAL.placeStems, FICTIONAL.placeTails, '', i, 'places'));
  // Domains follow their business: "<slug(name)>.example" -> "<slug(fictional)>.example"; unknown domains get a numbered one.
  for (const d of new Set(src.domains)) {
    const owner = [...terms.keys()].find((k) => `${slug(k)}.example` === d || d.startsWith(`${slug(k)}.`));
    terms.set(d, owner ? `${slug(terms.get(owner)!)}.example` : `rival-${terms.size}.example`);
  }
  const fictional = new Set([...terms.values()].map((v) => v.toLowerCase()));
  for (const k of terms.keys()) if (fictional.has(k.toLowerCase())) throw new Error('rename: a fictional name collides with a source term');
  // ONE alternation, longest first, so "Lake Granbury Heating & Air" wins over "Granbury" and replacements are never re-scanned.
  const keys = [...terms.keys()].sort((a, b) => b.length - a.length);
  const lower = new Map(keys.map((k) => [norm(k), terms.get(k)!]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(words).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return {
    terms,
    apply: (text) => text.replace(/,\s?(?:TX|Texas)\b/g, '') // "Granbury, TX 76048" -> "Granbury 76048" before renaming
      .replace(re, (m) => matchCase(m.replace(/\s+/g, ' '), lower.get(norm(m))!))
      .replace(new RegExp(PHONE.source, 'gi'), '(555) 010-0100')
      .replace(/(?<![$\d,.])\b\d{5}(?:-\d{4})?\b/g, '00000'), // ZIPs, not prices
  };
}

export interface GuardHit { path: string; reason: string }
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const STREET = /\b\d{1,5}\s+(?:[NSEW]\.?\s+)?(?:[a-z0-9]+\s+){1,3}(?:St|Street|Rd|Road|Ave|Avenue|Hwy|Highway|Blvd|Dr|Drive|Ln|Lane|Way|Pkwy|Loop|Ct|Cir|Trl|Pl)\b/i;
const ROUTE = /\b(?:FM|US|SH|[Hh]wy)[- ]?\d{1,4}\b/;
const STATE = /,\s?(?:TX|Texas)\b|\bTexas\b|\bTX\b|\bTexans?\b/;

/** Walks every string value; any hit fails the export. `deny` = every source term plus extra known-real words. */
export function guard(value: unknown, deny: readonly string[], allowDomains: ReadonlySet<string>, path = '$'): GuardHit[] {
  if (typeof value === 'string') {
    const hits: GuardHit[] = [];
    for (const d of deny) if (new RegExp(`(?<![\\p{L}\\p{N}])${words(d)}(?![\\p{L}\\p{N}])`, 'iu').test(value)) hits.push({ path, reason: `term:${d}` });
    if (UUID.test(value)) hits.push({ path, reason: 'uuid' });
    if (EMAIL.test(value)) hits.push({ path, reason: 'email' });
    if (PHONE.test(value.replaceAll('(555) 010-0100', ''))) hits.push({ path, reason: 'phone' }); // a real phone beside the placeholder still fails
    if (STREET.test(value)) hits.push({ path, reason: 'street' });
    if (ROUTE.test(value)) hits.push({ path, reason: 'street' });
    if (STATE.test(value)) hits.push({ path, reason: 'state' });
    for (const m of value.matchAll(/\b([a-z0-9-]+\.(?:example|com|net|org|test))\b/gi)) if (!allowDomains.has(m[1]!.toLowerCase())) hits.push({ path, reason: `domain:${m[1]}` });
    return hits;
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => guard(v, deny, allowDomains, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [...guard(k, deny, allowDomains, `${path}.<key:${k}>`), ...guard(v, deny, allowDomains, `${path}.${k}`)]);
  return [];
}
