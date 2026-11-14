import type { AiDecisionMode, AiGuard, CallScope, DecisionSampleSink, LedgerSink, LlmCallRecord } from '@cs/core';
import type { BatchItemResult, BatchProvider, BatchRequest } from './anthropic-batch';
import type { ChatMessage, ChatProvider, ChatResult, ChatTool, JsonSchemaFormat } from './chat';
import { type AiConfig, type CallTiming, type ConfidenceThresholds, type TaskConfig, timingOf } from './config';
import { CascadingDecisionProvider, type DecisionResult } from './decisions/cascade';
import { createLlmDecisionProvider } from './decisions/llm';
import type { DecideOptions, DecisionProvider, DecisionQuestion } from './decisions/types';
import type { EmbeddingProvider, EmbeddingResult } from './embeddings';

/** Records a ledger row without letting a ledger-write failure mask the caller's real result/error. */
async function safeRecord(ledger: LedgerSink, record: LlmCallRecord): Promise<void> {
  try {
    await ledger.recordLlmCall(record);
  } catch (err) {
    console.error('[ai] ledger write failed', err);
  }
}

/** Phase 18e: most re-evaluation shadow LLM calls (ledgered `<task>:reeval`) per UTC day. */
export const REEVAL_DAILY_CALL_CAP = 2000;

export const EMBED_BATCH = 64;
export const EMBED_MAX_CHARS = 8000;

export interface Ai {
  chat(task: string, input: { messages: ChatMessage[]; jsonSchema?: JsonSchemaFormat }, scope: CallScope): Promise<ChatResult>;
  chatWithTools(task: string, req: { messages: ChatMessage[]; tools: ChatTool[]; toolChoice?: 'auto' | 'none'; signal?: AbortSignal }, scope: CallScope): Promise<ChatResult>;
  decide<K extends string>(task: string, state: unknown, questions: Record<K, DecisionQuestion>, scope: CallScope, opts?: DecideOptions): Promise<DecisionResult<K>>;
  embed(task: string, texts: string[], scope: CallScope): Promise<EmbeddingResult>;
  batchAvailable(task: string): boolean;
  submitBatch(task: string, requests: BatchRequest[], scope: CallScope): Promise<string>;
  collectBatch(task: string, batchId: string, scope: CallScope, scopeFor?: (customId: string) => Partial<CallScope>): Promise<{ status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] }>;
}

export interface DecisionModeSource {
  read(): Promise<AiDecisionMode>;
  /** Today's (UTC) `%:reeval` ledger rows, including calls this process already started. */
  reevalCallsToday(): Promise<number>;
  /** Called once per re-eval shadow call so a process cannot exceed the cap inside its count cache. */
  noteReevalCall?(): void;
}

export interface AiDeps {
  openrouter: ChatProvider;
  /** Builds the Jev provider for a task's configured model (spec §7.2: models are configured per task). */
  jev: ((model: string, timing?: CallTiming) => DecisionProvider) | null;
  embeddings?: EmbeddingProvider;
  ledger: LedgerSink;
  now?: () => number;
  /** Where shadow samples and still-needs-review decisions are kept (spec §7.3). Without it nothing is sampled. */
  samples?: DecisionSampleSink;
  /** Uniform [0, 1) source for shadow sampling (tests inject a fixed value). */
  random?: () => number;
  /** Replaces every task's shadow_rate (AI_SHADOW_RATE, for a measurement run). */
  shadowRateOverride?: number;
  /** Anthropic Message Batches; null/absent when ANTHROPIC_API_KEY is not set (batch tasks are then unavailable). */
  batch?: BatchProvider | null;
  /**
   * Phase 7b1: asked before every provider call (chat, decisions incl. Jev, each embedding chunk, batch submit; never batch
   * collect); throws `AiPausedError` while the platform or the scope's client is spend-paused. A refused call writes no
   * ledger row. Absent in worker CLIs (`*-once`).
   */
  guard?: AiGuard;
  /**
   * Phase 18e: the platform's `ai_decision_mode` (cached reader, fails to cascade) bundled with today's re-eval call count.
   * Absent = cascade. `jev_only` stops below-threshold escalation of Jev-primary tasks (not the injection/image guards); a
   * future `reevalUntil` also shadows every call while `reevalCallsToday()` is under `REEVAL_DAILY_CALL_CAP`.
   */
  decisionMode?: DecisionModeSource;
}

