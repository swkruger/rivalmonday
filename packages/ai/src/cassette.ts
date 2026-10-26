import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';
import type { Ai } from './ai';
import type { AiConfig } from './config';

/** `fill`: replay stored replies, call live only on misses (or extra calls of a key), save like `record`. */
export type CassetteMode = 'record' | 'replay' | 'fill';
export interface CassetteOptions {
  mode: CassetteMode;
  file: string;
  config: AiConfig;
  now?: () => Date;
}
type Kind = 'chat' | 'chatWithTools' | 'decide' | 'embed';

export class CassetteMissError extends Error {
  readonly key: string;
  readonly task: string;
  constructor(task: string, key: string, file: string) {
    const suite = basename(file, extname(file));
    super(`No recorded reply for ${task} (${key.slice(0, 8)}) in ${file}. Re-record: pnpm --filter @cs/evals eval record --suite ${suite}`);
    this.name = 'CassetteMissError';
    this.key = key;
    this.task = task;
  }
}

export type CassetteAi = Ai & { flush(): void; stats(): { hits: number; misses: number; recorded: number } };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO = /\b(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;
const DAY = 86_400_000;

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** Per-request map: real id -> <idN> by first appearance; dates -> <day±N> relative to `today` (UTC). */
export function normalize(text: string, ids: Map<string, string>, today: Date): string {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return text
    .replace(UUID, (m) => { const k = m.toLowerCase(); let tok = ids.get(k); if (!tok) { tok = `<id${ids.size + 1}>`; ids.set(k, tok); } return tok; })
    .replace(ISO, (_m, d: string) => { const n = Math.round((Date.parse(`${d}T00:00:00Z`) - t0) / DAY); return `<day${n >= 0 ? '+' : ''}${n}>`; });
}

export function denormalize(text: string, ids: Map<string, string>, today: Date): string {
  const back = new Map([...ids].map(([real, tok]) => [tok, real]));
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return text.replace(/<id\d+>/g, (tok) => back.get(tok) ?? tok)
    .replace(/<day([+-]\d+)>/g, (_m, n: string) => new Date(t0 + Number(n) * DAY).toISOString().slice(0, 10));
}

export function taskSignature(config: AiConfig, task: string): string {
  const t = config.tasks[task];
  if (!t) throw new Error(`Unknown AI task: ${task}`);
  const esc = 'escalate_to' in t && t.escalate_to ? config.tasks[t.escalate_to] : undefined;
  return canonicalJson({ t, esc });
}

export function cassetteKey(config: AiConfig, task: string, kind: Kind, normalizedRequest: string): string {
  return createHash('sha256').update(canonicalJson({ v: 1, task, sig: taskSignature(config, task), kind, req: normalizedRequest })).digest('hex');
}

interface Entry { task: string; kind: Kind; responses: unknown[] }

function load(file: string): Record<string, Entry> {
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: number; entries?: Record<string, Entry> };
  return parsed.entries ?? {};
}

/** Replay (inner may be null), record or fill (inner required) model replies. Batches are unsupported; `scope` is not part of the key. */
export function createCassetteAi(inner: Ai | null, opts: CassetteOptions): CassetteAi {
  const now = opts.now ?? (() => new Date());
  const recording = opts.mode === 'record';
  const filling = opts.mode === 'fill';
  if ((recording || filling) && !inner) throw new Error(`Cassette ${opts.mode} mode needs a live Ai`);
  const stored = recording ? {} : load(opts.file);
  const touched = new Map<string, Entry>(); // entries hit this run
  const used = new Map<string, number>(); // key -> replies consumed this run
  const counts = { hits: 0, misses: 0, recorded: 0 };

  async function through<T>(task: string, kind: Kind, request: unknown, call: () => Promise<T>, clean: (r: T) => T = (r) => r): Promise<T> {
    const today = now();
    const ids = new Map<string, string>();
    const key = cassetteKey(opts.config, task, kind, normalize(canonicalJson(request), ids, today));
    if (filling) {
      // Fill keeps exactly the replies consumed this run, in call order: unused stored replies and entries are pruned.
      const n = used.get(key) ?? 0;
      used.set(key, n + 1);
      const prior = stored[key]?.responses;
      if (prior && n < prior.length) {
        let entry = touched.get(key);
        if (!entry) { entry = { task, kind, responses: [] }; touched.set(key, entry); }
        entry.responses.push(prior[n]);
        counts.hits++;
        return JSON.parse(denormalize(JSON.stringify(prior[n]), ids, today)) as T;
      }
    }
    if (recording || filling) {
      const response = clean(await call());
      let entry = touched.get(key);
      if (!entry) { entry = { task, kind, responses: [] }; touched.set(key, entry); }
      entry.responses.push(JSON.parse(normalize(JSON.stringify(response), ids, today)));
      counts.recorded++;
      return response;
    }
    const entry = stored[key];
    if (!entry || entry.responses.length === 0) {
      counts.misses++;
      throw new CassetteMissError(task, key, opts.file);
    }
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    touched.set(key, entry);
    counts.hits++;
    const reply = entry.responses[Math.min(n, entry.responses.length - 1)];
    return JSON.parse(denormalize(JSON.stringify(reply), ids, today)) as T;
  }

  const live = (): Ai => inner as Ai;
  return {
    chat: (task, input, scope) =>
      through(task, 'chat', { messages: input.messages, jsonSchema: input.jsonSchema }, () => live().chat(task, input, scope)),
    chatWithTools: (task, req, scope) =>
      through(task, 'chatWithTools', { messages: req.messages, tools: req.tools, toolChoice: req.toolChoice }, () => live().chatWithTools(task, req, scope)),
    decide: (task, state, questions, scope) =>
      through(task, 'decide', { state, questions }, () => live().decide(task, state, questions, scope), (r) => {
        const { sampleId: _drop, ...rest } = r as unknown as Record<string, unknown>;
        return rest as unknown as typeof r;
      }),
    embed: (task, texts, scope) => through(task, 'embed', { texts }, () => live().embed(task, texts, scope)),
    batchAvailable: () => false,
    submitBatch: async () => { throw new Error('Cassette AI does not support batches'); },
    collectBatch: async () => { throw new Error('Cassette AI does not support batches'); },
    flush() {
      if (!recording && !filling) return;
      const entries: Record<string, Entry> = {};
      for (const k of [...touched.keys()].sort()) entries[k] = touched.get(k)!;
      mkdirSync(dirname(opts.file), { recursive: true });
      writeFileSync(opts.file, `${JSON.stringify({ version: 1, entries }, null, 1)}\n`, 'utf8');
    },
    stats: () => ({ ...counts }),
  };
}
