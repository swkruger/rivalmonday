import type { LlmCallRecord, LedgerSink } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createAi } from './ai';
import type { ChatProvider } from './chat';
import { parseAiConfig } from './config';
import type { DecisionProvider, DecisionQuestion } from './decisions/types';

const config = parseAiConfig(`
tasks:
  brief_writer: { provider: openrouter, model: a/writer, fallbacks: [b/backup], temperature: 0.3 }
  llm_decisions: { provider: openrouter, model: a/small, mode: decisions }
  ask_assistant: { provider: openrouter, model: anthropic/claude-sonnet-5, temperature: 0.2, max_tokens: 1500 }
  embeddings: { provider: openrouter, model: e/small, mode: embeddings, dimensions: 512 }
  decisions: { provider: jev, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
  theme_discovery_batch: { provider: anthropic, model: claude-sonnet-5, mode: batch, input_usd_per_mtok: 1, output_usd_per_mtok: 5 }
`);

const scope = { agencyId: '00000000-0000-4000-8000-00000000000a', clientId: null };
const q = { m: { type: 'noul', instructions: 'Meaningful?' } } satisfies Record<string, DecisionQuestion>;

function harness(opts: { chatFails?: boolean; jevProbability?: number; jev?: boolean; ledgerFails?: boolean } = {}) {
  const records: LlmCallRecord[] = [];
  const ledger: LedgerSink = {
    recordLlmCall: async (r) => {
      if (opts.ledgerFails) throw new Error('ledger down');
      records.push(r);
    },
    recordVendorCall: async () => {},
  };
  const complete = vi.fn(async (req: { model: string; jsonSchema?: unknown }) => {
    if (opts.chatFails) throw new Error('down');
    const text = req.jsonSchema ? JSON.stringify({ m: { probability: 0.99 } }) : 'brief';
    return { text, model: req.model, inputTokens: 10, outputTokens: 5, costUsd: 0.001 };
  });
  const openrouter = { id: 'openrouter', complete } as unknown as ChatProvider;
  const p = opts.jevProbability ?? 0.99;
  const jev: DecisionProvider = {
    id: 'jev',
    decide: vi.fn(async () => ({
      answers: { m: { type: 'noul', value: p >= 0.5, probability: p, confidence: Math.abs(p - 0.5) * 2 } },
      model: 'jev-x', inputTokens: 100, outputTokens: 1, costUsd: 0.0000042,
    })) as unknown as DecisionProvider['decide'],
  };
  let t = 0;
  const ai = createAi(config, { openrouter, jev: opts.jev === false ? null : () => jev, ledger, now: () => (t += 7) });
  return { ai, records, complete };
}

