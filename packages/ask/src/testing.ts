import type { Ai, ChatMessage, ChatResult, ChatTool, DecisionQuestion, ResolvedAnswer } from '@cs/ai';
import type { CallScope } from '@cs/core';

/** What one scripted `chatWithTools` call returns: tool calls (args as an object or a raw string) and/or final text. */
export type ScriptedReply =
  | { hang: true }
  | { text?: string; toolCalls?: { name: string; args: unknown; id?: string }[]; model?: string; costUsd?: number | null }
  | { error: string };

export type ScriptedChatRequest = { messages: ChatMessage[]; tools: ChatTool[]; toolChoice?: 'auto' | 'none'; signal?: AbortSignal };

/**
 * One scripted answer. Each kind is its own queue, consumed in order; a step with `repeat: true` is never consumed
 * (so one scripted AI can serve many turns, e.g. the E2E server). Empty queues fall back to defaults:
 * guard → confident `in_scope`, support → every claim supported, chat → throws "script exhausted".
 */
export type ScriptedStep =
  | { kind: 'guard'; verdict: 'in_scope' | 'out_of_scope' | 'injection'; confident?: boolean; repeat?: boolean }
  | { kind: 'guard'; error: string; repeat?: boolean }
  /** A reply, or a function of the request so far (e.g. "if the last message is a tool result, answer citing it"). */
  | { kind: 'chat'; reply: ScriptedReply | ((req: ScriptedChatRequest) => ScriptedReply); repeat?: boolean }
  /** `verdict(sentence)` decides one claim (the sentence quoted in the support question). Grounding makes one call per
   * citation group, so a step meant for the whole answer needs `repeat: true`. */
  | { kind: 'support'; verdict: boolean | ((sentence: string, evidence: string) => boolean); repeat?: boolean };

export type ScriptedAskAi = Ai & {
  calls: {
    chat: (ScriptedChatRequest & { task: string; scope: CallScope })[];
    decide: { task: string; state: unknown; questions: Record<string, DecisionQuestion> }[];
  };
};

const GUARD_TASK = 'ask_guard_decisions';

function take<S extends ScriptedStep>(queue: S[]): S | undefined {
  const s = queue[0];
  if (s && !s.repeat) queue.shift();
  return s;
}

/** The claim inside a supportCheck question (it ends with the sentence in double quotes); the whole text otherwise. */
function claimOf(instructions: string): string {
  const m = /"([^"]*)"$/.exec(instructions);
  return m ? m[1]! : instructions;
}

/** The EVIDENCE string a supportCheck call was given. */
function evidenceOf(state: unknown): string {
  const e = (state as { evidence?: unknown } | null)?.evidence;
  return typeof e === 'string' ? e : '';
}

/** A deterministic `Ai` for Ask tests and the E2E fake (never calls a provider). */
export function createScriptedAskAi(script: ScriptedStep[]): ScriptedAskAi {
  const guard = script.filter((s): s is Extract<ScriptedStep, { kind: 'guard' }> => s.kind === 'guard');
  const chat = script.filter((s): s is Extract<ScriptedStep, { kind: 'chat' }> => s.kind === 'chat');
  const support = script.filter((s): s is Extract<ScriptedStep, { kind: 'support' }> => s.kind === 'support');
  const calls: ScriptedAskAi['calls'] = { chat: [], decide: [] };
  let seq = 0;
  const notScripted = (what: string) => async () => {
    throw new Error(`createScriptedAskAi: ${what} is not scripted`);
  };

  const ai: ScriptedAskAi = {
    calls,
    async chatWithTools(task, req, scope): Promise<ChatResult> {
      const snapshot: ScriptedChatRequest = { messages: [...req.messages], tools: req.tools, toolChoice: req.toolChoice, signal: req.signal };
      calls.chat.push({ ...snapshot, task, scope });
      const step = take(chat);
      if (!step) throw new Error('createScriptedAskAi: chat script exhausted');
      const reply = typeof step.reply === 'function' ? step.reply(snapshot) : step.reply;
      if ('hang' in reply) {
        // A call that never answers: it rejects only when the caller's signal aborts it.
        return await new Promise<never>((_, reject) => {
          const abort = () => reject(new Error('scripted call aborted'));
          if (req.signal?.aborted) abort();
          else req.signal?.addEventListener('abort', abort, { once: true });
        });
      }
      if ('error' in reply) throw new Error(reply.error);
      const toolCalls = (reply.toolCalls ?? []).map((c) => ({
        id: c.id ?? `call_${++seq}`, name: c.name, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args ?? {}),
      }));
      return {
        text: reply.text ?? '', model: reply.model ?? 'scripted/model', inputTokens: 0, outputTokens: 0,
        costUsd: reply.costUsd === undefined ? 0 : reply.costUsd, cachedTokens: 0, toolCalls,
        finishReason: toolCalls.length ? 'tool_calls' : 'stop',
      };
    },
    async decide(task, state, questions) {
      calls.decide.push({ task, state, questions: questions as Record<string, DecisionQuestion> });
      const keys = Object.keys(questions) as (keyof typeof questions & string)[];
      if (task === GUARD_TASK) {
        const step = take(guard);
        if (step && 'error' in step) throw new Error(step.error);
        const value = step?.verdict ?? 'in_scope';
        const confident = step?.confident ?? true;
        const answer: ResolvedAnswer = { type: 'choice', value, probabilities: { [value]: confident ? 0.97 : 0.5 }, confidence: confident ? 0.97 : 0.4, provider: 'scripted' };
        return { answers: Object.fromEntries(keys.map((k) => [k, answer])) as never, needsReview: confident ? [] : keys };
      }
      const step = take(support);
      const verdict = step?.verdict ?? true;
      const answers = Object.fromEntries(keys.map((k) => {
        const q = questions[k] as DecisionQuestion;
        const value = typeof verdict === 'function' ? verdict(claimOf(q.instructions), evidenceOf(state)) : verdict;
        return [k, { type: 'noul', value, probability: value ? 0.97 : 0.03, confidence: 0.94, provider: 'scripted' } satisfies ResolvedAnswer];
      }));
      return { answers: answers as never, needsReview: [] };
    },
    chat: notScripted('chat'),
    embed: notScripted('embed'),
    batchAvailable: () => false,
    submitBatch: notScripted('submitBatch'),
    collectBatch: notScripted('collectBatch'),
  };
  return ai;
}
