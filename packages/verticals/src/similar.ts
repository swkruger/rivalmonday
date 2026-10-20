/** Words that carry no business-type meaning ("Craft Distillery" ≈ "Distillery"). */
export const GENERIC_WORDS: readonly string[] = ['craft', 'service', 'services', 'shop', 'store', 'company', 'co', 'and', 'the', 'local'];

const singular = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/** NFKC, lowercase, punctuation stripped, generic words dropped, each word singularised. */
export function normaliseName(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !GENERIC_WORDS.includes(w))
    .map(singular)
    .join(' ');
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** Catalogue entries that look like `name`: same normalised name, token Jaccard >= 0.5 or edit distance <= 25 %; best first. */
export function similarVerticals(
  name: string,
  catalogue: { id: string; name: string; categories: string[] }[],
  max = 3,
): { id: string; name: string }[] {
  const n = normaliseName(name);
  if (!n) return [];
  const tokens = new Set(n.split(' '));
  const scored: { id: string; name: string; score: number }[] = [];
  for (const v of catalogue) {
    const m = normaliseName(v.name);
    if (!m) continue;
    let score = 0;
    if (m === n) score = 1;
    else {
      const mt = new Set(m.split(' '));
      const inter = [...tokens].filter((t) => mt.has(t)).length;
      const jaccard = inter / (tokens.size + mt.size - inter);
      const lev = 1 - levenshtein(n, m) / Math.max(n.length, m.length);
      if (jaccard >= 0.5) score = Math.max(score, jaccard);
      if (lev >= 0.75) score = Math.max(score, lev);
    }
    if (score > 0) scored.push({ id: v.id, name: v.name, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map(({ id, name: nm }) => ({ id, name: nm }));
}
