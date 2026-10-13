import { ASK_COPY } from '@cs/ask';
import { createScriptedAskAi } from '@cs/ask/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('./env', () => ({ webEnv: () => ({ askFakeAi: true, appUrl: 'http://localhost' }) }));
const store = vi.hoisted(() => ({ get: async () => null }));
vi.mock('./tools', () => ({ registry: () => ({}), toolDeps: () => ({ evidenceStore: store }) }));

const { E2E_SCRIPT, askDeps, sseFrame } = await import('./ask');

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EV1 = '11111111-1111-4111-8111-111111111111';
const EV2 = '22222222-2222-4222-8222-222222222222';
const scope = { agencyId: 'a', clientId: CLIENT };
const opening = [
  { role: 'system' as const, content: 'You are Friday.' },
  { role: 'system' as const, content: `The business is Acme (clientId ${CLIENT}). Today is 2026-10-12.` },
  { role: 'user' as const, content: 'What changed?' },
];
const toolResult = (value: unknown) => ({ role: 'tool' as const, toolCallId: 'call_1', content: `<data tool="search_events">${JSON.stringify(value)}</data>` });

describe('E2E_SCRIPT', () => {
  it('guards in scope, calls search_events for the client, then answers citing the first evidence id', async () => {
    const ai = createScriptedAskAi(E2E_SCRIPT);
    for (let i = 0; i < 2; i++) {
      const g = await ai.decide('ask_guard_decisions', { question: 'q' }, { verdict: { type: 'choice', instructions: 'x', options: { in_scope: 'a', out_of_scope: 'b' } } } as never, scope);
      expect(g.answers.verdict).toMatchObject({ value: 'in_scope' });
      expect(g.needsReview).toEqual([]);
    }
    const first = await ai.chatWithTools('ask_assistant', { messages: opening, tools: [], toolChoice: 'auto' }, scope);
    expect(first.toolCalls).toHaveLength(1);
    expect(first.toolCalls[0]!.name).toBe('search_events');
    expect(JSON.parse(first.toolCalls[0]!.arguments)).toMatchObject({ clientId: CLIENT });

    const items = { items: [{ id: 'e0', title: 'No evidence here', evidenceIds: [] }, { id: 'e1', title: 'Acme cut its tune-up to $69', evidenceIds: [EV1, EV2] }], hasMore: false };
    const second = await ai.chatWithTools('ask_assistant', {
      messages: [...opening, { role: 'assistant', content: null, toolCalls: first.toolCalls }, toolResult(items)], tools: [], toolChoice: 'auto',
    }, scope);
    expect(second.toolCalls).toEqual([]);
    expect(second.text).toContain(`[ev:${EV1}]`);
    expect(second.text).not.toContain(EV2);
    expect(second.text).toContain('Acme cut its tune-up to $69');

    // Support verdicts repeat (one call per citation group), all supported.
    for (let i = 0; i < 3; i++) {
      const s = await ai.decide('ask_support', { evidence: 'e' }, { s0: { type: 'noul', instructions: 'Is it supported: "x"' } } as never, scope);
      expect(s.answers.s0).toMatchObject({ value: true });
    }
  });

  it('answers with the no-evidence copy when the search finds nothing', async () => {
    const ai = createScriptedAskAi(E2E_SCRIPT);
    const second = await ai.chatWithTools('ask_assistant', {
      messages: [...opening, { role: 'assistant', content: null, toolCalls: [{ id: 'call_1', name: 'search_events', arguments: '{}' }] }, toolResult({ items: [], hasMore: false })],
      tools: [], toolChoice: 'auto',
    }, scope);
    expect(second.text).toBe(ASK_COPY.noEvidence);
  });

  it('proposes submit_feedback (useful) on the first found event when the question says "as useful"', async () => {
    const ai = createScriptedAskAi(E2E_SCRIPT);
    const ask = [...opening.slice(0, 2), { role: 'user' as const, content: 'Rate the latest change as useful' }];
    const items = { items: [{ id: EV2, title: 'Acme cut its tune-up to $69', evidenceIds: [EV1] }], hasMore: false };
    const r = await ai.chatWithTools('ask_assistant', {
      messages: [...ask, { role: 'assistant', content: null, toolCalls: [{ id: 'call_1', name: 'search_events', arguments: '{}' }] }, toolResult(items)],
      tools: [], toolChoice: 'auto',
    }, scope);
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]!.name).toBe('submit_feedback');
    expect(JSON.parse(r.toolCalls[0]!.arguments)).toEqual({ clientId: CLIENT, eventId: EV2, verdict: 'useful' });
  });

  it('answers without tools on the forced last step', async () => {
    const ai = createScriptedAskAi(E2E_SCRIPT);
    const r = await ai.chatWithTools('ask_assistant', { messages: opening, tools: [], toolChoice: 'none' }, scope);
    expect(r.toolCalls).toEqual([]);
    expect(r.text).toBe(ASK_COPY.noEvidence);
  });
});

describe('askDeps', () => {
  it('uses the scripted AI when ASK_FAKE_AI is on, with the evidence store in the tool deps', async () => {
    const d = await askDeps();
    expect('calls' in d.ai).toBe(true);
    expect(d.toolDeps.evidenceStore).toBe(store);
  });
});

describe('sseFrame', () => {
  it('frames one event as a data line', () => {
    expect(sseFrame({ type: 'progress', label: 'Working…' })).toBe('data: {"type":"progress","label":"Working…"}\n\n');
  });
});
