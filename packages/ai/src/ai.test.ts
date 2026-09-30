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
  decisions: { provider: jev, escalate_to: llm_decisions, min_confidence: { default: 0.85 } }
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
  const ai = createAi(config, { openrouter, jev: opts.jev === false ? null : jev, ledger, now: () => (t += 7) });
  return { ai, records, complete };
}

describe('Ai facade', () => {
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
});
