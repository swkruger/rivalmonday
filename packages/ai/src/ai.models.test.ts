import type { LedgerSink, LlmCallRecord } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { createAi, EMBED_BATCH } from './ai';
import type { ChatProvider } from './chat';
import { parseAiConfig } from './config';
import type { DecisionProvider } from './decisions/types';
import type { EmbeddingProvider } from './embeddings';

const config = parseAiConfig(`
tasks:
  llm_decisions: { provider: openrouter, model: a/small, mode: decisions }
  decisions: { provider: jev, model: jev-9, escalate_to: llm_decisions }
  embeddings: { provider: openrouter, model: e/small, mode: embeddings, dimensions: 2 }
  writer: { provider: openrouter, model: a/writer }
`);
const scope = { agencyId: null, clientId: null };
const openrouter = { id: 'openrouter', complete: async () => { throw new Error('unused'); } } as unknown as ChatProvider;

function ledger() {
  const records: LlmCallRecord[] = [];
  const sink: LedgerSink = { recordLlmCall: async (r) => { records.push(r); }, recordVendorCall: async () => {} };
  return { records, sink };
}

describe('Ai facade — embeddings and Jev model', () => {
  it('builds the Jev provider for the task model', async () => {
    const models: string[] = [];
    const jev = (model: string): DecisionProvider => {
      models.push(model);
      return {
        id: 'jev',
        decide: (async () => ({ answers: { m: { type: 'noul', value: true, probability: 0.99, confidence: 0.98 } }, model, inputTokens: 1, outputTokens: 1, costUsd: 0 })) as unknown as DecisionProvider['decide'],
      };
    };
    const ai = createAi(config, { openrouter, jev, ledger: ledger().sink });
    await ai.decide('decisions', {}, { m: { type: 'noul', instructions: 'ok?' } }, scope);
    expect(models).toEqual(['jev-9']);
  });

  it('embeds in batches with the configured dimensions, one ledger row per call', async () => {
    const calls: { input: string[]; dimensions?: number }[] = [];
    const embeddings: EmbeddingProvider = {
      id: 'openrouter',
      embed: async (req) => {
        calls.push({ input: req.input, dimensions: req.dimensions });
        return { vectors: req.input.map(() => [1, 0]), model: 'e/small', inputTokens: req.input.length, costUsd: 0.001 };
      },
    };
    const { records, sink } = ledger();
    const ai = createAi(config, { openrouter, jev: null, embeddings, ledger: sink });
    const texts = Array.from({ length: EMBED_BATCH + 1 }, (_, i) => `t${i}`);
    const r = await ai.embed('embeddings', texts, scope);
    expect(r.vectors).toHaveLength(EMBED_BATCH + 1);
    expect(calls.map((c) => c.input.length)).toEqual([EMBED_BATCH, 1]);
    expect(calls[0]?.dimensions).toBe(2);
    expect(records.map((x) => [x.task, x.provider, x.outputTokens, x.ok])).toEqual([['embeddings', 'openrouter', 0, true], ['embeddings', 'openrouter', 0, true]]);
    expect(r.inputTokens).toBe(EMBED_BATCH + 1);
  });

  it('returns nothing without calling the provider for no input, and rejects non-embedding tasks', async () => {
    const embeddings: EmbeddingProvider = { id: 'openrouter', embed: async () => { throw new Error('should not be called'); } };
    const ai = createAi(config, { openrouter, jev: null, embeddings, ledger: ledger().sink });
    expect((await ai.embed('embeddings', [], scope)).vectors).toEqual([]);
    await expect(ai.embed('writer', ['x'], scope)).rejects.toThrow(/not an embeddings task/);
  });

  it('records a failed embeddings call and rethrows', async () => {
    const embeddings: EmbeddingProvider = { id: 'openrouter', embed: async () => { throw new Error('down'); } };
    const { records, sink } = ledger();
    const ai = createAi(config, { openrouter, jev: null, embeddings, ledger: sink });
    await expect(ai.embed('embeddings', ['x'], scope)).rejects.toThrow('down');
    expect(records[0]).toMatchObject({ task: 'embeddings', ok: false, costUsd: null });
  });
});
