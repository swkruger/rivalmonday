import type { Ai } from '@cs/ai';
import { describe, expect, it } from 'vitest';
import { captureAi } from './capture-ai';

describe('captureAi', () => {
  it('records tool-result messages from chatWithTools requests and resets', async () => {
    const inner = { chatWithTools: async () => ({ text: 'ok' }) } as unknown as Ai;
    const ai = captureAi(inner);
    const scope = {} as never;
    await ai.chatWithTools('ask', {
      messages: [{ role: 'user', content: 'hi' }, { role: 'tool', toolCallId: '1', content: 'EVIDENCE A' }],
      tools: [],
    }, scope);
    await ai.chatWithTools('ask', {
      messages: [{ role: 'tool', toolCallId: '1', content: 'EVIDENCE A' }, { role: 'tool', toolCallId: '2', content: 'EVIDENCE B' }],
      tools: [],
    }, scope);
    expect(ai.toolMessages()).toEqual(['EVIDENCE A', 'EVIDENCE A', 'EVIDENCE B']);
    ai.reset();
    expect(ai.toolMessages()).toEqual([]);
  });
});
