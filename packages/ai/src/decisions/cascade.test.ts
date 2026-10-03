import { describe, expect, it, vi } from 'vitest';
import { CascadingDecisionProvider } from './cascade';
import type { DecisionAnswer, DecisionProvider, DecisionQuestion } from './types';

const questions = {
  a: { type: 'noul', instructions: 'A?' },
  b: { type: 'choice', instructions: 'B?', options: { x: 'x', y: 'y' } },
} satisfies Record<string, DecisionQuestion>;

function fakeProvider(id: string, answers: Record<string, DecisionAnswer> | Error) {
  const decide = vi.fn(async (_state: unknown, qs: Record<string, DecisionQuestion>) => {
    if (answers instanceof Error) throw answers;
    return {
      answers: Object.fromEntries(Object.keys(qs).map((k) => [k, answers[k] as DecisionAnswer])),
      model: id, inputTokens: 1, outputTokens: 1, costUsd: 0,
    };
  });
  return { provider: { id, decide } as unknown as DecisionProvider, decide };
}

const noul = (p: number): DecisionAnswer => ({ type: 'noul', value: p >= 0.5, probability: p, confidence: Math.abs(p - 0.5) * 2 });
const choice = (v: string, c: number): DecisionAnswer => ({ type: 'choice', value: v, probabilities: { [v]: c }, confidence: c });

describe('CascadingDecisionProvider', () => {
  it('keeps confident primary answers and never calls the fallback', async () => {
    const primary = fakeProvider('jev', { a: noul(0.99), b: choice('x', 0.95) });
    const fallback = fakeProvider('llm', { a: noul(0.1), b: choice('y', 0.9) });
    const r = await new CascadingDecisionProvider(primary.provider, fallback.provider, { default: 0.85 }).decide('s', questions);
    expect(r.answers.a).toMatchObject({ value: true, provider: 'jev' });
    expect(r.needsReview).toEqual([]);
    expect(fallback.decide).not.toHaveBeenCalled();
  });

  it('escalates only low-confidence questions', async () => {
    const primary = fakeProvider('jev', { a: noul(0.99), b: choice('x', 0.5) });
    const fallback = fakeProvider('llm', { b: choice('y', 0.95) });
    const r = await new CascadingDecisionProvider(primary.provider, fallback.provider, { default: 0.85 }).decide('s', questions);
    expect(Object.keys(fallback.decide.mock.calls[0]?.[1] ?? {})).toEqual(['b']);
    expect(r.answers.b).toMatchObject({ value: 'y', provider: 'llm' });
    expect(r.answers.a.provider).toBe('jev');
    expect(r.needsReview).toEqual([]);
  });

  it('flags review when the fallback is still unsure', async () => {
    const primary = fakeProvider('jev', { a: noul(0.99), b: choice('x', 0.5) });
    const fallback = fakeProvider('llm', { b: choice('y', 0.6) });
    const r = await new CascadingDecisionProvider(primary.provider, fallback.provider, { default: 0.85 }).decide('s', questions);
    expect(r.needsReview).toEqual(['b']);
  });

  it('uses per-type thresholds', async () => {
    const primary = fakeProvider('jev', { a: noul(0.8), b: choice('x', 0.7) }); // noul confidence 0.6
    const r = await new CascadingDecisionProvider(primary.provider, null, { default: 0.9, noul: 0.5, choice: 0.65 }).decide('s', questions);
    expect(r.needsReview).toEqual([]);
  });

  it('flags review without a fallback', async () => {
    const primary = fakeProvider('jev', { a: noul(0.99), b: choice('x', 0.5) });
    const r = await new CascadingDecisionProvider(primary.provider, null, { default: 0.85 }).decide('s', questions);
    expect(r.answers.b.provider).toBe('jev');
    expect(r.needsReview).toEqual(['b']);
  });

  it('escalates everything when the primary fails, and rethrows without a fallback', async () => {
    const primary = fakeProvider('jev', new Error('529 overloaded'));
    const fallback = fakeProvider('llm', { a: noul(0.99), b: choice('y', 0.99) });
    const r = await new CascadingDecisionProvider(primary.provider, fallback.provider, { default: 0.85 }).decide('s', questions);
    expect(r.answers.a.provider).toBe('llm');
    expect(r.answers.b.provider).toBe('llm');
    await expect(new CascadingDecisionProvider(primary.provider, null, { default: 0.85 }).decide('s', questions)).rejects.toThrow('529');
  });
});

const qs = { a: { type: 'noul', instructions: 'A?' }, b: { type: 'noul', instructions: 'B?' } } satisfies Record<string, DecisionQuestion>;
const fixed = (id: string, conf: Record<string, number>, fail = false): DecisionProvider => ({
  id,
  decide: vi.fn(async (_s: unknown, q: Record<string, DecisionQuestion>) => {
    if (fail) throw new Error(`${id} down`);
    const answers = Object.fromEntries(Object.keys(q).map((k) => [k, { type: 'noul', value: true, probability: 0.5 + conf[k]! / 2, confidence: conf[k]! }]));
    return { answers, model: id, inputTokens: 1, outputTokens: 1, costUsd: 0 };
  }) as unknown as DecisionProvider['decide'],
});

describe('CascadingDecisionProvider trace and shadow mode', () => {
  it('traces the primary answers for every key and the fallback answers for escalated keys only', async () => {
    const r = await new CascadingDecisionProvider(fixed('jev', { a: 0.95, b: 0.2 }), fixed('llm', { a: 0.9, b: 0.9 }), { default: 0.85 }).decide('s', qs);
    expect(Object.keys(r.trace!.primary!.answers)).toEqual(['a', 'b']);
    expect(Object.keys(r.trace!.fallback!.answers)).toEqual(['b']);
    expect([r.answers.a.provider, r.answers.b.provider]).toEqual(['jev', 'llm']);
  });

  it('in shadow mode asks both providers every question and resolves exactly like the cascade', async () => {
    const llm = fixed('llm', { a: 0.9, b: 0.9 });
    const r = await new CascadingDecisionProvider(fixed('jev', { a: 0.95, b: 0.2 }), llm, { default: 0.85 }).decide('s', qs, { shadow: true });
    expect(Object.keys((llm.decide as ReturnType<typeof vi.fn>).mock.calls[0]![1])).toEqual(['a', 'b']);
    expect(Object.keys(r.trace!.fallback!.answers)).toEqual(['a', 'b']);
    expect([r.answers.a.provider, r.answers.b.provider]).toEqual(['jev', 'llm']);
    expect(r.needsReview).toEqual([]);
  });

  it('in shadow mode a failed LLM leaves the Jev decision untouched', async () => {
    const r = await new CascadingDecisionProvider(fixed('jev', { a: 0.95, b: 0.2 }), fixed('llm', {}, true), { default: 0.85 }).decide('s', qs, { shadow: true });
    expect([r.answers.a.provider, r.answers.b.provider]).toEqual(['jev', 'jev']);
    expect(r.needsReview).toEqual(['b']);
    expect(r.trace!.fallback).toBeNull();
  });

  it('in shadow mode a failed Jev falls back to the LLM, and both failing rethrows the Jev error', async () => {
    const r = await new CascadingDecisionProvider(fixed('jev', {}, true), fixed('llm', { a: 0.9, b: 0.9 }), { default: 0.85 }).decide('s', qs, { shadow: true });
    expect(r.answers.a.provider).toBe('llm');
    await expect(new CascadingDecisionProvider(fixed('jev', {}, true), fixed('llm', {}, true), { default: 0.85 }).decide('s', qs, { shadow: true })).rejects.toThrow('jev down');
  });
});
