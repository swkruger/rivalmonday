import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Ai, type AiConfig, createAi, type ChatProvider, type ChatRequest, type ChatResult, type DecisionAnswer, type DecisionProvider, type DecisionQuestion,
  type EmbeddingProvider,
} from '@cs/ai';
import type { AiGuard, CallScope, LedgerSink } from '@cs/core';
import { z } from 'zod';

/**
 * Phase 7c2 rehearsal AI (spec §4): a $0, task-aware stand-in for OpenRouter/Jev used for every client outside the live
 * slice. It still runs through `createAi`, so the guard, ledger rows (provider `rehearsal`, cost 0) and task routing are the
 * real ones; only the provider answers are made up, and they sleep for a latency sampled from the task's measured percentiles.
 */

export interface LatencyPercentiles { p50: number; p90: number; p99: number }
export type RehearsalLatency = Record<string, LatencyPercentiles>;

export const REHEARSAL_PROVIDER = 'rehearsal';
export const DEFAULT_REHEARSAL_LATENCY: LatencyPercentiles = { p50: 800, p90: 2500, p99: 6000 };
export const REHEARSAL_LATENCY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'rehearsal-latency.json');
const REHEARSAL_CONFIDENCE = 0.95;
const DEFAULT_DIMENSIONS = 512;

const percentilesSchema = z.object({ p50: z.number().nonnegative(), p90: z.number().nonnegative(), p99: z.number().nonnegative() })
  .refine((p) => p.p50 <= p.p90 && p.p90 <= p.p99, 'percentiles must be ordered p50 <= p90 <= p99');
const latencySchema = z.record(z.string(), percentilesSchema);

