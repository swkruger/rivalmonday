import type { AiDecisionMode, DecisionSampleRecord, LedgerSink, LlmCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createAi, REEVAL_DAILY_CALL_CAP } from './ai';
import type { ChatProvider } from './chat';
import { parseAiConfig } from './config';
import type { DecisionProvider, DecisionQuestion } from './decisions/types';

const config = parseAiConfig(`
tasks:
  llm_decisions: { provider: openrouter, model: a/small, mode: decisions }
  tag_decisions: { provider: jev, model: jev-1, escalate_to: llm_decisions, shadow_rate: 1 }
  ask_guard_decisions: { provider: jev, model: jev-1, escalate_to: llm_decisions, shadow_rate: 0 }
  ad_image_decisions: { provider: jev, model: jev-1, escalate_to: llm_decisions, shadow_rate: 0 }
`);
const scope = { agencyId: null, clientId: null };
const q = { m: { type: 'noul', instructions: 'Meaningful?' } } satisfies Record<string, DecisionQuestion>;
const NOW = Date.parse('2026-11-13T12:00:00Z');
const FUTURE = '2026-11-20T00:00:00.000Z';
const PAST = '2026-11-01T00:00:00.000Z';

function harness(o: { noCounter?: boolean; readerThrows?: boolean; mode?: AiDecisionMode; jevP?: number; jevThrows?: boolean; reevalToday?: number; noReader?: boolean; random?: number } = {}) {
  const ledgerRows: LlmCallRecord[] = [];
  const ledger: LedgerSink = { recordLlmCall: async (r) => { ledgerRows.push(r); }, recordVendorCall: async () => {} };
  const samples: DecisionSampleRecord[] = [];
  const sink = { recordDecisionSample: vi.fn(async (r: DecisionSampleRecord) => { samples.push(r); return `s${samples.length}`; }) };
  const complete = vi.fn(async (req: { model: string }) => ({ text: JSON.stringify({ m: { probability: 0.99 } }), model: req.model, inputTokens: 1, outputTokens: 1, costUsd: 0.001 }));
  const p = o.jevP ?? 0.99;
  const jev: DecisionProvider = {
    id: 'jev',
    decide: (async () => {
      if (o.jevThrows) throw new Error('jev down');
      return { answers: { m: { type: 'noul', value: p >= 0.5, probability: p, confidence: Math.abs(p - 0.5) * 2 } }, model: 'jev-1.14', inputTokens: 1, outputTokens: 1, costUsd: 0 };
    }) as unknown as DecisionProvider['decide'],
  };
  let bumps = 0;
  const reevalCallsToday = vi.fn(async () => (o.reevalToday ?? 0) + bumps);
  const ai = createAi(config, {
    openrouter: { id: 'openrouter', complete } as unknown as ChatProvider, jev: () => jev, ledger, samples: sink,
    random: () => o.random ?? 0.9, now: () => NOW,
    ...(o.noReader ? {} : { decisionMode: {
      read: async () => { if (o.readerThrows) throw new Error('db down'); return o.mode ?? { mode: 'jev_only', reevalUntil: null }; },
      reevalCallsToday: o.noCounter ? (undefined as unknown as () => Promise<number>) : reevalCallsToday,
      noteReevalCall: () => { bumps += 1; },
    } }),
  });
  return { ai, samples, ledgerRows, complete, reevalCallsToday };
}

describe('jev_only', () => {
  it('verifier below τ → needsReview, no LLM call', async () => {
    const h = harness({ jevP: 0.55 });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.needsReview).toEqual(['m']);
    expect(r.answers.m.provider).toBe('jev');
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.samples.map((s) => s.reason)).toEqual(['review']);
  });

  it('never shadow-samples, even at shadow_rate 1', async () => {
    const h = harness({ random: 0 });
    await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.samples).toHaveLength(0);
  });

  it('ask_guard_decisions still escalates', async () => {
    const h = harness({ jevP: 0.55 });
    const r = await h.ai.decide('ask_guard_decisions', {}, q, scope);
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(r.needsReview).toEqual([]);
    expect(r.answers.m.provider).toBe('llm');
    expect(h.ledgerRows.map((l) => l.task)).toContain('llm_decisions');
  });

  it('Jev throws → LLM fallback, operation :jev_down', async () => {
    const h = harness({ jevThrows: true });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.answers.m.provider).toBe('llm');
    expect(h.ledgerRows.filter((l) => l.provider === 'llm').map((l) => l.task)).toEqual(['llm_decisions:jev_down']);
  });
});

