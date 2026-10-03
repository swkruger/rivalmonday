/** Spec §9.1.4 deterministic checks: a sentence may only state numbers, dates, places and competitors its evidence shows. */
export interface RuleEvidence {
  text: string;
  captureDates: Date[];
  zips: string[];
  competitorNames: string[];
}

export interface RuleContext {
  trackedCompetitorNames: string[];
  clientTowns: string[];
  year: number;
}

type NumberToken = { kind: 'money' | 'percent' | 'plain'; value: number };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_DAY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g;
const NUMBER = /(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|percent\b)?/gi;
const ABBREVIATIONS = /\b(?:St|Ave|Rd|Dr|Blvd|Mr|Mrs|Ms|Dr|Inc|Co|Ltd|vs|approx|No)\.$/;
const pad = (n: number) => String(n).padStart(2, '0');
const validMd = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“$])/);
  for (const p of parts) {
    cur = cur ? `${cur} ${p}` : p;
    if (!ABBREVIATIONS.test(cur.trim())) {
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s.length > 0);
}

export function dateTokens(text: string): string[] {
  const out: { at: number; md: string }[] = [];
  for (const m of text.matchAll(MONTH_DAY)) {
    const mo = MONTHS[m[1]!.toLowerCase().slice(0, 3)]!;
    const d = Number(m[2]);
    if (validMd(mo, d)) out.push({ at: m.index!, md: `${pad(mo)}-${pad(d)}` });
  }
  for (const m of text.matchAll(ISO_DATE)) if (validMd(Number(m[2]), Number(m[3]))) out.push({ at: m.index!, md: `${m[2]}-${m[3]}` });
  for (const m of text.replace(/24\/7/g, '    ').matchAll(SLASH_DATE)) if (validMd(Number(m[1]), Number(m[2]))) out.push({ at: m.index!, md: `${pad(Number(m[1]))}-${pad(Number(m[2]))}` });
  return out.sort((a, b) => a.at - b.at).map((x) => x.md);
}

const stripDates = (text: string) =>
  text.replace(/24\/7/g, ' ').replace(MONTH_DAY, ' ').replace(ISO_DATE, ' ').replace(SLASH_DATE, ' ');

export function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of stripDates(text).matchAll(NUMBER)) {
    const value = Number(`${m[2]!.replace(/,/g, '')}${m[3] ? `.${m[3]}` : ''}`);
    out.push({ kind: m[1] ? 'money' : m[4] ? 'percent' : 'plain', value });
  }
  return out;
}

function numberSupported(t: NumberToken, evidence: NumberToken[], year: number): boolean {
  if (t.kind === 'plain' && t.value === year) return true;
  if (t.kind === 'percent') return evidence.some((e) => e.kind === 'percent' && Math.abs(Math.abs(e.value) - t.value) <= 1);
  if (t.kind === 'money') return evidence.some((e) => (e.kind === 'money' || e.kind === 'plain') && Math.abs(e.value - t.value) < 0.005);
  return evidence.some((e) => Math.abs(e.value - t.value) < 0.005);
}

const label = (t: NumberToken) => (t.kind === 'money' ? `$${t.value}` : t.kind === 'percent' ? `${t.value}%` : String(t.value));
const hasWord = (text: string, word: string) => new RegExp(`(^|[^A-Za-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(text);

export function checkSentence(sentence: string, ev: RuleEvidence, ctx: RuleContext): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const evNumbers = numberTokens(ev.text);
  // ZIPs are judged by the ZIP rule below; a ZIP the evidence lists must not also fail as an unknown number.
  const withoutKnownZips = sentence.replace(/\b\d{5}\b/g, (z) => (ev.zips.includes(z) ? ' ' : z));
  for (const t of numberTokens(withoutKnownZips)) if (!numberSupported(t, evNumbers, ctx.year)) reasons.push(`number ${label(t)} is not in the evidence`);

  const allowed = new Set(dateTokens(ev.text));
  for (const d of ev.captureDates) for (const off of [-1, 0, 1]) allowed.add(new Date(d.getTime() + off * 86_400_000).toISOString().slice(5, 10));
  for (const md of dateTokens(sentence)) if (!allowed.has(md)) reasons.push(`date ${md} is not in the evidence`);

  for (const zip of sentence.match(/\b\d{5}\b/g) ?? []) if (!ev.zips.includes(zip) && !ev.text.includes(zip)) reasons.push(`ZIP ${zip} is not in the evidence`);
  for (const town of ctx.clientTowns) if (hasWord(sentence, town) && !hasWord(ev.text, town)) reasons.push(`place ${town} is not in the evidence`);
  if (/\btarget(s|ed|ing)?\b/i.test(sentence) && !/\btarget/i.test(ev.text)) reasons.push('targeting claim without targeting evidence');

  for (const name of ctx.trackedCompetitorNames) {
    if (name.length >= 4 && hasWord(sentence, name) && !ev.competitorNames.includes(name)) reasons.push(`names ${name}, which this item does not cite`);
  }
  return { ok: reasons.length === 0, reasons };
}
