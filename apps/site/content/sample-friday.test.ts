// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SAMPLE, type SampleBriefData } from '../src/sample/schema';
import { FRIDAY_ANSWERS, type CannedAnswer } from './sample-friday';

/** ISO dates and timestamps are not figures: drop them whole, so "10" or "13" can't match "2026-10-13". */
const ISO_DATE = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/g;
/** Whole-number tokens ("13" is one token, so "3" never matches it). */
const numbers = (text: string) => text.replace(ISO_DATE, ' ').match(/\d+(?:[.,]\d+)*/g) ?? [];

/** Keys that are references or indexes, not figures ("r1" must not allow "1"; `changed` is a line index). */
const NOT_FIGURES = new Set(['id', 'rivalId', 'changed']);

/** Every string/number value of an evidence entry, deep, except reference/index keys. */
function evidenceTokens(sample: SampleBriefData, id: string): Set<string> {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string' || typeof v === 'number') out.push(...numbers(String(v)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NOT_FIGURES.has(k)) walk(x);
  };
  walk(sample.evidence[id]);
  return new Set(out);
}

/** Problems in one answer: a part with a figure but no cite, or a figure its cited evidence lacks (item text never counts). */
function uncitedFigures(answer: CannedAnswer, sample: SampleBriefData): string[] {
  const problems: string[] = [];
  for (const part of answer.answer) {
    const figures = numbers(part.text);
    if (figures.length === 0) continue;
    if (!part.cite || !sample.evidence[part.cite]) {
      problems.push(`${answer.id}: "${part.text}" has figures but no valid cite`);
      continue;
    }
    const allowed = evidenceTokens(sample, part.cite);
    for (const f of figures) if (!allowed.has(f)) problems.push(`${answer.id}: ${f} not in ${part.cite}`);
  }
  return problems;
}

describe('sample Friday answers', () => {
  it('3–4 answers with unique ids', () => {
    expect(FRIDAY_ANSWERS.length).toBeGreaterThanOrEqual(3);
    expect(FRIDAY_ANSWERS.length).toBeLessThanOrEqual(4);
    expect(new Set(FRIDAY_ANSWERS.map((a) => a.id)).size).toBe(FRIDAY_ANSWERS.length);
  });

  it('every cite exists in SAMPLE.evidence', () => {
    for (const a of FRIDAY_ANSWERS) {
      expect(a.answer.some((p) => p.cite)).toBe(true);
      for (const p of a.answer) if (p.cite) expect(SAMPLE.evidence[p.cite], `${a.id} ${p.cite}`).toBeDefined();
    }
  });

  it('friday answers cite every figure', () => {
    // Sanity: token equality, never substring — "3" against evidence holding only "13" fails; uncited figures fail.
    const fixture: SampleBriefData = {
      ...SAMPLE,
      items: [],
      evidence: { x: { id: 'x', kind: 'rank', keyword: 'k', weekOf: 'week', summary: 'You: 13 points' } },
    };
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: '3 new reviews', cite: 'x' }] }, fixture)).toHaveLength(1);
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: '13 points', cite: 'x' }] }, fixture)).toEqual([]);
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: '13 points' }] }, fixture)).toHaveLength(1);
    // A figure only the citing item states does not count.
    const withItem: SampleBriefData = { ...fixture, items: [{ ...SAMPLE.items[0]!, whatChanged: 'up from 8 of 49', evidenceIds: ['x'] }] };
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: 'up from 8', cite: 'x' }] }, withItem)).toHaveLength(1);
    // Dates are not figures: "10" and "13" don't match a weekOf of 2026-10-13 or a capturedAt timestamp.
    const dated: SampleBriefData = { ...SAMPLE, items: [], evidence: {
      d: { id: 'd', kind: 'rank', keyword: 'k', weekOf: '2026-10-13', summary: 'You: top 3 in 42 of 49 points' },
      s: { id: 's', kind: 'snapshot', rivalId: 'r1', url: 'u', capturedAt: '2026-10-09T11:19:24.669Z', title: 't', before: [], after: [], changed: 0 },
    } };
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: '13 of 10 points', cite: 'd' }] }, dated)).toHaveLength(2);
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: '11 at 19', cite: 's' }] }, dated)).toHaveLength(2);
    // References and indexes are not figures: rivalId "r1" and changed 0 allow neither "1" nor "0".
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: '1 or 0', cite: 's' }] }, dated)).toHaveLength(2);
    expect(uncitedFigures({ id: 'f', question: 'q', answer: [{ text: '42 of 49', cite: 'd' }] }, dated)).toEqual([]);

    expect(FRIDAY_ANSWERS.flatMap((a) => uncitedFigures(a, SAMPLE))).toEqual([]);
  });
});
