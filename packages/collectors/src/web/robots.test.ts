import { describe, expect, it, vi } from 'vitest';
import { RobotsPolicy } from './robots';
import { BOT_TOKEN } from './user-agent';

const robots = `User-agent: *
Disallow: /private
Crawl-delay: 5
Sitemap: https://site.example/sitemap.xml

User-agent: ${BOT_TOKEN}
Disallow: /no-bots
`;

function policy(response: { status: number; body: string } | Error) {
  const fetchText = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  let t = 0;
  return { p: new RobotsPolicy(fetchText, () => t, 1000), fetchText, advance: (ms: number) => { t += ms; } };
}

describe('RobotsPolicy', () => {
  it('obeys rules for our token and exposes sitemaps', async () => {
    const { p } = policy({ status: 200, body: robots });
    expect(await p.check('https://site.example/pricing')).toMatchObject({ allowed: true, reason: 'allowed', sitemaps: ['https://site.example/sitemap.xml'] });
    expect(await p.check('https://site.example/no-bots/x')).toMatchObject({ allowed: false, reason: 'disallowed' });
  });

  it('treats 4xx robots.txt as allow-all', async () => {
    const { p } = policy({ status: 404, body: 'nope' });
    expect(await p.check('https://site.example/anything')).toMatchObject({ allowed: true, reason: 'allowed', sitemaps: [] });
  });

  it('treats 5xx or unreachable robots.txt as disallow-all', async () => {
    expect(await policy({ status: 503, body: '' }).p.check('https://site.example/')).toMatchObject({ allowed: false, reason: 'robots_unavailable' });
    expect(await policy(new Error('ECONNRESET')).p.check('https://site.example/')).toMatchObject({ allowed: false, reason: 'robots_unavailable' });
  });

  it('caches per origin until the TTL expires', async () => {
    const { p, fetchText, advance } = policy({ status: 200, body: robots });
    await p.check('https://site.example/a');
    await p.check('https://site.example/b');
    expect(fetchText).toHaveBeenCalledTimes(1);
    advance(1001);
    await p.check('https://site.example/c');
    expect(fetchText).toHaveBeenCalledTimes(2);
    expect(fetchText).toHaveBeenCalledWith('https://site.example/robots.txt');
  });
});
