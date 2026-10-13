export const CITATION_PREFIXES = ['ev', 'kb', 'app'] as const;

export interface Unit {
  /** Sentence text with disallowed markers removed, allowed markers kept. */
  raw: string;
  /** Sentence text with every marker removed. */
  text: string;
  refs: string[];
  /** Whitespace that followed the sentence in the source. */
  sep: string;
}

const ID = '[0-9a-f-]{36}';

function markerRe(prefixes: readonly string[]): RegExp {
  return new RegExp(String.raw`\[(${prefixes.join('|')}):(${ID})\]`, 'g');
}

/** Abbreviations whose period never ends a sentence (lower-case, without the final period). */
const ABBREVIATIONS = new Set(['vs', 'e.g', 'i.e', 'approx', 'incl', 'cf']);

/** A period that closes an abbreviation ("vs.") or a numbered-list marker at the start of a unit ("1."). */
function notSentenceEnd(part: string, unitStart: number, dot: number): boolean {
  const before = part.slice(unitStart, dot);
  if (/^\s*\d+$/.test(before)) return true;
  const word = /(?:^|[\s(])([A-Za-z][A-Za-z.]*)$/.exec(before)?.[1];
  return word !== undefined && ABBREVIATIONS.has(word.toLowerCase());
}

/** Splits on . ! ? followed by whitespace/end, and on newlines; keeps trailing markers with their sentence. */
export function splitUnits(input: string, prefixes: readonly string[], allowed: ReadonlySet<string>): Unit[] {
  const leadingMarkers = new RegExp(String.raw`^(?:[ \t]*\[(?:${prefixes.join('|')}):${ID}\])+`);
  const re = markerRe(prefixes);
  const out: Unit[] = [];
  const push = (chunk: string, sep: string) => {
    const refs: string[] = [];
    const raw = chunk
      .replace(re, (m, p: string, id: string) => {
        const ref = `${p}:${id}`;
        if (!allowed.has(ref)) return '';
        refs.push(ref);
        return m;
      })
      .replace(/ {2,}/g, ' ')
      .replace(/\s+([.!?])/g, '$1')
      .trim();
    const text = raw.replace(re, '').replace(/ {2,}/g, ' ').replace(/\s+([.!?])/g, '$1').trim();
    out.push({ raw, text, refs, sep });
  };
  for (const part of input.split(/(\n+)/)) {
    if (/^\n+$/.test(part)) {
      if (out.length) out[out.length - 1]!.sep += part;
      continue;
    }
    let pos = 0;
    let i = 0;
    while (i < part.length) {
      const ch = part[i]!;
      if ('.!?'.includes(ch) && (i + 1 === part.length || /\s/.test(part[i + 1]!)) && !(ch === '.' && notSentenceEnd(part, pos, i))) {
        let j = i + 1;
        const m = leadingMarkers.exec(part.slice(j));
        if (m) j += m[0].length;
        const ws = /^\s*/.exec(part.slice(j))![0];
        push(part.slice(pos, j), ws);
        pos = i = j + ws.length;
        continue;
      }
      i++;
    }
    if (pos < part.length) push(part.slice(pos), '');
  }
  return out.filter((u) => u.text.length > 0);
}

export function parseCitations(
  text: string,
  prefixes: readonly string[],
  allowed: ReadonlySet<string>,
): { sentences: { text: string; refs: string[] }[] } {
  return { sentences: splitUnits(text, prefixes, allowed).map((u) => ({ text: u.text, refs: u.refs })) };
}
