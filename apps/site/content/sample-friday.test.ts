// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SAMPLE, type SampleBriefData } from '../src/sample/schema';
import { FRIDAY_ANSWERS, type CannedAnswer } from './sample-friday';

/** Whole-number tokens ("13" is one token, so "3" never matches it). */
const numbers = (text: string) => text.match(/\d+(?:[.,]\d+)*/g) ?? [];

/** Every string/number value of an evidence entry except its id (ids such as "e14" are not figures). */
function evidenceTokens(sample: SampleBriefData, id: string): Set<string> {
  const { id: _id, ...rest } = sample.evidence[id]!;
  return new Set(numbers(JSON.stringify(rest)));
}

function itemTokens(sample: SampleBriefData, evidenceId: string): Set<string> {
  const items = sample.items.filter((i) => i.evidenceIds.includes(evidenceId));
  return new Set(items.flatMap((i) => numbers([i.headline, i.whatChanged, i.whyItMatters, i.recommendedAction].join(' '))));
}

/** Problems in one answer: a part with a figure but no cite, or a figure its cited evidence (or citing item) lacks. */
function uncitedFigures(answer: CannedAnswer, sample: SampleBriefData): string[] {
  const problems: string[] = [];
  for (const part of answer.answer) {
    const figures = numbers(part.text);
    if (figures.length === 0) continue;
    if (!part.cite || !sample.evidence[part.cite]) {
      problems.push(`${answer.id}: "${part.text}" has figures but no valid cite`);
      continue;
    }
    const allowed = new Set([...evidenceTokens(sample, part.cite), ...itemTokens(sample, part.cite)]);
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

    expect(FRIDAY_ANSWERS.flatMap((a) => uncitedFigures(a, SAMPLE))).toEqual([]);
  });
});