describe('re-evaluation window', () => {
  const reeval = { mode: 'jev_only', reevalUntil: FUTURE } as const;
  it('active → both answer, sample reason reeval, ledger :reeval', async () => {
    const h = harness({ mode: reeval, jevP: 0.55 });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(r.trace?.primary).not.toBeNull();
    expect(r.trace?.fallback).not.toBeNull();
    expect(h.samples.map((s) => s.reason)).toEqual(['reeval']);
    expect(h.ledgerRows.filter((l) => l.provider === 'llm').map((l) => l.task)).toEqual(['llm_decisions:reeval']);
  });
  it('window over → no shadow', async () => {
    const h = harness({ mode: { mode: 'jev_only', reevalUntil: PAST } });
    await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.samples).toHaveLength(0);
  });
  it('2,000 reeval rows today → no shadow', async () => {
    const h = harness({ mode: reeval, reevalToday: REEVAL_DAILY_CALL_CAP });
    await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.complete).not.toHaveBeenCalled();
    const h2 = harness({ mode: reeval, reevalToday: REEVAL_DAILY_CALL_CAP - 1 });
    await h2.ai.decide('tag_decisions', {}, q, scope);
    expect(h2.complete).toHaveBeenCalledTimes(1);
  });
  it('ask_guard_decisions is never re-evaluated', async () => {
    const h = harness({ mode: reeval });
    await h.ai.decide('ask_guard_decisions', {}, q, scope);
    expect(h.complete).not.toHaveBeenCalled();
  });
});

describe('cascade / no reader', () => {
  it('no reader → cascade (unchanged): below τ escalates, sampling applies', async () => {
    const h = harness({ noReader: true, jevP: 0.55, random: 0 });
    await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(h.samples.map((s) => s.reason)).toEqual(['shadow']);
    expect(h.ledgerRows.filter((l) => l.provider === 'llm').map((l) => l.task)).toEqual(['llm_decisions:shadow']);
  });
  it('cascade mode escalates below τ with the plain operation', async () => {
    const h = harness({ mode: { mode: 'cascade', reevalUntil: null }, jevP: 0.55, random: 1 });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.needsReview).toEqual([]);
    expect(h.ledgerRows.filter((l) => l.provider === 'llm').map((l) => l.task)).toEqual(['llm_decisions']);
  });
});

describe('review fixes', () => {
  const reeval = { mode: 'jev_only', reevalUntil: FUTURE } as const;
  it('no counter → no shadow even with an open window', async () => {
    const h = harness({ mode: reeval, noCounter: true });
    await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.complete).not.toHaveBeenCalled();
  });
  it('ad_image_decisions is exempt from jev_only (still escalates) and never re-evaluated', async () => {
    const h = harness({ mode: reeval, jevP: 0.55 });
    const r = await h.ai.decide('ad_image_decisions', {}, q, scope);
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(r.needsReview).toEqual([]);
    expect(h.ledgerRows.filter((l) => l.provider === 'llm').map((l) => l.task)).toEqual(['llm_decisions']);
  });
  it('each re-eval call bumps the counter, so the cap holds inside the cache', async () => {
    const h = harness({ mode: reeval, reevalToday: REEVAL_DAILY_CALL_CAP - 1 });
    await h.ai.decide('tag_decisions', {}, q, scope);
    await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.complete).toHaveBeenCalledTimes(1);
  });
  it('re-eval also runs in cascade mode', async () => {
    const h = harness({ mode: { mode: 'cascade', reevalUntil: FUTURE }, random: 1 });
    await h.ai.decide('tag_decisions', {}, q, scope);
    expect(h.samples.map((s) => s.reason)).toEqual(['reeval']);
    expect(h.ledgerRows.filter((l) => l.provider === 'llm').map((l) => l.task)).toEqual(['llm_decisions:reeval']);
  });
  it('mode reader throwing → cascade', async () => {
    const h = harness({ readerThrows: true, jevP: 0.55, random: 1 });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.needsReview).toEqual([]);
    expect(h.ledgerRows.filter((l) => l.provider === 'llm').map((l) => l.task)).toEqual(['llm_decisions']);
  });
});
