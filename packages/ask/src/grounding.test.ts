import type { Ai } from '@cs/ai';
import type { CallScope } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { groundAnswer } from './grounding';
import { ASK_COPY } from './quota';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const scope = {} as CallScope;
const NO = ASK_COPY.noEvidence;

type Call = { evidence: string; sentences: string[] };
/** A sentence containing BAD fails the support check; everything else passes. */
function fakeAi(calls: Call[] = []): Ai {
  return {
    decide: async (_task: string, input: { evidence: string }, questions: Record<string, { instructions: string }>) => {
      const entries = Object.entries(questions);
      calls.push({ evidence: input.evidence, sentences: entries.map(([, q]) => q.instructions) });
      return {
        answers: Object.fromEntries(entries.map(([k, q]) => [k, { type: 'noul', value: !q.instructions.includes('BAD') }])),
        needsReview: [],
      };
    },
  } as unknown as Ai;
}
const ev = new Map([[`ev:${A}`, 'alpha text'], [`ev:${B}`, 'beta text']]);

describe('groundAnswer', () => {
  it("tells the checker today's date so periods like 'this month' can be checked", async () => {
    const calls: Call[] = [];
    await groundAnswer(fakeAi(calls), scope, `Alpha thing [ev:${A}]. Rivals may respond.`, ev, new Date('2026-10-13T12:00:00Z'));
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c.evidence.startsWith('Today is 2026-10-13 (UTC).\n\n')).toBe(true);
  });
  it('cited sentence checked as fact against its evidence only', async () => {
    const calls: Call[] = [];
    const r = await groundAnswer(fakeAi(calls), scope, `Alpha thing [ev:${A}].`, ev);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.evidence).toMatch(/^Today is \d{4}-\d{2}-\d{2} \(UTC\)\.\n\nalpha text$/);
    expect(calls[0]!.sentences[0]).toContain('directly supported');
    expect(r.content).toBe(`Alpha thing [ev:${A}].`);
  });
  it('uncited sentence checked as interpretation', async () => {
    const calls: Call[] = [];
    await groundAnswer(fakeAi(calls), scope, 'You may want to respond.', ev);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sentences[0]).toContain('hedged readings');
    expect(calls[0]!.evidence).toContain(`ev:${A}`);
    expect(calls[0]!.evidence).toContain('beta text');
  });
  it('consecutive removed sentences collapse to one no-evidence line', async () => {
    const r = await groundAnswer(fakeAi(), scope, `Good [ev:${A}]. BAD one. BAD two. Fine [ev:${B}].`, ev);
    expect(r.content).toBe(`Good [ev:${A}]. ${NO} Fine [ev:${B}].`);
    expect(r.removed).toBe(2);
  });
  it('all removed → only the no-evidence line', async () => {
    const r = await groundAnswer(fakeAi(), scope, `BAD one [ev:${A}]. BAD two.`, ev);
    expect(r.content).toBe(NO);
    expect(r.citations).toEqual([]);
  });
  it('citations distinct in first-appearance order', async () => {
    const r = await groundAnswer(fakeAi(), scope, `One [ev:${B}]. Two [ev:${A}]. Three [ev:${B}].`, ev);
    expect(r.citations).toEqual([`ev:${B}`, `ev:${A}`]);
  });
  it('an uncited sentence is not supported by kb text (spec k9); a cited kb sentence is kept', async () => {
    const K = '33333333-3333-3333-3333-333333333333';
    const kbEv = new Map([...ev, [`kb:${K}`, 'playbook says rivals cut prices']]);
    // Supported only when the evidence it is checked against contains the word "playbook".
    const ai = {
      decide: async (_t: string, input: { evidence: string }, questions: Record<string, unknown>) => ({
        answers: Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'noul', value: input.evidence.includes('playbook') }])),
        needsReview: [],
      }),
    } as unknown as Ai;
    const r = await groundAnswer(ai, scope, `Rivals cut prices. Playbook idea [kb:${K}].`, kbEv);
    expect(r.content).toBe(`${NO} Playbook idea [kb:${K}].`);
    expect(r.citations).toEqual([`kb:${K}`]);
  });
});
