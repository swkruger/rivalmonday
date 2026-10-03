import type { DecisionSampleRecord, LedgerSink, LlmCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createAi } from './ai';
import type { ChatProvider } from './chat';
import { parseAiConfig } from './config';
import type { DecisionProvider, DecisionQuestion } from './decisions/types';

const config = parseAiConfig(`
tasks:
  llm_decisions: { provider: openrouter, model: a/small, mode: decisions }
  tag_decisions: { provider: jev, model: jev-1, escalate_to: llm_decisions, shadow_rate: 0.5 }
`);
const scope = { agencyId: null, clientId: null };
const q = { m: { type: 'noul', instructions: 'Meaningful?' } } satisfies Record<string, DecisionQuestion>;

function harness(opts: { jevP?: number; llmFails?: boolean; sinkFails?: boolean; random?: number; override?: number } = {}) {
  const ledgerRows: LlmCallRecord[] = [];
  const ledger: LedgerSink = { recordLlmCall: async (r) => { ledgerRows.push(r); }, recordVendorCall: async () => {} };
  const samples: DecisionSampleRecord[] = [];
  const sink = {
    recordDecisionSample: vi.fn(async (r: DecisionSampleRecord) => {
      if (opts.sinkFails) throw new Error('db down');
      samples.push(r);
      return `sample-${samples.length}`;
    }),
  };
  const complete = vi.fn(async (req: { model: string }) => {
    if (opts.llmFails) throw new Error('llm down');
    return { text: JSON.stringify({ m: { probability: 0.99 } }), model: req.model, inputTokens: 1, outputTokens: 1, costUsd: 0.001 };
  });
  const p = opts.jevP ?? 0.99;
  const jev: DecisionProvider = {
    id: 'jev',
    decide: (async () => ({ answers: { m: { type: 'noul', value: p >= 0.5, probability: p, confidence: Math.abs(p - 0.5) * 2 } }, model: 'jev-1', inputTokens: 1, outputTokens: 1, costUsd: 0 })) as unknown as DecisionProvider['decide'],
  };
  const ai = createAi(config, {
    openrouter: { id: 'openrouter', complete } as unknown as ChatProvider, jev: () => jev, ledger, samples: sink,
    random: () => opts.random ?? 0.9, shadowRateOverride: opts.override,
  });
  return { ai, samples, ledgerRows, complete, sink };
}

describe('Ai.decide shadow sampling (spec §7.3)', () => {
  it('does not sample above the rate and records nothing for a confident call', async () => {
    const h = harness({ random: 0.9 });
    const r = await h.ai.decide('tag_decisions', { after: 'x' }, q, scope);
    expect(r.sampleId).toBeUndefined();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.samples).toEqual([]);
  });

  it('samples below the rate: asks the LLM too, records both answer sets, ledgers the extra call as :shadow', async () => {
    const h = harness({ random: 0.1 });
    const r = await h.ai.decide('tag_decisions', { after: 'x' }, q, scope);
    expect(r.answers.m.provider).toBe('jev');
    expect(r.sampleId).toBe('sample-1');
    expect(h.samples[0]).toMatchObject({ task: 'tag_decisions', reason: 'shadow', state: { after: 'x' }, primary: { provider: 'jev' }, fallback: { provider: 'llm' }, needsReview: [] });
    expect(h.ledgerRows.map((x) => x.task).sort()).toEqual(['llm_decisions:shadow', 'tag_decisions']);
  });

  it('records a review sample (no extra call) when the cascade still needs review', async () => {
    // Jev at p=0.55 (confidence 0.1) escalates; the LLM at p=0.6 (confidence 0.2) is still below τ = 0.85.
    const h = harness({ jevP: 0.55, random: 0.9 });
    h.complete.mockImplementation(async (req: { model: string }) => ({ text: JSON.stringify({ m: { probability: 0.6 } }), model: req.model, inputTokens: 1, outputTokens: 1, costUsd: 0 }));
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.needsReview).toEqual(['m']);
    expect(h.samples[0]).toMatchObject({ reason: 'review', needsReview: ['m'], fallback: { provider: 'llm' } });
    expect(h.complete).toHaveBeenCalledTimes(1);
  });

  it('returns the decision unchanged when the sample write fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness({ random: 0.1, sinkFails: true });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.answers.m).toMatchObject({ value: true, provider: 'jev' });
    expect(r.sampleId).toBeNull();
    expect(err).toHaveBeenCalledWith('[ai] decision sample write failed', expect.any(Error));
    err.mockRestore();
  });

  it('returns the Jev decision when the shadow LLM call fails', async () => {
    const h = harness({ random: 0.1, llmFails: true });
    const r = await h.ai.decide('tag_decisions', {}, q, scope);
    expect(r.answers.m.provider).toBe('jev');
    expect(h.samples[0]).toMatchObject({ reason: 'shadow', fallback: null });
  });

  it('AI_SHADOW_RATE-style override replaces the configured rate', async () => {
    const h = harness({ random: 0.7, override: 1 });
    expect((await h.ai.decide('tag_decisions', {}, q, scope)).sampleId).toBe('sample-1');
  });
});