describe('Ai facade', () => {
  it('chatWithTools writes one ledger row per call (error row on failure)', async () => {
    const ok = harness();
    const tools = [{ name: 't', description: 'd', parameters: { type: 'object' } }];
    await ok.ai.chatWithTools('ask_assistant', { messages: [{ role: 'user', content: 'x' }], tools, toolChoice: 'auto' }, scope);
    expect(ok.records).toHaveLength(1);
    expect(ok.records[0]).toMatchObject({ task: 'ask_assistant', ok: true, provider: 'openrouter' });
    expect(ok.complete).toHaveBeenCalledWith(expect.objectContaining({ tools, toolChoice: 'auto', model: 'anthropic/claude-sonnet-5', temperature: 0.2, maxTokens: 1500 }));
    const bad = harness({ chatFails: true });
    await expect(bad.ai.chatWithTools('ask_assistant', { messages: [], tools }, scope)).rejects.toThrow('down');
    expect(bad.records).toHaveLength(1);
    expect(bad.records[0]).toMatchObject({ ok: false });
  });

  it('chatWithTools rejects a non-chat task', async () => {
    const { ai } = harness();
    await expect(ai.chatWithTools('embeddings', { messages: [], tools: [] }, scope)).rejects.toThrow(/not a chat task/);
    await expect(ai.chatWithTools('nope', { messages: [], tools: [] }, scope)).rejects.toThrow(/unknown ai task/i);
  });

  it('routes chat tasks with configured model settings and records the call', async () => {
    const { ai, records, complete } = harness();
    const r = await ai.chat('brief_writer', { messages: [{ role: 'user', content: 'x' }] }, scope);
    expect(r.text).toBe('brief');
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ model: 'a/writer', fallbacks: ['b/backup'], temperature: 0.3 });
    expect(records).toEqual([
      { ...scope, task: 'brief_writer', provider: 'openrouter', model: 'a/writer', inputTokens: 10, outputTokens: 5, costUsd: 0.001, latencyMs: 7, ok: true },
    ]);
  });

  it('records failed chat calls and rethrows', async () => {
    const { ai, records } = harness({ chatFails: true });
    await expect(ai.chat('brief_writer', { messages: [] }, scope)).rejects.toThrow('down');
    expect(records[0]).toMatchObject({ ok: false, inputTokens: 0, costUsd: null });
  });

  it('resolves with the chat result even if the ledger write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ai, complete } = harness({ ledgerFails: true });
    const r = await ai.chat('brief_writer', { messages: [{ role: 'user', content: 'x' }] }, scope);
    expect(r.text).toBe('brief');
    expect(complete).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[ai] ledger write failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('rejects with the provider error, not the ledger error, when both the provider and the ledger fail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ai } = harness({ chatFails: true, ledgerFails: true });
    await expect(ai.chat('brief_writer', { messages: [] }, scope)).rejects.toThrow('down');
    expect(errorSpy).toHaveBeenCalledWith('[ai] ledger write failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('rejects unknown tasks and wrong task kinds', async () => {
    const { ai } = harness();
    await expect(ai.chat('nope', { messages: [] }, scope)).rejects.toThrow(/unknown ai task/i);
    await expect(ai.chat('decisions', { messages: [] }, scope)).rejects.toThrow(/not a chat task/i);
    await expect(ai.decide('brief_writer', 's', q, scope)).rejects.toThrow(/not a decision task/i);
  });

  it('decides with Jev and records a jev ledger row', async () => {
    const { ai, records, complete } = harness();
    const r = await ai.decide('decisions', 's', q, scope);
    expect(r.answers.m).toMatchObject({ value: true, provider: 'jev' });
    expect(complete).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ task: 'decisions', provider: 'jev', model: 'jev-x', inputTokens: 100 });
  });

  it('escalates low-confidence Jev answers to the LLM and records both calls', async () => {
    const { ai, records } = harness({ jevProbability: 0.55 });
    const r = await ai.decide('decisions', 's', q, scope);
    expect(r.answers.m.provider).toBe('llm');
    expect(records.map((x) => [x.task, x.provider])).toEqual([['decisions', 'jev'], ['llm_decisions', 'llm']]);
  });

  it('falls back to the escalation task when Jev is not configured', async () => {
    const { ai } = harness({ jev: false });
    const r = await ai.decide('decisions', 's', q, scope);
    expect(r.answers.m.provider).toBe('llm');
  });

  it('batch tasks: available only with a provider; collect ledgers one row per result at batch prices', async () => {
    const provider = {
      id: 'anthropic',
      submit: vi.fn(async () => 'msgbatch_9'),
      status: vi.fn(async () => 'ended' as const),
      results: vi.fn(async () => [
        { customId: 'hvac_plumbing', ok: true as const, text: '{}', model: 'claude-sonnet-5', inputTokens: 1_000_000, outputTokens: 100_000 },
        { customId: 'dental', ok: false as const, error: 'expired' },
      ]),
    };
    const records: LlmCallRecord[] = [];
    const ledger: LedgerSink = { recordLlmCall: async (r) => { records.push(r); }, recordVendorCall: async () => {} };
    const noBatch = createAi(config, { openrouter: { id: 'openrouter', complete: vi.fn() } as unknown as ChatProvider, jev: null, ledger });
    expect(noBatch.batchAvailable('theme_discovery_batch')).toBe(false);
    const ai = createAi(config, { openrouter: { id: 'openrouter', complete: vi.fn() } as unknown as ChatProvider, jev: null, ledger, batch: provider });
    expect(ai.batchAvailable('theme_discovery_batch')).toBe(true);
    expect(ai.batchAvailable('brief_writer')).toBe(false);
    expect(await ai.submitBatch('theme_discovery_batch', [{ customId: 'hvac_plumbing', messages: [{ role: 'user', content: 'x' }] }], scope)).toBe('msgbatch_9');
    const r = await ai.collectBatch('theme_discovery_batch', 'msgbatch_9', scope);
    expect(r.status).toBe('ended');
    expect(records.map((x) => [x.task, x.provider, x.ok, x.costUsd])).toEqual([['theme_discovery_batch', 'anthropic', true, 1.5], ['theme_discovery_batch', 'anthropic', false, null]]);
    await expect(ai.chat('theme_discovery_batch', { messages: [] }, scope)).rejects.toThrow(/not a chat task/);
  });

  it('collectBatch tags each result row with scopeFor(customId)', async () => {
    const provider = {
      id: 'anthropic',
      submit: vi.fn(async () => 'msgbatch_9'),
      status: vi.fn(async () => 'ended' as const),
      results: vi.fn(async () => [
        { customId: 'hvac_plumbing', ok: true as const, text: '{}', model: 'claude-sonnet-5', inputTokens: 10, outputTokens: 10 },
        { customId: 'dental', ok: false as const, error: 'expired' },
      ]),
    };
    const records: LlmCallRecord[] = [];
    const ledger: LedgerSink = { recordLlmCall: async (r) => { records.push(r); }, recordVendorCall: async () => {} };
    const ai = createAi(config, { openrouter: { id: 'openrouter', complete: vi.fn() } as unknown as ChatProvider, jev: null, ledger, batch: provider });
    await ai.collectBatch('theme_discovery_batch', 'msgbatch_9', scope, (id) => ({ verticalId: id }));
    expect(records.map((x) => [x.verticalId, x.agencyId, x.clientId])).toEqual([
      ['hvac_plumbing', scope.agencyId, scope.clientId],
      ['dental', scope.agencyId, scope.clientId],
    ]);
    records.length = 0;
    await ai.collectBatch('theme_discovery_batch', 'msgbatch_9', scope);
    expect(records).toHaveLength(2);
    for (const r of records) expect(r).toMatchObject(scope);
    expect(records.every((r) => r.verticalId === undefined)).toBe(true);
  });

  it('escalation uses the jev task\'s timing, and chat/embeddings pass their own task timing', async () => {
    const cfg = parseAiConfig(`
tasks:
  llm_decisions: { provider: openrouter, model: a/small, mode: decisions, timeout_ms: 50000, max_attempts: 3 }
  fast_decisions: { provider: jev, escalate_to: llm_decisions, min_confidence: { default: 0.85 }, request_path: true, timeout_ms: 10000, max_attempts: 2 }
  chatty: { provider: openrouter, model: a/writer, request_path: true, timeout_ms: 20000, max_attempts: 2 }
  embeddings: { provider: openrouter, model: e/small, mode: embeddings, dimensions: 512, request_path: true, timeout_ms: 8000, max_attempts: 2 }
`);
    const records: LlmCallRecord[] = [];
    const ledger: LedgerSink = { recordLlmCall: async (r) => { records.push(r); }, recordVendorCall: async () => {} };
    const complete = vi.fn(async (req: { model: string }) => ({ text: JSON.stringify({ m: { probability: 0.99 } }), model: req.model, inputTokens: 1, outputTokens: 1, costUsd: 0 }));
    const jevTimings: unknown[] = [];
    // Jev answers with low confidence so the cascade escalates to the LLM provider.
    const lowJev: DecisionProvider = {
      id: 'jev',
      decide: vi.fn(async () => ({
        answers: { m: { type: 'noul', value: true, probability: 0.55, confidence: 0.1 } }, model: 'jev-x', inputTokens: 1, outputTokens: 1, costUsd: 0,
      })) as unknown as DecisionProvider['decide'],
    };
    const embed = vi.fn(async () => ({ vectors: [[1]], model: 'e', inputTokens: 1, costUsd: 0 }));
    const ai = createAi(cfg, {
      openrouter: { id: 'openrouter', complete } as unknown as ChatProvider,
      jev: (_m, timing) => { jevTimings.push(timing); return lowJev; },
      embeddings: { id: 'openrouter', embed } as unknown as import('./embeddings').EmbeddingProvider,
      ledger,
    });
    await ai.decide('fast_decisions', {}, q, scope);
    expect(jevTimings).toEqual([{ timeoutMs: 10_000, maxAttempts: 2 }]);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ timing: { timeoutMs: 10_000, maxAttempts: 2 } }));
    await ai.chat('chatty', { messages: [] }, scope);
    expect(complete).toHaveBeenLastCalledWith(expect.objectContaining({ timing: { timeoutMs: 20_000, maxAttempts: 2 } }));
    await ai.embed('embeddings', ['x'], scope);
    expect(embed).toHaveBeenCalledWith(expect.objectContaining({ timing: { timeoutMs: 8_000, maxAttempts: 2 } }));
  });
});
