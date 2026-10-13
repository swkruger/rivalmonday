import type { Ai } from '@cs/ai';
import type { CallScope } from '@cs/core';
import { type ClaimMode, supportCheck } from '@cs/engine';
import { CITATION_PREFIXES, splitUnits } from './citations';
import { ASK_COPY } from './quota';

/**
 * Verifies a draft answer ("no evidence, no claim"): cited sentences are checked as facts against their
 * cited evidence, uncited ones as interpretations against all evidence; unsupported sentences are removed.
 * Calls are grouped by evidence string (supportCheck takes one) and run concurrently.
 */
export async function groundAnswer(
  ai: Ai,
  scope: CallScope,
  draft: string,
  evidence: ReadonlyMap<string, string>,
): Promise<{ content: string; citations: string[]; removed: number }> {
  const allowed = new Set(evidence.keys());
  const units = splitUnits(draft, CITATION_PREFIXES, allowed);

  // Spec k9: knowledge never substitutes for competitor evidence, so uncited sentences are checked against ev: text only.
  const allText = [...evidence]
    .filter(([id]) => id.startsWith('ev:'))
    .map(([id, t]) => `${id}\n${t}`)
    .join('\n\n');
  const groups = new Map<string, { evidence: string; mode: ClaimMode; claims: { key: string; sentence: string; mode: ClaimMode }[] }>();
  units.forEach((u, i) => {
    const mode: ClaimMode = u.refs.length ? 'fact' : 'interpretation';
    const gk = u.refs.length ? [...new Set(u.refs)].sort().join('|') : '';
    const g = groups.get(gk) ?? {
      evidence: u.refs.length ? [...new Set(u.refs)].map((r) => evidence.get(r) ?? '').join('\n\n') : allText,
      mode,
      claims: [],
    };
    g.claims.push({ key: `s${i}`, sentence: u.text, mode });
    groups.set(gk, g);
  });

  const supported = new Set<string>();
  const results = await Promise.all([...groups.values()].filter((g) => g.claims.length).map((g) => supportCheck(ai, scope, g.evidence, g.claims)));
  for (const s of results) for (const k of s) supported.add(k);

  const pieces: { text: string; sep: string; removed: boolean }[] = [];
  const citations: string[] = [];
  let removed = 0;
  let kept = 0;
  units.forEach((u, i) => {
    if (supported.has(`s${i}`)) {
      kept++;
      for (const r of u.refs) if (!citations.includes(r)) citations.push(r);
      pieces.push({ text: u.raw, sep: u.sep, removed: false });
      return;
    }
    removed++;
    const last = pieces[pieces.length - 1];
    if (last?.removed) last.sep = u.sep;
    else pieces.push({ text: ASK_COPY.noEvidence, sep: u.sep, removed: true });
  });
  if (kept === 0) return { content: ASK_COPY.noEvidence, citations: [], removed };
  const content = pieces.map((p, i) => p.text + (i < pieces.length - 1 ? p.sep || ' ' : '')).join('');
  return { content, citations, removed };
}
