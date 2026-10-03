const STATE_ABBR = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'district of columbia', 'florida', 'georgia', 'hawaii',
  'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma',
  'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming',
];
/** Upper-case state abbreviation right before the number ("TX 75201", "TX, 75201"). Case-sensitive on purpose. */
const ABBR_BEFORE = new RegExp(`(?:^|[^A-Za-z])(?:${STATE_ABBR})\\.?,?\\s*$`);
/** State name or "zip/postal code(s)" right before the number. */
const WORD_BEFORE = new RegExp(`\\b(?:${STATE_NAMES.join('|')}|zip(?:\\s*codes?)?|postal\\s*codes?)\\s*[:,]?\\s*$`, 'i');
/** A unit or count noun after the number means it is a quantity, not a ZIP. */
const UNIT_AFTER = /^\s*(?:btus?\b|sq\.?\s*f(?:ee)?t\b|square\b|ft\b|feet\b|miles?\b|mi\b|lbs?\b|pounds?\b|gallons?\b|gal\b|seer2?\b|watts?\b|kwh?\b|hp\b|psi\b|cfm\b|tons?\b|%|hours?\b|hrs?\b|customers?\b|reviews?\b|homes?\b|happy\b)/i;
/** Five digits, optional +4; not part of a longer number, a price, a phone/date, or a decimal. */
const CANDIDATE = /(?<![\d$\-#])(?<!\d[.,])(\d{5})(?:-\d{4})?(?![\d]|[.,]\d|-\d)/g;
const LIST_SEP = /^\s*(?:[,;/&]|\band\b|\bor\b)\s*(?:\band\b|\bor\b)?\s*$/i;

/** US ZIP codes stated as such (Phase 3d decision 17): a state or "ZIP" before it, or a list of two or more. */
export function extractZips(text: string): string[] {
  const found: { zip: string; start: number; end: number; context: boolean }[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index!;
    const end = start + m[0].length;
    const before = text.slice(Math.max(0, start - 40), start);
    const context = ABBR_BEFORE.test(before) || WORD_BEFORE.test(before);
    if (!context && UNIT_AFTER.test(text.slice(end, end + 20))) continue;
    found.push({ zip: m[1]!, start, end, context });
  }
  const accepted = found.map((f, i) => {
    if (f.context) return true;
    const prev = found[i - 1];
    const next = found[i + 1];
    return (prev !== undefined && LIST_SEP.test(text.slice(prev.end, f.start))) || (next !== undefined && LIST_SEP.test(text.slice(f.end, next.start)));
  });
  return [...new Set(found.filter((_, i) => accepted[i]).map((f) => f.zip))];
}
