import type { Ai } from '@cs/ai';

/** Records the tool-result messages the model saw in `chatWithTools` requests (Ask suite: which evidence was in view). */
export function captureAi(inner: Ai): Ai & { toolMessages(): string[]; reset(): void } {
  let seen: string[] = [];
  return {
    chat: (t, i, s) => inner.chat(t, i, s),
    chatWithTools: (task, req, scope) => {
      for (const m of req.messages) if (m.role === 'tool') seen.push(m.content);
      return inner.chatWithTools(task, req, scope);
    },
    decide: (t, st, q, s) => inner.decide(t, st, q, s),
    embed: (t, x, s) => inner.embed(t, x, s),
    batchAvailable: (t) => inner.batchAvailable(t),
    submitBatch: (t, r, s) => inner.submitBatch(t, r, s),
    collectBatch: (t, id, s, f) => inner.collectBatch(t, id, s, f),
    toolMessages: () => [...seen],
    reset: () => {
      seen = [];
    },
  };
}
