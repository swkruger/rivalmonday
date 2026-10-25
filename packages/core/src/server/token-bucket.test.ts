import { describe, expect, it } from 'vitest';
import { createVendorLimiter, timedFetch } from './token-bucket';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** Fake clock: sleep() parks until advance() moves time past its deadline. */
function fakeClock() {
  let t = 0;
  const sleepers: Array<{ at: number; wake: () => void }> = [];
  return {
    now: () => t,
    sleep: (ms: number) => new Promise<void>((r) => sleepers.push({ at: t + ms, wake: r })),
    async advance(ms: number) {
      const end = t + ms;
      for (;;) {
        await flush();
        const next = sleepers.filter((s) => s.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        sleepers.splice(sleepers.indexOf(next), 1);
        t = Math.max(t, next.at);
        next.wake();
      }
      t = end;
      await flush();
    },
  };
}

describe('createVendorLimiter', () => {
  it('perSecond 10 grants 10 at once then 1 per 100 ms', async () => {
    const clock = fakeClock();
    const lim = createVendorLimiter({ dataforseo: { perSecond: 10 } }, clock);
    let granted = 0;
    for (let i = 0; i < 13; i++) void lim.acquire('dataforseo').then(() => granted++);
    await flush();
    expect(granted).toBe(10);
    await clock.advance(99);
    expect(granted).toBe(10);
    await clock.advance(1);
    expect(granted).toBe(11);
    await clock.advance(100);
    expect(granted).toBe(12);
    await clock.advance(100);
    expect(granted).toBe(13);
  });

  it('concurrent 3 holds the 4th until a release', async () => {
    const lim = createVendorLimiter({ apify: { concurrent: 3 } }, fakeClock());
    const rel = await Promise.all([lim.acquire('apify'), lim.acquire('apify'), lim.acquire('apify')]);
    let fourth = false;
    void lim.acquire('apify').then(() => (fourth = true));
    await flush();
    expect(fourth).toBe(false);
    rel[0]!();
    await flush();
    expect(fourth).toBe(true);
  });

  it('grants in FIFO order', async () => {
    const lim = createVendorLimiter({ jev: { concurrent: 1 } }, fakeClock());
    const first = await lim.acquire('jev');
    const order: number[] = [];
    const rels: Array<() => void> = [];
    for (const n of [1, 2, 3]) void lim.acquire('jev').then((r) => { order.push(n); rels.push(r); });
    first();
    for (let i = 0; i < 3; i++) { await flush(); rels.shift()?.(); }
    await flush();
    expect(order).toEqual([1, 2, 3]);
  });

  it('an aborted waiter rejects with the signal reason and does not consume a slot', async () => {
    const lim = createVendorLimiter({ jev: { concurrent: 1 } }, fakeClock());
    const first = await lim.acquire('jev');
    const ac = new AbortController();
    const waiting = lim.acquire('jev', ac.signal);
    let third = false;
    void lim.acquire('jev').then(() => (third = true));
    const reason = new Error('stop');
    ac.abort(reason);
    await expect(waiting).rejects.toBe(reason);
    first();
    await flush();
    expect(third).toBe(true);
  });

  it('a throwing fetch releases its slot', async () => {
    const lim = createVendorLimiter({ jev: { concurrent: 1 } }, fakeClock());
    const f = lim.limitedFetch('jev', (async () => { throw new Error('boom'); }) as unknown as typeof fetch);
    await expect(f('https://x.test')).rejects.toThrow('boom');
    await expect(lim.acquire('jev')).resolves.toBeTypeOf('function');
  });

  it('a request queued longer than timeoutMs still gets its full timeoutMs', async () => {
    const lim = createVendorLimiter({ jev: { concurrent: 1 } }, fakeClock());
    const hold = await lim.acquire('jev');
    let signal: AbortSignal | undefined;
    const f = lim.limitedFetch('jev', (async (_i: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Response('ok'); }) as unknown as typeof fetch);
    const p = f('https://x.test', { timeoutMs: 60 });
    await new Promise((r) => setTimeout(r, 90)); // real time passes while queued, longer than timeoutMs
    expect(signal).toBeUndefined();
    hold();
    await p;
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 90));
    expect(signal!.aborted).toBe(true); // the timeout runs from the grant
  });

  it('an unknown vendor passes straight through', async () => {
    const lim = createVendorLimiter({}, fakeClock());
    for (let i = 0; i < 50; i++) await expect(lim.acquire('stadia')).resolves.toBeTypeOf('function');
  });

  it('release twice frees one slot', async () => {
    const lim = createVendorLimiter({ apify: { concurrent: 2 } }, fakeClock());
    const a = await lim.acquire('apify');
    await lim.acquire('apify');
    a();
    a();
    let third = false;
    let fourth = false;
    void lim.acquire('apify').then(() => (third = true));
    void lim.acquire('apify').then(() => (fourth = true));
    await flush();
    expect(third).toBe(true);
    expect(fourth).toBe(false);
  });

  it('reports a wait over 5 s with vendor and ms', async () => {
    const clock = fakeClock();
    const seen: Array<[string, number]> = [];
    const lim = createVendorLimiter({ jev: { concurrent: 1 } }, clock, (v, ms) => seen.push([v, ms]));
    const hold = await lim.acquire('jev');
    void lim.acquire('jev');
    await clock.advance(5_001);
    hold();
    await flush();
    expect(seen).toEqual([['jev', 5_001]]);
  });
});

describe('timedFetch', () => {
  it('turns timeoutMs into an abort signal and merges a caller signal', async () => {
    let seen: RequestInit | undefined;
    const f = timedFetch((async (_i: unknown, init?: RequestInit) => { seen = init; return new Response('ok'); }) as unknown as typeof fetch);
    const ac = new AbortController();
    await f('https://x.test', { timeoutMs: 1000, signal: ac.signal });
    expect(seen).not.toHaveProperty('timeoutMs');
    ac.abort();
    expect(seen!.signal!.aborted).toBe(true);
  });
});
