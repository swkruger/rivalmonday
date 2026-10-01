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
