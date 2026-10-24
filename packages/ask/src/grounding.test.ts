import type { Ai } from '@cs/ai';
import type { CallScope } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { groundAnswer } from './grounding';
import { ASK_COPY } from './quota';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const scope = {} as CallScope;
const NO = ASK_COPY.noEvidence;

type Call = { task: string; evidence: string; sentences: string[] };
/** A sentence containing BAD fails the support check; everything else passes. */
function fakeAi(calls: Call[] = []): Ai {
  return {
    decide: async (task: string, input: { evidence: string }, questions: Record<string, { instructions: string }>) => {
      const entries = Object.entries(questions);
      calls.push({ task, evidence: input.evidence, sentences: entries.map(([, q]) => q.instructions) });
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
  it('cited facts use the strict verifier task; interpretations use the Ask interpretation task (owner decision 2026-10-13)', async () => {
    const calls: Call[] = [];
    await groundAnswer(fakeAi(calls), scope, `Alpha thing [ev:${A}]. Rivals may respond.`, ev);
    const byTask = Object.fromEntries(calls.map((c) => [c.task, c.sentences]));
    expect(byTask.verifier_decisions?.[0]).toContain('directly supported');
    expect(byTask.ask_interpretation_decisions?.[0]).toContain('hedged readings');
  });
  it('a cited "Possible reason:" line is checked as an interpretation against its cited evidence', async () => {
    const calls: Call[] = [];
    const r = await groundAnswer(fakeAi(calls), scope, `Alpha thing [ev:${A}]. **Possible reason:** demand may be rising [ev:${A}].`, ev);
    expect(calls).toHaveLength(2);
    const interp = calls.find((c) => c.task === 'ask_interpretation_decisions')!;
    expect(interp.sentences).toHaveLength(1);
    expect(interp.sentences[0]).toContain('hedged readings');
    expect(interp.sentences[0]).toContain('demand may be rising');
    expect(interp.evidence).toMatch(/alpha text$/);
    expect(interp.evidence).not.toContain('beta text');
    expect(r.citations).toEqual([`ev:${A}`]);
  });
  it('removed sentences are dropped silently while others survive (owner decision 2026-10-13)', async () => {
    const r = await groundAnswer(fakeAi(), scope, `Good [ev:${A}]. BAD one. BAD two. Fine [ev:${B}].`, ev);
    expect(r.content).toBe(`Good [ev:${A}]. Fine [ev:${B}].`);
    expect(r.removed).toBe(2);
  });
  it('a dropped list item keeps the paragraph break before the next block', async () => {
    const r = await groundAnswer(fakeAi(), scope, `Intro [ev:${A}].
- BAD item

After [ev:${B}].`, ev);
    expect(r.content).toBe(`Intro [ev:${A}].

After [ev:${B}].`);
  });
  it('an uncited sentence may be backed by app data, a cited app row is checked against that row', async () => {
    const P = '44444444-4444-4444-4444-444444444444';
    const appEv = new Map([...ev, [`app:${P}`, '{"name":"Aire Serv","activeAds":{"google":85}}']]);
    const calls: Call[] = [];
    const r = await groundAnswer(fakeAi(calls), scope, `Aire Serv runs 85 Google ads [app:${P}]. It is the busiest.`, appEv);
    expect(r.citations).toEqual([`app:${P}`]);
    expect(calls.find((c) => c.sentences[0]!.includes('85 Google'))!.evidence).toContain('"google":85');
    expect(calls.find((c) => c.sentences[0]!.includes('busiest'))!.evidence).toContain(`app:${P}`);
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
    expect(r.content).toBe(`Playbook idea [kb:${K}].`);
    expect(r.removed).toBe(1);
    expect(r.citations).toEqual([`kb:${K}`]);
  });

  it('7c1 R13: removes an uncited sentence with a figure even when the checker supports it; keeps cited and figure-free ones', async () => {
    const r = await groundAnswer(fakeAi(), scope, `They cut the tune-up to $69 [ev:${A}]. That is a 30% drop. Rivals may respond.`, ev);
    expect(r.content).toBe(`They cut the tune-up to $69 [ev:${A}]. Rivals may respond.`);
    expect(r.removed).toBe(1);
    expect(r.citations).toEqual([`ev:${A}`]);
  });
  it('7c1 R13: an answer of only uncited figures becomes the no-evidence line', async () => {
    const r = await groundAnswer(fakeAi(), scope, 'They charge $89 since Oct 22.', ev);
    expect(r).toEqual({ content: NO, citations: [], removed: 1 });
  });
});
