import { describe, expect, it } from 'vitest';
import { HostRateLimiter } from './rate-limit';

function limiter(minIntervalMs = 3000) {
  let t = 0;
  const sleeps: number[] = [];
  const l = new HostRateLimiter({
    minIntervalMs,
    maxCrawlDelayMs: 60_000,
    now: () => t,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
  });
  return { l, sleeps, advance: (ms: number) => { t += ms; } };
}

describe('HostRateLimiter', () => {
  it('spaces requests to the same host by the minimum interval', async () => {
    const { l, sleeps } = limiter();
    await l.wait('https://a.example/1');
    await l.wait('https://a.example/2');
    await l.wait('https://a.example/3');
    expect(sleeps).toEqual([3000, 3000]);
  });

  it('does not delay different hosts or requests after the interval passed', async () => {
    const { l, sleeps, advance } = limiter();
    await l.wait('https://a.example/1');
    await l.wait('https://b.example/1');
    advance(5000);
    await l.wait('https://a.example/2');
    expect(sleeps).toEqual([]);
  });

  it('uses a larger robots crawl-delay, capped at 60s, and treats www as the same host', async () => {
    const { l, sleeps } = limiter();
    // Each call reserves the gap *after* itself: 10s, 10s, then 60s (600s capped).
    await l.wait('https://www.a.example/1', 10);
    await l.wait('https://a.example/2', 10);
    await l.wait('https://a.example/3', 600);
    await l.wait('https://a.example/4', 600);
    expect(sleeps).toEqual([10_000, 10_000, 60_000]);
  });
});
