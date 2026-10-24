import type { Ai, ChatResult } from '@cs/ai';
import { describe, expect, it } from 'vitest';
import type { EvalCase } from '../case';
import { BudgetExceededError } from '../budget';
import type { ChangeInput } from '../build/common';
import { buildSynthetic } from '../build/synthetic';
import { PRELABEL_TASK, prelabel, prelabelDetailed } from './prelabel';

const reply = (text: string, model = 'anthropic/claude-sonnet-5'): ChatResult =>
  ({ text, model, inputTokens: 1, outputTokens: 1, costUsd: 0.001, cachedTokens: 0, toolCalls: [], finishReason: 'stop' }) as unknown as ChatResult;

/** Scripted Ai: `chat` answers from the queue; records each request. */
function scripted(answers: (string | Error)[]) {
  const calls: { task: string; content: string }[] = [];
  const ai = {
    chat: async (task: string, input: { messages: { content: string }[] }) => {
      calls.push({ task, content: input.messages.map((m) => m.content).join('\n') });
      const a = answers.shift();
      if (a === undefined) throw new Error('no scripted answer');
      if (a instanceof Error) throw a;
      return reply(a);
    },
  } as unknown as Ai;
  return { ai, calls };
}

const unlabelled = (): EvalCase => {
  const [c] = buildSynthetic('changes', 1, 9);
  return { ...c!, source: 'cs_dev', id: 'changes-csdev-abc', label: null, labelBy: null };
};
const answerFor = (c: EvalCase, over: Record<string, unknown> = {}) => {
  const keys = (c.input as ChangeInput).questionKeys;
  return JSON.stringify({ ...Object.fromEntries(keys.map((k) => [k, k === 'meaningful' ? true : k === 'change_type' ? 'promo' : 'none'])), ...over });
};

describe('prelabel', () => {
  it('prelabel parses and validates against allowed values', async () => {
    const c = unlabelled();
    const { ai, calls } = scripted([`\`\`\`json\n${answerFor(c)}\n\`\`\``]);
    const [out] = await prelabel(ai, [c]);
    expect(calls[0]!.task).toBe(PRELABEL_TASK);
    expect(calls[0]!.content).toContain('change_type');
    expect(calls[0]!.content).toContain('price_change'); // allowed values are in the prompt
    expect(out).toMatchObject({ labelBy: 'llm:anthropic/claude-sonnet-5', confirmedAt: null });
    expect(out!.label).toMatchObject({ meaningful: 'true', change_type: 'promo', service_dental: 'none' });
  });

  it('retries once on a value outside the allowed set, then leaves the case unlabelled and reports it', async () => {
    const c = unlabelled();
    const fixed = scripted([answerFor(c, { change_type: 'weather' }), answerFor(c)]);
    expect((await prelabel(fixed.ai, [c]))[0]!.label).toMatchObject({ change_type: 'promo' });
    expect(fixed.calls).toHaveLength(2);
    expect(fixed.calls[1]!.content).toMatch(/weather/);

    const bad = scripted([answerFor(c, { change_type: 'weather' }), 'not json']);
    const r = await prelabelDetailed(bad.ai, [c]);
    expect(r.cases[0]!.label).toBeNull();
    expect(r.failed).toEqual([expect.objectContaining({ id: c.id })]);
  });

  it('cross-checks template labels without replacing them and reports disagreements', async () => {
    const [t] = buildSynthetic('changes', 1, 9);
    const want = t!.label as Record<string, string>;
    const other = want.meaningful === 'true' ? false : true;
    const { ai } = scripted([JSON.stringify({ ...want, meaningful: other })]);
    const r = await prelabelDetailed(ai, [t!]);
    expect(r.cases[0]!.label).toEqual(want);
    expect(r.cases[0]!.labelBy).toBe('template+llm-disagrees:anthropic/claude-sonnet-5');
    expect(r.mismatches).toEqual([{ id: t!.id, key: 'meaningful', label: want.meaningful, llm: String(other) }]);
    // A cross-checked or confirmed case is not asked again.
    const again = scripted([]);
    expect((await prelabelDetailed(again.ai, r.cases)).asked).toBe(0);
  });

  it('a budget stop keeps the labels gathered so far', async () => {
    const a = unlabelled();
    const b = { ...unlabelled(), id: 'changes-csdev-def' };
    const { ai } = scripted([answerFor(a), new BudgetExceededError(5, 5)]);
    const r = await prelabelDetailed(ai, [a, b], { concurrency: 1 });
    expect(r.stopped).toMatch(/budget/i);
    expect(r.cases[0]!.label).not.toBeNull();
    expect(r.cases[1]!.label).toBeNull();
  });
});
