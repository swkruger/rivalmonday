import type { Ai } from '@cs/ai';
import type { CallScope } from '@cs/core';
import { type ClaimMode, supportCheck, VERIFIER_TASK } from '@cs/engine';
import { CITATION_PREFIXES, splitUnits } from './citations';
import { ASK_COPY } from './quota';

/**
 * Owner decision 2026-10-13: interpretation lines (uncited, or a cited line that opens with "Possible reason:", rule 2)
 * are checked by their own task, which accepts a clear yes (min_confidence 0.2, p >= 0.6). Cited facts stay on the
 * strict `verifier_decisions` (0.85), shared with briefs. Most dropped Ask sentences were "true" just under 0.85.
 */
export const ASK_INTERPRETATION_TASK = 'ask_interpretation_decisions';
const POSSIBLE_REASON = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)?\s*possible reason\b/i;

/**
 * Verifies a draft answer ("no evidence, no claim"): cited sentences are checked as facts against their
 * cited evidence (`ev:`), article (`kb:`) or app row (`app:`), uncited ones as interpretations against all monitored
 * data; unsupported sentences are removed, and an answer with nothing left becomes the no-evidence line.
 * Calls are grouped by evidence string and mode (supportCheck takes one evidence and one task) and run concurrently.
 */
export async function groundAnswer(
  ai: Ai,
  scope: CallScope,
  draft: string,
  evidence: ReadonlyMap<string, string>,
  now: Date = new Date(),
): Promise<{ content: string; citations: string[]; removed: number }> {
  const allowed = new Set(evidence.keys());
  const units = splitUnits(draft, CITATION_PREFIXES, allowed);

  // Spec k9: knowledge never substitutes for competitor evidence, so uncited sentences are checked against monitored
  // data only: ev: evidence and app: rows (the app's own figures), never kb: articles.
  const allText = [...evidence]
    .filter(([id]) => !id.startsWith('kb:'))
    .map(([id, t]) => `${id}\n${t}`)
    .join('\n\n');
  const groups = new Map<string, { evidence: string; mode: ClaimMode; claims: { key: string; sentence: string; mode: ClaimMode }[] }>();
  units.forEach((u, i) => {
    const mode: ClaimMode = u.refs.length && !POSSIBLE_REASON.test(u.text) ? 'fact' : 'interpretation';
    const gk = `${mode}:${[...new Set(u.refs)].sort().join('|')}`;
    const g = groups.get(gk) ?? {
      evidence: u.refs.length ? [...new Set(u.refs)].map((r) => evidence.get(r) ?? '').join('\n\n') : allText,
      mode,
      claims: [],
    };
    g.claims.push({ key: `s${i}`, sentence: u.text, mode });
    groups.set(gk, g);
  });

  const supported = new Set<string>();
  // Relative periods ("this month", "last 30 days") can only be checked against the row dates with today's date.
  const today = `Today is ${now.toISOString().slice(0, 10)} (UTC).\n\n`;
  const results = await Promise.all([...groups.values()].filter((g) => g.claims.length).map((g) => supportCheck(ai, scope, today + g.evidence, g.claims, g.mode === 'fact' ? VERIFIER_TASK : ASK_INTERPRETATION_TASK)));
  for (const s of results) for (const k of s) supported.add(k);

  const newlines = (sep: string) => (sep.match(/\n/g) ?? []).length;
  const pieces: { text: string; sep: string }[] = [];
  const citations: string[] = [];
  let removed = 0;
  let kept = 0;
  units.forEach((u, i) => {
    if (supported.has(`s${i}`)) {
      kept++;
      for (const r of u.refs) if (!citations.includes(r)) citations.push(r);
      pieces.push({ text: u.raw, sep: u.sep });
      return;
    }
    // Owner decision (2026-10-13): unsupported sentences are dropped silently while others survive; the no-evidence
    // line is only the whole answer (below). The larger separator is kept so paragraphs and list items stay apart.
    removed++;
    const last = pieces[pieces.length - 1];
    if (last && newlines(u.sep) > newlines(last.sep)) last.sep = u.sep;
  });
  if (kept === 0) return { content: ASK_COPY.noEvidence, citations: [], removed };
  const content = pieces.map((p, i) => p.text + (i < pieces.length - 1 ? p.sep || ' ' : '')).join('');
  return { content, citations, removed };
}
