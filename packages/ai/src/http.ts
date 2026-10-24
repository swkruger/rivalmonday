import type { CallTiming } from './config';

export class AiProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | null,
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AiProviderError';
  }
}

export interface HttpDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  maxRetries: number;
  baseDelayMs: number;
  timeoutMs: number;
}

export const defaultHttpDeps: HttpDeps = {
  fetch: (input, init) => globalThis.fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries: 2,
  baseDelayMs: 500,
  timeoutMs: 60_000,
};

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export async function postJson(
  provider: string,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  deps: HttpDeps,
  timing?: CallTiming,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeoutMs = timing?.timeoutMs ?? deps.timeoutMs;
  const maxRetries = timing ? timing.maxAttempts - 1 : deps.maxRetries;
  const aborted = (cause?: unknown) => new AiProviderError(provider, null, `${provider} call aborted`, false, cause === undefined ? undefined : { cause });
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < maxRetries;
    let res: Response;
    const s = signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs);
    try {
      res = await deps.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: s,
      });
    } catch (err) {
      if (signal?.aborted) throw aborted(err);
      if (canRetry) {
        await deps.sleep(deps.baseDelayMs * 2 ** attempt);
        continue;
      }
      throw new AiProviderError(provider, null, `Network error calling ${provider}`, true, { cause: err });
    }
    if (res.ok) {
      try {
        return await res.json();
      } catch (err) {
        if (signal?.aborted) throw aborted(err);
        throw new AiProviderError(provider, res.status, `${provider} returned invalid JSON`, false, { cause: err });
      }
    }

    const retryable = RETRYABLE_STATUS.has(res.status);
    if (retryable && canRetry) {
      if (signal?.aborted) throw aborted();
      await deps.sleep(deps.baseDelayMs * 2 ** attempt);
      continue;
    }
    const text = await res.text().catch(() => '');
    throw new AiProviderError(provider, res.status, `${provider} returned ${res.status}: ${text.slice(0, 500)}`, retryable);
  }
}
