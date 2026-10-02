import type { CallScope, DecisionSampleSink, LedgerSink, LlmCallRecord } from '@cs/core';
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
  /** Where shadow samples and still-needs-review decisions are kept (spec §7.3). Without it nothing is sampled. */
  samples?: DecisionSampleSink;
  /** Uniform [0, 1) source for shadow sampling (tests inject a fixed value). */
  random?: () => number;
  /** Replaces every task's shadow_rate (AI_SHADOW_RATE, for a measurement run). */
  shadowRateOverride?: number;
}

export function createAi(config: AiConfig, deps: AiDeps): Ai {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  /** Best-effort: a failed sample write is logged and never changes the decision. */
  async function keepSample<K extends string>(
    name: string, scope: CallScope, state: unknown, questions: Record<K, DecisionQuestion>, result: DecisionResult<K>, sampled: boolean,
  ): Promise<DecisionResult<K>> {
    if (!deps.samples || (!sampled && result.needsReview.length === 0)) return result;
    try {
      const sampleId = await deps.samples.recordDecisionSample({
        ...scope, task: name, reason: sampled ? 'shadow' : 'review', state, questions,
        primary: result.trace?.primary ?? null, fallback: result.trace?.fallback ?? null, final: result.answers, needsReview: result.needsReview,
      });
      return { ...result, sampleId };
    } catch (err) {
      console.error('[ai] decision sample write failed', err);
      return { ...result, sampleId: null };
    }
  }

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

  function llmDecisions(name: string, scope: CallScope, ledgerTask = name): DecisionProvider {
    const t = task(name);
    if (t.provider !== 'openrouter' || t.mode !== 'decisions') throw new Error(`Task ${name} is not a decision task`);
    return recording(createLlmDecisionProvider(deps.openrouter, { model: t.model, fallbacks: t.fallbacks }), ledgerTask, scope, t.model);
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
      let rate = 0;

      if (t.provider === 'jev') {
        thresholds = t.min_confidence;
        rate = deps.shadowRateOverride ?? t.shadow_rate;
        const sampled = deps.samples !== undefined && deps.jev !== null && t.escalate_to !== undefined && rate > 0 && random() < rate;
        const escalation = t.escalate_to ? llmDecisions(t.escalate_to, scope, sampled ? `${t.escalate_to}:shadow` : t.escalate_to) : null;
        if (deps.jev) {
          primary = recording(deps.jev(t.model), name, scope, t.model);
          fallback = escalation;
        } else if (escalation) {
          primary = escalation;
        } else {
          throw new Error(`Task ${name} needs Jev but TYPESAFE_API_KEY is not configured`);
        }
        const result = await new CascadingDecisionProvider(primary, fallback, thresholds).decide(state, questions, { shadow: sampled });
        return keepSample(name, scope, state, questions, result, sampled);
      }
      primary = llmDecisions(name, scope);
      const result = await new CascadingDecisionProvider(primary, null, thresholds).decide(state, questions);
      return keepSample(name, scope, state, questions, result, false);
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
