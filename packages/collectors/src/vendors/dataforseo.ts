import type { CallScope, LedgerSink } from '@cs/core';
import { z } from 'zod';
import { safeRecordVendorCall, VendorError } from './errors';

export { VendorError } from './errors';

export const DFS_BASE_URL = 'https://api.dataforseo.com/v3';
export const DFS_SANDBOX_URL = 'https://sandbox.dataforseo.com/v3';
export const DFS_US = { location_code: 2840, language_code: 'en' } as const;

const taskSchema = z.looseObject({
  id: z.string(),
  status_code: z.number(),
  status_message: z.string(),
  result: z.array(z.unknown()).nullish(),
});
const envelopeSchema = z.looseObject({
  status_code: z.number(),
  status_message: z.string(),
  cost: z.number().nullish(),
  tasks: z.array(taskSchema).nullish(),
});

export interface DfsTask {
  id: string;
  statusCode: number;
  statusMessage: string;
  result: unknown[];
  /** The `tag` sent with the task, echoed back by DataForSEO (under `data`, or top-level). */
  tag?: string | null;
}

/** DataForSEO echoes the posted task under `data`; accept a top-level `tag` too. */
function taskTag(t: Record<string, unknown>): string | null {
  const data = t.data;
  const fromData = data && typeof data === 'object' ? (data as Record<string, unknown>).tag : undefined;
  if (typeof fromData === 'string' && fromData.length > 0) return fromData;
  return typeof t.tag === 'string' && t.tag.length > 0 ? t.tag : null;
}

/**
 * Pairs the tasks returned by a task_post with the batch items that were posted (each sent with
 * `tag: item.id`). A task is matched by its echoed tag, accepted only when that tag belongs to
 * this batch; only a task with no tag at all falls back to its array position. Each item is
 * matched at most once.
 */
export function pairPostedTasks<C extends { id: string }>(tasks: DfsTask[], batch: C[]): { t: DfsTask; c: C }[] {
  const byId = new Map(batch.map((c) => [c.id, c]));
  const used = new Set<string>();
  const out: { t: DfsTask; c: C }[] = [];
  tasks.forEach((t, idx) => {
    const c = t.tag ? byId.get(t.tag) : batch[idx];
    if (!c || used.has(c.id)) return;
    used.add(c.id);
    out.push({ t, c });
  });
  return out;
}

export interface DataForSeoClient {
  post(path: string, tasks: Record<string, unknown>[], scope: CallScope): Promise<DfsTask[]>;
  get(path: string, scope: CallScope): Promise<DfsTask[]>;
}

export interface DataForSeoOptions {
  login: string;
  password: string;
  baseUrl?: string;
  ledger: LedgerSink;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  now?: () => number;
  timeoutMs?: number;
}

export const isDfsOk = (code: number) => code >= 20000 && code < 30000;
/** Retryable DataForSEO API status codes: the 40202 rate limit, plus any 50xxx server error. */
export const isRetryableDfsCode = (code: number) => code === 40202 || (code >= 50000 && code < 60000);
const RETRY_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const TASK_ID_SUFFIX = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDataForSeo(opts: DataForSeoOptions): DataForSeoClient {
  const base = opts.baseUrl ?? DFS_BASE_URL;
  const doFetch = opts.fetch ?? ((i: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(i, init));
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? 2;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 130_000; // live endpoints may take up to 120 s
  const auth = `Basic ${Buffer.from(`${opts.login}:${opts.password}`).toString('base64')}`;

  async function call(method: 'POST' | 'GET', path: string, body: Record<string, unknown>[] | undefined, scope: CallScope): Promise<DfsTask[]> {
    const started = now();
    let ok = false;
    let cost: number | null = null;
    try {
      for (let attempt = 0; ; attempt++) {
        const canRetry = attempt < maxRetries;
        const backoff = () => sleep(1000 * 2 ** attempt);
        let res: Response;
        try {
          res = await doFetch(`${base}${path}`, {
            method,
            headers: { authorization: auth, 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          if (canRetry) { await backoff(); continue; }
          throw new VendorError('dataforseo', null, `Network error calling ${path}`, true, { cause: err });
        }
        if (!res.ok) {
          const retryable = RETRY_HTTP.has(res.status);
          if (retryable && canRetry) { await backoff(); continue; }
          // DataForSEO also sends its envelope on non-2xx responses (live-verified 2026-10-01: an
          // unverified account gets HTTP 403 with status_code 40104) — surface it in the message.
          const errEnv = envelopeSchema.safeParse(await res.json().catch(() => null));
          const detail = errEnv.success ? `: ${errEnv.data.status_code} ${errEnv.data.status_message}` : '';
          throw new VendorError('dataforseo', res.status, `HTTP ${res.status} from ${path}${detail}`, retryable);
        }
        const parsed = envelopeSchema.safeParse(await res.json().catch(() => null));
        if (!parsed.success) throw new VendorError('dataforseo', null, `Unexpected response from ${path}`, false, { cause: parsed.error });
        const env = parsed.data;
        cost = env.cost ?? null;
        if (!isDfsOk(env.status_code)) {
          const retryable = isRetryableDfsCode(env.status_code);
          if (retryable && canRetry) { await backoff(); continue; }
          throw new VendorError('dataforseo', env.status_code, env.status_message, retryable);
        }
        ok = true;
        return (env.tasks ?? []).map((t) => ({ id: t.id, statusCode: t.status_code, statusMessage: t.status_message, result: t.result ?? [], tag: taskTag(t) }));
      }
    } finally {
      await safeRecordVendorCall(opts.ledger, {
        ...scope, vendor: 'dataforseo', operation: path.replace(TASK_ID_SUFFIX, ''), units: body?.length ?? 1,
        costUsd: ok ? cost : null, latencyMs: now() - started, ok,
      });
    }
  }

  return { post: (path, tasks, scope) => call('POST', path, tasks, scope), get: (path, scope) => call('GET', path, undefined, scope) };
}
