import type { Ai, DecisionResult, ResolvedAnswer } from '@cs/ai';
import { describe, expect, it } from 'vitest';
import { RUNNERS } from '../../run';
import { buildSynthetic } from '../../build/synthetic';
import type { ChangeInput } from '../../build/common';
import type { EvalCase } from '../../case';
import { labeledAnswers } from '../decisions';
import { changesRunner } from './run';

const choice = (value: string, p: number, provider = 'x'): ResolvedAnswer =>
  ({ type: 'choice', value, probabilities: { [value]: p }, confidence: p, provider }) as unknown as ResolvedAnswer;
const noul = (value: boolean, p: number, provider = 'x'): ResolvedAnswer => ({ type: 'noul', value, probability: value ? p : 1 - p, confidence: p, provider }) as ResolvedAnswer;

describe('changes suite', () => {
  it('maps a decision trace to labelled answers per role', () => {
    const result = {
      answers: { meaningful: noul(true, 0.8, 'llm'), change_type: choice('promo', 0.7, 'llm') },
      needsReview: [],
      trace: {
        primary: { provider: 'jev', answers: { meaningful: noul(false, 0.9), change_type: choice('cosmetic', 0.4) } },
        fallback: { provider: 'llm', answers: { change_type: choice('promo', 0.7) } },
      },
    } as unknown as DecisionResult<string>;
    const out = labeledAnswers('tag_decisions', 'c1', { meaningful: 'true', change_type: 'promo' }, result);
    const pick = (role: string, key: string) => out.find((a) => a.role === role && a.key === key);
    expect(pick('primary', 'meaningful')).toMatchObject({ correct: false, probability: 0.9, family: 'meaningful', task: 'tag_decisions' });
    expect(pick('primary', 'change_type')).toMatchObject({ correct: false, probability: 0.4 });
    expect(pick('fallback', 'change_type')).toMatchObject({ correct: true, probability: 0.7 });
    expect(pick('fallback', 'meaningful')).toBeUndefined();
    expect(pick('final', 'meaningful')).toMatchObject({ correct: true, probability: 0.8 });
    expect(out).toHaveLength(5);
  });

  it('unconfirmed cases are excluded and counted', async () => {
    const [a, b] = buildSynthetic('changes', 2, 3) as EvalCase[];
    const keys = (a!.input as ChangeInput).questionKeys;
    const label = (v: string) => Object.fromEntries(keys.map((k) => [k, k === 'meaningful' ? 'true' : v]));
    const confirmed: EvalCase = { ...a!, label: label('none'), labelBy: 'owner', confirmedAt: '2026-10-24T00:00:00.000Z' };
    const pending: EvalCase = { ...b!, label: label('none'), labelBy: 'llm:m', confirmedAt: null };
    const ai = {
      decide: async (_t: string, _s: unknown, qs: Record<string, { type: string }>) => ({
        answers: Object.fromEntries(Object.entries(qs).map(([k]) => [k, k === 'meaningful' ? noul(true, 0.95) : choice('none', 0.9)])),
        needsReview: [],
      }),
    } as unknown as Ai;
    const out = await changesRunner.run([confirmed, pending], ai, { mode: 'replay' });
    expect(out.blocking).toEqual([]);
    expect(out.metrics.confirmed).toBe(1);
    expect(out.metrics.unconfirmed).toBe(1);
    expect(out.metrics['tag_decisions.meaningful.final.n']).toBe(1);
    expect(out.metrics['tag_decisions.meaningful.final.accuracy']).toBe(1);
    expect(out.metrics['prelabel_agreement.tag_decisions.meaningful.final.n']).toBe(1);
  });

  it('registers a runner for changes and reviews', () => {
    expect(RUNNERS.changes).toBeDefined();
    expect(RUNNERS.reviews).toBeDefined();
  });
});