/** Per-task latency percentiles (Task 10b's `latency` tool rewrites the file from measured ledger rows). */
export async function loadRehearsalLatency(path = REHEARSAL_LATENCY_PATH): Promise<RehearsalLatency> {
  return latencySchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

/**
 * Piecewise-linear over (0, p50), (0.9, p90), (0.99, p99), (1, p99): every sample lies within p50–p99 and the p90/p99
 * quantiles match the measured ones (the bottom half is pulled up to p50 — a slight pessimism for the rehearsal).
 */
export function sampleLatency(p: LatencyPercentiles, random: () => number): number {
  const u = Math.min(Math.max(random(), 0), 1);
  const knots: [number, number][] = [[0, p.p50], [0.9, p.p90], [0.99, p.p99], [1, p.p99]];
  for (let i = 1; i < knots.length; i++) {
    const [u0, v0] = knots[i - 1]!;
    const [u1, v1] = knots[i]!;
    if (u <= u1) return v0 + ((u - u0) / (u1 - u0)) * (v1 - v0);
  }
  return p.p99;
}

/** Same bag-of-words approach as the tests' `fakeEmbedding`: deterministic, digits ignored, unit length. */
export function rehearsalEmbedding(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const v = new Array<number>(dimensions).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % dimensions]! += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

type Schema = Record<string, unknown>;

/** The smallest value satisfying a JSON schema of the shapes our writers send (object/array/string/number/enum/null). */
export function minimalValue(schema: Schema): unknown {
  if ('const' in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const anyOf = (schema.anyOf ?? schema.oneOf) as Schema[] | undefined;
  if (Array.isArray(anyOf) && anyOf.length > 0) return minimalValue(anyOf[0]!);
  const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string | undefined];
  const type = types.includes('null') ? 'null' : types[0];
  switch (type) {
    case 'null':
      return null;
    case 'boolean':
      return false;
    case 'integer':
    case 'number': {
      const min = typeof schema.minimum === 'number' ? schema.minimum : typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum + 1 : 0;
      const max = typeof schema.maximum === 'number' ? schema.maximum : Infinity;
      const n = Math.min(Math.max(min, 0), max);
      return type === 'integer' ? Math.ceil(n) : n;
    }
    case 'string': {
      const min = typeof schema.minLength === 'number' ? schema.minLength : 1;
      const max = typeof schema.maxLength === 'number' ? schema.maxLength : Infinity;
      return 'Rehearsal'.padEnd(min, '.').slice(0, max);
    }
    case 'array': {
      const n = typeof schema.minItems === 'number' ? schema.minItems : 0;
      return Array.from({ length: n }, () => minimalValue((schema.items as Schema | undefined) ?? {}));
    }
    case 'object':
    default: {
      const props = (schema.properties ?? {}) as Record<string, Schema>;
      const required = (schema.required ?? []) as string[];
      return Object.fromEntries(required.map((k) => [k, minimalValue(props[k] ?? {})]));
    }
  }
}

const SUPPORTED = /^(yes|true|supported|meaningful|relevant|match)$/i;
const pickChoice = (keys: string[]) => keys.find((k) => SUPPORTED.test(k)) ?? keys[0]!;
const NOUL_TRUE = 0.5 + REHEARSAL_CONFIDENCE / 2;

function answer(q: DecisionQuestion): DecisionAnswer {
  switch (q.type) {
    case 'noul':
      return { type: 'noul', value: true, probability: NOUL_TRUE, confidence: REHEARSAL_CONFIDENCE };
    case 'choice': {
      const value = pickChoice(Object.keys(q.options));
      return { type: 'choice', value, probabilities: { [value]: REHEARSAL_CONFIDENCE }, confidence: REHEARSAL_CONFIDENCE };
    }
    case 'score': {
      const value = q.levels.length - 1;
      return { type: 'score', value, probabilities: { [String(value)]: REHEARSAL_CONFIDENCE }, confidence: REHEARSAL_CONFIDENCE };
    }
  }
}

/** The LLM decision provider's `decisions` schema: each property is a choice, level or probability object. */
function decisionsJson(schema: Schema): Record<string, unknown> {
  const props = (schema.properties ?? {}) as Record<string, Schema>;
  return Object.fromEntries(Object.entries(props).map(([key, s]) => {
    const p = (s.properties ?? {}) as Record<string, Schema>;
    if (p.probability) return [key, { probability: NOUL_TRUE }];
    if (p.choice) return [key, { choice: pickChoice((p.choice.enum ?? []) as string[]), confidence: REHEARSAL_CONFIDENCE }];
    return [key, { level: typeof p.level?.maximum === 'number' ? p.level.maximum : 0, confidence: REHEARSAL_CONFIDENCE }];
  }));
}

const CANDIDATE = /<candidate id="(C\d+)">\n([\s\S]*?)\n<evidence>\n([\s\S]*?)\n<\/evidence>\n<\/candidate>/g;
const hasWord = (text: string, word: string) => new RegExp(`(^|[^A-Za-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(text);
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * brief_writer: one item per candidate in the prompt. Facts are copied from that candidate's own evidence (never the
 * move's "Detected pattern" context line), so `verifyDraft`'s number/date/name rules keep the item; everything else
 * carries no numbers, places or names.
 */
export function rehearsalBriefDraft(prompt: string): { summary: string; items: Record<string, string>[] } {
  const items: Record<string, string>[] = [];
  for (const m of prompt.matchAll(CANDIDATE)) {
    const [, ref, head, context] = m;
    const evidence = context!.split('\n').filter((l) => !l.startsWith('Detected pattern:')).join('\n');
    const name = /^Competitor: (.+)$/m.exec(head!)?.[1]?.trim() ?? '';
    const subject = name && hasWord(evidence, name) ? name : 'A competitor';
    const event = /^Event: (.+)$/m.exec(evidence)?.[1];
    items.push({
      ref: ref!,
      headline: `${subject} made a change worth a look.`,
      what_changed: [event ? sentence(event) : null, 'The change shows on a public channel.'].filter(Boolean).join(' '),
      why_it_matters: 'This may affect how customers compare your business with theirs.',
      recommended_action: 'Review this change and decide whether to respond.',
      effort: 'L', impact: 'M', upsell_tag: 'none',
    });
    if (items.length === 10) break;
  }
  return { summary: items.length > 0 ? 'Competitors made changes worth a look.' : '', items };
}

const tokens = (text: string) => Math.ceil(text.length / 4);

function chatAnswer(task: string, req: ChatRequest): string {
  if (req.jsonSchema?.name === 'decisions') return JSON.stringify(decisionsJson(req.jsonSchema.schema));
  // The weekly draft only: brief_writer also writes the starting point's `starting_point_why` (minimal object below).
  if (task === 'brief_writer' && req.jsonSchema?.name === 'weekly_brief') {
    const user = req.messages.findLast((m) => m.role === 'user');
    return JSON.stringify(rehearsalBriefDraft(typeof user?.content === 'string' ? user.content : ''));
  }
  if (req.jsonSchema) return JSON.stringify(minimalValue(req.jsonSchema.schema));
  return 'This is a rehearsal answer.';
}

export function createRehearsalAi(o: {
  live: Ai;
  liveClientIds: ReadonlySet<string>;
  latency: Record<string, LatencyPercentiles>;
  config: AiConfig;
  ledger: LedgerSink;
  random?: () => number;
  /** The worker's spend guard, so rehearsal calls are guarded like live ones (7b1). */
  guard?: AiGuard;
  /** Tests replace the simulated provider latency. */
  sleep?: (ms: number) => Promise<void>;
}): Ai {
  const random = o.random ?? Math.random;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const wait = (task: string) => sleep(Math.round(sampleLatency(o.latency[task] ?? DEFAULT_REHEARSAL_LATENCY, random)));

  /** Providers bound to the calling task (createAi passes only the model), so answers and latency are per task. */
  function forTask(task: string): Ai {
    const openrouter: ChatProvider = {
      id: REHEARSAL_PROVIDER,
      async complete(req) {
        await wait(task);
        const text = chatAnswer(task, req);
        const input = req.messages.reduce((n, m) => n + tokens(typeof m.content === 'string' ? m.content : ''), 0);
        return { text, model: req.model, inputTokens: input, outputTokens: tokens(text), costUsd: 0, cachedTokens: 0, toolCalls: [], finishReason: 'stop' } satisfies ChatResult;
      },
    };
    const jev: DecisionProvider = {
      id: REHEARSAL_PROVIDER,
      async decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>) {
        await wait(task);
        const answers = Object.fromEntries(Object.entries<DecisionQuestion>(questions).map(([k, q]) => [k, answer(q)])) as Record<K, DecisionAnswer>;
        return { answers, model: 'rehearsal', inputTokens: tokens(JSON.stringify(state) ?? ''), outputTokens: 0, costUsd: 0 };
      },
    };
    const embeddings: EmbeddingProvider = {
      id: REHEARSAL_PROVIDER,
      async embed(req) {
        await wait(task);
        return { vectors: req.input.map((t) => rehearsalEmbedding(t, req.dimensions)), model: req.model, inputTokens: req.input.reduce((n, t) => n + tokens(t), 0), costUsd: 0 };
      },
    };
    return createAi(o.config, { openrouter, jev: () => jev, embeddings, ledger: o.ledger, batch: null, guard: o.guard, random });
  }

  const route = (scope: CallScope, task: string): Ai => (scope.clientId !== null && o.liveClientIds.has(scope.clientId) ? o.live : forTask(task));

  return {
    chat: (task, input, scope) => route(scope, task).chat(task, input, scope),
    chatWithTools: (task, req, scope) => route(scope, task).chatWithTools(task, req, scope),
    decide: (task, state, questions, scope) => route(scope, task).decide(task, state, questions, scope),
    embed: (task, texts, scope) => route(scope, task).embed(task, texts, scope),
    // No scope here: rehearsal never batches, so theme discovery takes its synchronous chat path.
    batchAvailable: () => false,
    submitBatch: (task, requests, scope) => route(scope, task).submitBatch(task, requests, scope),
    collectBatch: (task, batchId, scope, scopeFor) => route(scope, task).collectBatch(task, batchId, scope, scopeFor),
  };
}
