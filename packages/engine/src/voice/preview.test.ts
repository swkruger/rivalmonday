import type { Ai } from '@cs/ai';
import { DEFAULT_VOICE } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { voiceBlock } from './block';
import { PREVIEW_EVIDENCE, VOICE_PREVIEW_TASK, writeVoicePreview } from './preview';

/** Records the whole chat input (the shared fake keeps only the last message). */
function recordingAi(reply: string) {
  const calls: { task: string; input: { messages: { role: string; content: unknown }[] }; scope: unknown }[] = [];
  const ai = { chat: async (task: string, input: { messages: { role: string; content: unknown }[] }, scope: unknown) => { calls.push({ task, input, scope }); return { text: reply }; } } as unknown as Ai;
  return { ai, calls };
}

describe('writeVoicePreview', () => {
  it('prompt carries the block and PREVIEW_EVIDENCE, no client data', async () => {
    const { ai, calls } = recordingAi('  Example lowered a price. Review yours.  ');
    const voice = { tone: 'direct' as const, preferredTerms: [{ say: 'visit', insteadOf: 'call-out' }], bannedTerms: ['cheap'] };
    const scope = { agencyId: 'a1', clientId: null };
    expect(await writeVoicePreview(ai, scope, voice)).toBe('Example lowered a price. Review yours.');
    const c = calls[0]!;
    expect(c.task).toBe(VOICE_PREVIEW_TASK);
    expect(c.scope).toEqual(scope);
    const [system, user] = c.input.messages;
    expect(system!.content).toContain(voiceBlock(voice));
    expect(user!.content).toContain(PREVIEW_EVIDENCE);
    expect(JSON.stringify(c.input)).not.toMatch(/client_id|clientId/);
  });

  it('default voice adds no block', async () => {
    const { ai, calls } = recordingAi('ok');
    await writeVoicePreview(ai, { agencyId: 'a1', clientId: null }, DEFAULT_VOICE);
    expect(JSON.stringify(calls[0]!.input)).not.toContain('<voice>');
  });
});
