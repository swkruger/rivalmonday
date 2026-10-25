import { describe, expect, it } from 'vitest';
import { HOST_BUSY, HostRateLimiter } from './rate-limit';

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
    // Each call waits its own interval after the last request's start: 10s, then 60s (600s capped), 60s.
    await l.wait('https://www.a.example/1', 10);
    await l.wait('https://a.example/2', 10);
    await l.wait('https://a.example/3', 600);
    await l.wait('https://a.example/4', 600);
    expect(sleeps).toEqual([10_000, 60_000, 60_000]);
  });

  it('nextSlotIn reserves nothing', async () => {
    const { l, sleeps } = limiter();
    expect(l.nextSlotIn('https://a.example/1')).toBe(0);
    expect(l.nextSlotIn('https://a.example/1')).toBe(0);
    await l.wait('https://a.example/1');
    expect(sleeps).toEqual([]);
    expect(l.nextSlotIn('https://a.example/2')).toBe(3000);
    expect(l.nextSlotIn('https://a.example/2', 20)).toBe(20_000);
    expect(l.nextSlotIn('https://a.example/2')).toBe(3000);
    expect(l.nextSlotIn('https://b.example/')).toBe(0);
  });

  it('crawl-delay learned after the robots fetch spaces the page request 30 s from it', async () => {
    const { l, sleeps } = limiter();
    await l.wait('https://a.example/robots.txt', null); // the robots fetch, before the delay is known
    await l.wait('https://a.example/page', 30);
    expect(sleeps).toEqual([30_000]);
  });

  it('deferIn staggers successive deferrals by one interval', async () => {
    const { l, advance } = limiter();
    await l.wait('https://a.example/1');
    expect(l.deferIn('https://a.example/2')).toBe(3000);
    expect(l.deferIn('https://a.example/3')).toBe(6000);
    expect(l.deferIn('https://a.example/4')).toBe(9000);
    advance(1000);
    expect(l.deferIn('https://a.example/5')).toBe(11_000);
    // never sooner than the minimum interval, even for an idle host
    expect(l.deferIn('https://idle.example/')).toBe(3000);
  });

  it('withHostLock returns HOST_BUSY while held and frees on throw', async () => {
    const { l } = limiter();
    let release!: () => void;
    const held = l.withHostLock('https://a.example/1', () => new Promise<string>((r) => { release = () => r('done'); }));
    expect(await l.withHostLock('https://www.a.example/2', async () => 'second')).toBe(HOST_BUSY);
    expect(await l.withHostLock('https://b.example/', async () => 'other host')).toBe('other host');
    release();
    expect(await held).toBe('done');
    await expect(l.withHostLock('https://a.example/3', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await l.withHostLock('https://a.example/4', async () => 'free again')).toBe('free again');
  });
});
