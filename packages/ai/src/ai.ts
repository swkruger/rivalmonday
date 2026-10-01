import type { CallScope, LedgerSink, LlmCallRecord } from '@cs/core';
import type { ChatMessage, ChatProvider, ChatResult, JsonSchemaFormat } from './chat';
import type { AiConfig, ConfidenceThresholds, TaskConfig } from './config';
import { CascadingDecisionProvider, type DecisionResult } from './decisions/cascade';
import { createLlmDecisionProvider } from './decisions/llm';
import type { DecisionProvider, DecisionQuestion } from './decisions/types';
import type { EmbeddingProvider, EmbeddingResult } from './embeddings';

/** Records a ledger row without letting a ledger-write failure mask the caller's real result/error. */
async function safeRecord(ledger: LedgerSink, record: LlmCallRecord): Promise<void> {
  try {
    await ledger.recordLlmCall(record);
  } catch (err) {
    console.error('[ai] ledger write failed', err);
  }
}

export const EMBED_BATCH = 64;
export const EMBED_MAX_CHARS = 8000;

export interface Ai {
  chat(task: string, input: { messages: ChatMessage[]; jsonSchema?: JsonSchemaFormat }, scope: CallScope): Promise<ChatResult>;
  decide<K extends string>(task: string, state: unknown, questions: Record<K, DecisionQuestion>, scope: CallScope): Promise<DecisionResult<K>>;
  embed(task: string, texts: string[], scope: CallScope): Promise<EmbeddingResult>;
}

export interface AiDeps {
  openrouter: ChatProvider;
  /** Builds the Jev provider for a task's configured model (spec §7.2: models are configured per task). */
  jev: ((model: string) => DecisionProvider) | null;
  embeddings?: EmbeddingProvider;
  ledger: LedgerSink;
  now?: () => number;
}

export function createAi(config: AiConfig, deps: AiDeps): Ai {
  const now = deps.now ?? Date.now;

  function task(name: string): TaskConfig {
    const t = config.tasks[name];
    if (!t) throw new Error(`Unknown AI task: ${name}`);
    return t;
  }

  function recording(provider: DecisionProvider, taskName: string, scope: CallScope, fallbackModel: string): DecisionProvider {
    return {
      id: provider.id,
      async decide(state, questions) {
        const started = now();
        let call;
        try {
          call = await provider.decide(state, questions);
        } catch (err) {
          await safeRecord(deps.ledger, {
            ...scope, task: taskName, provider: provider.id, model: fallbackModel,
            inputTokens: 0, outputTokens: 0, costUsd: null, latencyMs: now() - started, ok: false,
          });
          throw err;
        }
        await safeRecord(deps.ledger, {
          ...scope, task: taskName, provider: provider.id, model: call.model,
          inputTokens: call.inputTokens, outputTokens: call.outputTokens, costUsd: call.costUsd,
          latencyMs: now() - started, ok: true,
        });
        return call;
      },
    };
  }

  function llmDecisions(name: string, scope: CallScope): DecisionProvider {
    const t = task(name);
    if (t.provider !== 'openrouter' || t.mode !== 'decisions') throw new Error(`Task ${name} is not a decision task`);
    return recording(createLlmDecisionProvider(deps.openrouter, { model: t.model, fallbacks: t.fallbacks }), name, scope, t.model);
  }

  return {
    async chat(name, input, scope) {
      const t = task(name);
      if (t.provider !== 'openrouter' || t.mode !== 'chat') throw new Error(`Task ${name} is not a chat task`);
      const started = now();
      let result;
      try {
        result = await deps.openrouter.complete({
          ...input, model: t.model, fallbacks: t.fallbacks, temperature: t.temperature, maxTokens: t.max_tokens,
        });
      } catch (err) {
        await safeRecord(deps.ledger, {
          ...scope, task: name, provider: deps.openrouter.id, model: t.model,
          inputTokens: 0, outputTokens: 0, costUsd: null, latencyMs: now() - started, ok: false,
        });
        throw err;
      }
      await safeRecord(deps.ledger, {
        ...scope, task: name, provider: deps.openrouter.id, model: result.model,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd,
        latencyMs: now() - started, ok: true,
      });
      return result;
    },

    async decide(name, state, questions, scope) {
      const t = task(name);
      let primary: DecisionProvider;
      let fallback: DecisionProvider | null = null;
      let thresholds: ConfidenceThresholds = { default: 0 };

      if (t.provider === 'jev') {
        thresholds = t.min_confidence;
        const escalation = t.escalate_to ? llmDecisions(t.escalate_to, scope) : null;
        if (deps.jev) {
          primary = recording(deps.jev(t.model), name, scope, t.model);
          fallback = escalation;
        } else if (escalation) {
          primary = escalation;
        } else {
          throw new Error(`Task ${name} needs Jev but TYPESAFE_API_KEY is not configured`);
        }
      } else {
        primary = llmDecisions(name, scope);
      }
      return new CascadingDecisionProvider(primary, fallback, thresholds).decide(state, questions);
    },

    async embed(name, texts, scope) {
      const t = task(name);
      if (t.provider !== 'openrouter' || t.mode !== 'embeddings') throw new Error(`Task ${name} is not an embeddings task`);
      if (!deps.embeddings) throw new Error(`Task ${name} needs an embeddings provider`);
      if (texts.length === 0) return { vectors: [], model: t.model, inputTokens: 0, costUsd: 0 };
      const vectors: number[][] = [];
      let inputTokens = 0;
      let costUsd: number | null = 0;
      let model = t.model;
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const input = texts.slice(i, i + EMBED_BATCH).map((s) => s.slice(0, EMBED_MAX_CHARS));
        const started = now();
        let r: EmbeddingResult;
        try {
          r = await deps.embeddings.embed({ model: t.model, input, dimensions: t.dimensions });
        } catch (err) {
          await safeRecord(deps.ledger, {
            ...scope, task: name, provider: deps.embeddings.id, model: t.model,
            inputTokens: 0, outputTokens: 0, costUsd: null, latencyMs: now() - started, ok: false,
          });
          throw err;
        }
        await safeRecord(deps.ledger, {
          ...scope, task: name, provider: deps.embeddings.id, model: r.model,
          inputTokens: r.inputTokens, outputTokens: 0, costUsd: r.costUsd, latencyMs: now() - started, ok: true,
        });
        vectors.push(...r.vectors);
        inputTokens += r.inputTokens;
        costUsd = costUsd === null || r.costUsd === null ? null : costUsd + r.costUsd;
        model = r.model;
      }
      return { vectors, model, inputTokens, costUsd };
    },
  };
}