/** The injection gate and the ad-image guard (person images never stored) always cascade, whatever the platform mode. */
const ALWAYS_CASCADE_TASKS: ReadonlySet<string> = new Set(['ask_guard_decisions', 'ad_image_decisions']);

const CASCADE_MODE: AiDecisionMode = { mode: 'cascade', reevalUntil: null };

export function createAi(config: AiConfig, deps: AiDeps): Ai {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  /** Best-effort: a failed sample write is logged and never changes the decision. */
  async function keepSample<K extends string>(
    name: string, scope: CallScope, state: unknown, questions: Record<K, DecisionQuestion>, result: DecisionResult<K>, shadowKind: 'shadow' | 'reeval' | null,
  ): Promise<DecisionResult<K>> {
    if (!deps.samples || (!shadowKind && result.needsReview.length === 0)) return result;
    try {
      const sampleId = await deps.samples.recordDecisionSample({
        ...scope, task: name, reason: shadowKind ?? 'review', state, questions,
        primary: result.trace?.primary ?? null, fallback: result.trace?.fallback ?? null, final: result.answers, needsReview: result.needsReview,
      });
      return { ...result, sampleId };
    } catch (err) {
      console.error('[ai] decision sample write failed', err);
      return { ...result, sampleId: null };
    }
  }

  /** A failed mode read means cascade (today's behaviour). */
  async function readMode(): Promise<AiDecisionMode> {
    try {
      return await deps.decisionMode!.read();
    } catch {
      return CASCADE_MODE;
    }
  }

  /** Re-evaluation window open (a future `reevalUntil`) and today's reeval calls under the cap. */
  async function reevalOpen(mode: AiDecisionMode): Promise<boolean> {
    if (!deps.decisionMode?.reevalCallsToday || !mode.reevalUntil || !(Date.parse(mode.reevalUntil) > now())) return false;
    try {
      if ((await deps.decisionMode.reevalCallsToday()) >= REEVAL_DAILY_CALL_CAP) return false;
      deps.decisionMode.noteReevalCall?.();
      return true;
    } catch {
      return false;
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
      async decide(state, questions, decideOpts) {
        await deps.guard?.assertAllowed(scope);
        const started = now();
        let call;
        try {
          call = await provider.decide(state, questions, decideOpts);
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

  /** `timing` overrides the decision task's own (a Jev task's escalation runs on the calling task's timing). */
  function llmDecisions(name: string, scope: CallScope, ledgerTask = name, timing?: CallTiming): DecisionProvider {
    const t = task(name);
    if (t.provider !== 'openrouter' || t.mode !== 'decisions') throw new Error(`Task ${name} is not a decision task`);
    return recording(createLlmDecisionProvider(deps.openrouter, { model: t.model, fallbacks: t.fallbacks, timing: timing ?? timingOf(t) }), ledgerTask, scope, t.model);
  }

  async function runChat(
    name: string,
    input: { messages: ChatMessage[]; jsonSchema?: JsonSchemaFormat; tools?: ChatTool[]; toolChoice?: 'auto' | 'none'; signal?: AbortSignal },
    scope: CallScope,
  ): Promise<ChatResult> {
    const t = task(name);
    if (t.provider !== 'openrouter' || t.mode !== 'chat') throw new Error(`Task ${name} is not a chat task`);
    if (!t.images && input.messages.some((m) => m.role === 'user' && typeof m.content !== 'string' && m.content.some((p) => p.type === 'image'))) {
      throw new Error(`Task ${name} does not accept images`);
    }
    await deps.guard?.assertAllowed(scope);
    const started = now();
    let result;
    try {
      result = await deps.openrouter.complete({
        ...input, model: t.model, fallbacks: t.fallbacks, temperature: t.temperature, maxTokens: t.max_tokens, timing: timingOf(t),
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
  }

  return {
    chat: (name, input, scope) => runChat(name, input, scope),

    chatWithTools: (name, req, scope) => runChat(name, req, scope),

    async decide(name, state, questions, scope, opts) {
      const t = task(name);
      const hasImages = Boolean(opts?.images?.length);
      if (hasImages) {
        const escalation = t.provider === 'jev' && t.escalate_to ? config.tasks[t.escalate_to] : undefined;
        const accepts = (x: TaskConfig | undefined) => x !== undefined && x.provider !== 'anthropic' && x.images;
        if (!accepts(t) || (t.provider === 'jev' && t.escalate_to && !accepts(escalation))) throw new Error(`Task ${name} does not accept images`);
      }
      let primary: DecisionProvider;
      let fallback: DecisionProvider | null = null;
      let thresholds: ConfidenceThresholds = { default: 0 };
      let rate = 0;

      if (t.provider === 'jev') {
        thresholds = t.min_confidence;
        rate = deps.shadowRateOverride ?? t.shadow_rate;
        const mode = deps.jev && deps.decisionMode && !ALWAYS_CASCADE_TASKS.has(name) ? await readMode() : CASCADE_MODE;
        const jevOnly = mode.mode === 'jev_only';
        const sampled = !jevOnly && !hasImages && deps.samples !== undefined && deps.jev !== null && t.escalate_to !== undefined && rate > 0 && random() < rate;
        const reeval = !hasImages && deps.samples !== undefined && deps.jev !== null && t.escalate_to !== undefined && !ALWAYS_CASCADE_TASKS.has(name) && (await reevalOpen(mode));
        const shadow = sampled || reeval;
        const shadowKind = reeval ? 'reeval' : sampled ? 'shadow' : null;
        const suffix = reeval ? 'reeval' : sampled ? 'shadow' : jevOnly ? 'jev_down' : null;
        const escalation = t.escalate_to ? llmDecisions(t.escalate_to, scope, reeval ? `${name}:reeval` : suffix ? `${t.escalate_to}:${suffix}` : t.escalate_to, timingOf(t)) : null;
        if (deps.jev) {
          primary = recording(deps.jev(t.model, timingOf(t)), name, scope, t.model);
          fallback = escalation;
        } else if (escalation) {
          primary = escalation;
        } else {
          throw new Error(`Task ${name} needs Jev but OPENROUTER_API_KEY is not configured`);
        }
        const result = await new CascadingDecisionProvider(primary, fallback, thresholds, { escalateLowConfidence: !jevOnly }).decide(state, questions, { shadow, images: opts?.images });
        return hasImages ? result : keepSample(name, scope, state, questions, result, shadowKind);
      }
      primary = llmDecisions(name, scope);
      const result = await new CascadingDecisionProvider(primary, null, thresholds).decide(state, questions, { images: opts?.images });
      return hasImages ? result : keepSample(name, scope, state, questions, result, null);
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
        await deps.guard?.assertAllowed(scope);
        const input = texts.slice(i, i + EMBED_BATCH).map((s) => s.slice(0, EMBED_MAX_CHARS));
        const started = now();
        let r: EmbeddingResult;
        try {
          r = await deps.embeddings.embed({ model: t.model, input, dimensions: t.dimensions, timing: timingOf(t) });
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

    batchAvailable(name) {
      const t = config.tasks[name];
      return t?.provider === 'anthropic' && Boolean(deps.batch);
    },

    async submitBatch(name, requests, scope) {
      const t = task(name);
      if (t.provider !== 'anthropic') throw new Error(`Task ${name} is not a batch task`);
      if (!deps.batch) throw new Error(`Task ${name} needs ANTHROPIC_API_KEY`);
      await deps.guard?.assertAllowed(scope);
      return deps.batch.submit({ model: t.model, maxTokens: t.max_tokens, requests });
    },

    /** Usage is ledgered when results are collected (one row per request), at the task's batch prices. */
    async collectBatch(name, batchId, scope, scopeFor) {
      const t = task(name);
      if (t.provider !== 'anthropic') throw new Error(`Task ${name} is not a batch task`);
      if (!deps.batch) throw new Error(`Task ${name} needs ANTHROPIC_API_KEY`);
      if ((await deps.batch.status(batchId)) !== 'ended') return { status: 'in_progress' };
      const results = await deps.batch.results(batchId);
      for (const r of results) {
        await safeRecord(deps.ledger, r.ok
          ? { ...scope, ...scopeFor?.(r.customId), task: name, provider: deps.batch.id, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
              costUsd: (r.inputTokens * t.input_usd_per_mtok + r.outputTokens * t.output_usd_per_mtok) / 1_000_000, latencyMs: 0, ok: true }
          : { ...scope, ...scopeFor?.(r.customId), task: name, provider: deps.batch.id, model: t.model, inputTokens: 0, outputTokens: 0, costUsd: null, latencyMs: 0, ok: false });
      }
      return { status: 'ended', results };
    },
  };
}
