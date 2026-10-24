/**
 * Deterministic "no evidence, no claim" rule (blocking B2, plan Task 10). Every date, number and tracked competitor name
 * in the text must appear in the evidence; any bait string is a violation outright. Dates are read (and stripped) first,
 * so a date's digits are never also read as numbers. A percent may match an evidence percent rounded to a whole number.
 */
export interface ClaimViolation { kind: 'number' | 'date' | 'name' | 'bait'; token: string }

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const DATE_RES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/\b\d{4}-(\d{2})-(\d{2})\b/g, (m) => `${m[1]}-${m[2]}`],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+\d{4})?/gi,
    (m) => `${String(MONTHS.indexOf(m[1]!.toLowerCase().slice(0, 3)) + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`],
  [/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g, (m) => `${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`],
];
function dates(text: string): { set: Set<string>; rest: string } {
  const set = new Set<string>(); let rest = text;
  for (const [re, key] of DATE_RES) rest = rest.replace(re, (...a) => { set.add(key(a.slice(0, -2) as unknown as RegExpExecArray)); return ' '; });
  return { set, rest };
}
function numbers(text: string): { value: number; pct: boolean; raw: string }[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?(\s?%)?/g)].map((m) => ({ value: Number(m[0].replace(/[,%\s]/g, '')), pct: !!m[1], raw: m[0].trim() }));
}
export function claimViolations(text: string, ev: { text: string; competitorNames: string[]; bait: string[] }): ClaimViolation[] {
  const out: ClaimViolation[] = [];
  const lower = text.toLowerCase(), evLower = ev.text.toLowerCase();
  for (const b of ev.bait) if (b && lower.includes(b.toLowerCase())) out.push({ kind: 'bait', token: b });
  const c = dates(text), e = dates(ev.text);
  for (const d of c.set) if (!e.set.has(d)) out.push({ kind: 'date', token: d });
  const evNums = numbers(e.rest);
  for (const n of numbers(c.rest)) {
    const ok = evNums.some((x) => x.value === n.value || (n.pct && x.pct && Math.round(x.value) === n.value));
    if (!ok) out.push({ kind: 'number', token: n.raw });
  }
  for (const name of ev.competitorNames) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text) && !evLower.includes(name.toLowerCase())) out.push({ kind: 'name', token: name });
  }
  return out;
}
