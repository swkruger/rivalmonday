import { describe, expect, it, vi } from 'vitest';
import { createPoliteRenderer } from './polite';
import { HostRateLimiter } from './rate-limit';
import type { RenderedPage, Renderer } from './renderer';
import { RobotsPolicy } from './robots';

const okPage = (url: string): RenderedPage => ({
  requestedUrl: url, finalUrl: url, httpStatus: 200, status: 'ok', title: '', html: '', text: '', links: [], error: null,
  screenshot: async () => new Uint8Array(), close: async () => {},
});

describe('polite renderer', () => {
  it('does not render robots-disallowed URLs', async () => {
    const inner: Renderer = { render: vi.fn(async (u: string) => okPage(u)), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nDisallow: /secret' }));
    const r = createPoliteRenderer({ robots, limiter: new HostRateLimiter({ sleep: async () => {} }), renderer: inner });
    expect((await r.render('https://site.example/secret/1')).status).toBe('robots_disallowed');
    expect(inner.render).not.toHaveBeenCalled();
    expect((await r.render('https://site.example/public')).status).toBe('ok');
    expect(inner.render).toHaveBeenCalledTimes(1);
  });

  it('waits on the rate limiter with the robots crawl delay before rendering', async () => {
    const order: string[] = [];
    const inner: Renderer = { render: async (u) => { order.push('render'); return okPage(u); }, close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nCrawl-delay: 7' }));
    const limiter = { wait: vi.fn(async () => { order.push('wait'); }) } as unknown as HostRateLimiter;
    await createPoliteRenderer({ robots, limiter, renderer: inner }).render('https://site.example/');
    expect(order).toEqual(['wait', 'render']);
    expect(limiter.wait).toHaveBeenCalledWith('https://site.example/', 7);
  });
});

describe('redirect checks (Phase 3d decision 18)', () => {
  const page = (requestedUrl: string, finalUrl: string) => ({
    requestedUrl, finalUrl, httpStatus: 200, status: 'ok' as const, title: 't', html: '<p>x</p>', text: 'x', links: [], error: null,
    screenshot: async () => new Uint8Array(), close: vi.fn(async () => {}),
  });
  const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nDisallow: /private' }));
  const limiter = { wait: async () => {} } as unknown as HostRateLimiter;

  it('drops a page that redirected to another site', async () => {
    const p = page('https://smithhvac.example/', 'https://other.example/');
    const r = await createPoliteRenderer({ robots, limiter, renderer: { render: async () => p, close: async () => {} } }).render('https://smithhvac.example/');
    expect(r).toMatchObject({ status: 'error', error: 'redirected off-site to other.example' });
    expect(p.close).toHaveBeenCalled();
  });

  it('drops a page that redirected to a robots-disallowed path, and keeps same-site www/https redirects', async () => {
    const bad = page('https://smithhvac.example/a', 'https://smithhvac.example/private/a');
    expect((await createPoliteRenderer({ robots, limiter, renderer: { render: async () => bad, close: async () => {} } }).render('https://smithhvac.example/a')).status).toBe('robots_disallowed');
    const ok = page('http://smithhvac.example/', 'https://www.smithhvac.example/');
    expect((await createPoliteRenderer({ robots, limiter, renderer: { render: async () => ok, close: async () => {} } }).render('http://smithhvac.example/')).status).toBe('ok');
  });
});

describe('renderOrDefer (Phase 7c2)', () => {
  /** Virtual time: `sleep` parks a timer; `drain` runs every timer in time order until nothing is pending. */
  function clock() {
    let t = 0;
    const timers: { at: number; resolve: () => void }[] = [];
    const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
    return {
      now: () => t,
      sleep: (ms: number) => new Promise<void>((resolve) => { timers.push({ at: t + ms, resolve }); }),
      async drain(done: () => boolean) {
        for (;;) {
          await settle();
          if (done() || timers.length === 0) return;
          timers.sort((a, b) => a.at - b.at);
          const next = timers.shift()!;
          t = Math.max(t, next.at);
          next.resolve();
        }
      },
    };
  }

  /** Every request (robots fetch or render) is logged per host with its start time. */
  function rig(robotsBody: (host: string) => string, renderMs = 0) {
    const c = clock();
    const requests: { host: string; at: number; what: string }[] = [];
    const limiter = new HostRateLimiter({ now: c.now, sleep: c.sleep });
    const fetchText = vi.fn(async (u: string) => {
      const host = new URL(u).hostname;
      requests.push({ host, at: c.now(), what: 'robots' });
      return { status: 200, body: robotsBody(host) };
    });
    const robots = new RobotsPolicy(fetchText, c.now, 24 * 3600_000, 3600_000, limiter);
    const inner: Renderer = {
      render: vi.fn(async (u: string) => {
        requests.push({ host: new URL(u).hostname, at: c.now(), what: 'render' });
        if (renderMs > 0) await c.sleep(renderMs);
        return okPage(u);
      }),
      close: async () => {},
    };
    return { c, requests, limiter, fetchText, inner, r: createPoliteRenderer({ robots, limiter, renderer: inner }) };
  }

  it('a busy host defers without a request', async () => {
    const { c, r, inner, fetchText } = rig(() => 'User-agent: *\nAllow: /', 5000);
    const first = r.renderOrDefer('https://a.example/1');
    await c.drain(() => (inner.render as ReturnType<typeof vi.fn>).mock.calls.length === 1);
    const second = await r.renderOrDefer('https://a.example/2');
    expect(second).toEqual({ deferred: true, retryInMs: expect.any(Number) });
    expect((second as { retryInMs: number }).retryInMs).toBeGreaterThanOrEqual(3000);
    expect(inner.render).toHaveBeenCalledTimes(1);
    expect(fetchText).toHaveBeenCalledTimes(1);
    let firstDone = false;
    void first.then(() => { firstDone = true; });
    await c.drain(() => firstDone);
    expect(await first).toMatchObject({ page: { status: 'ok' } });
  });

  it('Crawl-delay 30 host defers while another host renders immediately', async () => {
    const { c, r, inner } = rig((h) => (h === 'slow.example' ? 'User-agent: *\nCrawl-delay: 30' : 'User-agent: *\nAllow: /'));
    let slow: unknown;
    void r.renderOrDefer('https://slow.example/p').then((v) => { slow = v; });
    await c.drain(() => slow !== undefined);
    expect(slow).toEqual({ deferred: true, retryInMs: 30_000 });
    let fast: unknown;
    void r.renderOrDefer('https://fast.example/p').then((v) => { fast = v; });
    await c.drain(() => fast !== undefined);
    expect(fast).toMatchObject({ page: { status: 'ok' } });
    expect((inner.render as ReturnType<typeof vi.fn>).mock.calls.map((x) => x[0])).toEqual(['https://fast.example/p']);
  });

  it('a deferred robots fetch defers the capture', async () => {
    const { r, limiter, fetchText, inner } = rig(() => 'User-agent: *\nAllow: /');
    await limiter.wait('https://a.example/other'); // a request just went out to this host
    expect(await r.renderOrDefer('https://a.example/p', { maxWaitMs: 1000 })).toEqual({ deferred: true, retryInMs: 3000 });
    expect(fetchText).not.toHaveBeenCalled();
    expect(inner.render).not.toHaveBeenCalled();
  });

  it('no two requests to one host < 3 s apart across 20 mixed captures', async () => {
    const { c, r, requests } = rig((h) => (h === 'slow.example' ? 'User-agent: *\nCrawl-delay: 12' : 'User-agent: *\nAllow: /'), 1500);
    const hosts = ['a.example', 'b.example', 'slow.example', 'a.example', 'c.example'];
    const queue = Array.from({ length: 20 }, (_, i) => ({ url: `https://${hosts[i % hosts.length]}/p${i}`, availableAt: 0 }));
    const done: string[] = [];
    let deferrals = 0;
    // Four pollers, like the worker's web-capture-page queue: a deferral re-queues the job with its retry delay.
    const poller = async () => {
      while (queue.length > 0) {
        queue.sort((a, b) => a.availableAt - b.availableAt);
        const job = queue[0]!;
        if (job.availableAt > c.now()) { await c.sleep(job.availableAt - c.now()); continue; }
        queue.shift();
        const res = await r.renderOrDefer(job.url);
        if ('deferred' in res) { deferrals++; queue.push({ url: job.url, availableAt: c.now() + res.retryInMs }); }
        else done.push(job.url);
      }
    };
    let finished = false;
    void Promise.all([poller(), poller(), poller(), poller()]).then(() => { finished = true; });
    await c.drain(() => finished);
    expect(done).toHaveLength(20);
    expect(deferrals).toBeGreaterThan(0);
    expect(requests.filter((q) => q.what === 'render')).toHaveLength(20);
    expect(requests.filter((q) => q.what === 'robots')).toHaveLength(4);
    for (const host of new Set(requests.map((q) => q.host))) {
      const at = requests.filter((q) => q.host === host).map((q) => q.at).sort((a, b) => a - b);
      const gap = host === 'slow.example' ? 12_000 : 3000;
      for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!, `${host} request ${i}`).toBeGreaterThanOrEqual(gap);
    }
  });
});
