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

  it('treats a 429 robots.txt as unavailable, not allow-all', async () => {
    const { p } = policy({ status: 429, body: '' });
    expect(await p.check('https://site.example/anything')).toMatchObject({ allowed: false, reason: 'robots_unavailable' });
  });

  it('re-fetches an unavailable robots.txt after its shorter TTL while a rules verdict keeps the normal (longer) TTL', async () => {
    let t = 0;
    const now = () => t;
    const fetchText = vi.fn(async (url: string) => {
      if (url === 'https://flaky.example/robots.txt') return { status: 503, body: '' };
      return { status: 200, body: robots };
    });
    // ttlMs = 24h (default-ish, use a big number); unavailableTtlMs = 1h.
    const p = new RobotsPolicy(fetchText, now, 24 * 60 * 60 * 1000, 60 * 60 * 1000);

    await p.check('https://flaky.example/');
    expect(fetchText).toHaveBeenCalledTimes(1);

    // Within the 1h unavailable TTL: still cached, no re-fetch.
    t += 59 * 60 * 1000;
    await p.check('https://flaky.example/');
    expect(fetchText).toHaveBeenCalledTimes(1);

    // Past 1h: re-fetched.
    t += 2 * 60 * 1000;
    await p.check('https://flaky.example/');
    expect(fetchText).toHaveBeenCalledTimes(2);

    // Meanwhile a normal `rules` verdict for a different origin stays cached well past 1h
    // (it uses the long ttlMs, not the short unavailableTtlMs).
    await p.check('https://site.example/a');
    const callsBefore = fetchText.mock.calls.length;
    t += 2 * 60 * 60 * 1000; // +2h, still under the 24h ttlMs
    await p.check('https://site.example/b');
    expect(fetchText).toHaveBeenCalledTimes(callsBefore);
  });
});
