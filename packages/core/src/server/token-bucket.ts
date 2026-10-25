/**
 * One in-process limiter for every vendor/AI call a process makes (7c2 decisions 3 and 7). A slot is held until response
 * headers arrive; the request timeout starts only after the slot is granted, so queueing never eats the vendor's budget.
 */
export type VendorKey = 'openrouter' | 'jev' | 'dataforseo' | 'apify' | 'scrapecreators' | 'stadia';
export interface VendorLimit { concurrent?: number; perSecond?: number }

export const DEFAULT_VENDOR_LIMITS: Record<VendorKey, VendorLimit> = {
  openrouter: { concurrent: 8 },
  jev: { concurrent: 8 },
  dataforseo: { perSecond: 10 },
  apify: { concurrent: 3 },
  scrapecreators: { perSecond: 5 },
  stadia: { perSecond: 5 },
};

export type TimedFetch = (input: string | URL | Request, init?: RequestInit & { timeoutMs?: number }) => Promise<Response>;

function withTimeout(init: RequestInit & { timeoutMs?: number } = {}): RequestInit {
  const { timeoutMs, ...rest } = init;
  const t = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
  const signal = t && rest.signal ? AbortSignal.any([rest.signal, t]) : (t ?? rest.signal ?? undefined);
  return { ...rest, signal };
}

/** A fetch that turns `timeoutMs` into an AbortSignal; no limiting. The default for web and tests. */
export function timedFetch(inner: typeof fetch = (i, init) => globalThis.fetch(i, init)): TimedFetch {
  return (input, init) => inner(input, withTimeout(init));
}

export interface VendorLimiter {
  acquire(vendor: VendorKey, signal?: AbortSignal): Promise<() => void>;
  limitedFetch(vendor: VendorKey, inner?: typeof fetch): TimedFetch;
}

interface Waiter { grant(): void; aborted: boolean }
interface State { tokens: number; at: number; inFlight: number; queue: Waiter[]; pumping: boolean }

const SLOW_WAIT_MS = 5_000;

export function createVendorLimiter(
  cfg: Partial<Record<VendorKey, VendorLimit>> = DEFAULT_VENDOR_LIMITS,
  clock = { now: Date.now, sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) },
  /** Called when a request waited > 5 s for its slot (vendor + ms only, never a URL). */
  onSlowWait?: (vendor: VendorKey, waitedMs: number) => void,
): VendorLimiter {
  const states = new Map<VendorKey, State>();
  const st = (v: VendorKey) => {
    let s = states.get(v);
    if (!s) states.set(v, (s = { tokens: cfg[v]?.perSecond ?? 0, at: clock.now(), inFlight: 0, queue: [], pumping: false }));
    return s;
  };
  // Grants strictly in arrival order; one pump per vendor at a time. A release or a refill re-runs it.
  async function pump(v: VendorKey): Promise<void> {
    const s = st(v);
    if (s.pumping) return;
    s.pumping = true;
    try {
      while (s.queue.length > 0) {
        const head = s.queue[0]!;
        if (head.aborted) { s.queue.shift(); continue; }
        const { concurrent, perSecond } = cfg[v] ?? {};
        if (concurrent !== undefined && s.inFlight >= concurrent) return; // release() re-pumps
        if (perSecond !== undefined) {
          const now = clock.now();
          s.tokens = Math.min(perSecond, s.tokens + ((now - s.at) / 1000) * perSecond);
          s.at = now;
          if (s.tokens < 1) { await clock.sleep(Math.ceil(((1 - s.tokens) / perSecond) * 1000)); continue; }
          s.tokens -= 1;
        }
        s.queue.shift();
        s.inFlight++;
        head.grant();
      }
    } finally { s.pumping = false; }
  }
  function acquire(v: VendorKey, signal?: AbortSignal): Promise<() => void> {
    if (!cfg[v]) return Promise.resolve(() => {});
    if (signal?.aborted) return Promise.reject(signal.reason);
    const s = st(v);
    const queuedAt = clock.now();
    return new Promise((resolve, reject) => {
      let released = false;
      const w: Waiter = {
        aborted: false,
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          const waited = clock.now() - queuedAt;
          if (waited > SLOW_WAIT_MS) {
            try { onSlowWait?.(v, waited); } catch { /* a broken logger must never leak the slot just taken */ }
          }
          resolve(() => { if (released) return; released = true; s.inFlight--; void pump(v); });
        },
      };
      const onAbort = () => { w.aborted = true; reject(signal!.reason); void pump(v); };
      signal?.addEventListener('abort', onAbort, { once: true });
      s.queue.push(w);
      void pump(v);
    });
  }
  const limitedFetch = (v: VendorKey, inner: typeof fetch = (i, init) => globalThis.fetch(i, init)): TimedFetch => async (input, init = {}) => {
    const release = await acquire(v, init.signal ?? undefined);
    try {
      return await inner(input, withTimeout(init)); // the timeout starts here, after the slot
    } finally { release(); } // held until headers (decision 3)
  };
  return { acquire, limitedFetch };
}
