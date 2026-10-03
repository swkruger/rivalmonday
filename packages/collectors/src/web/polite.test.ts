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
