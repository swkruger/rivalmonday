import robotsParser from 'robots-parser';
import { guardedFetchText } from '../net/guard';
import type { HostRateLimiter } from './rate-limit';
import { BOT_TOKEN, type FetchText } from './user-agent';

export interface RobotsVerdict {
  allowed: boolean;
  reason: 'allowed' | 'disallowed' | 'robots_unavailable';
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

type Parsed = { kind: 'rules'; robots: ReturnType<typeof robotsParser> } | { kind: 'allow_all' } | { kind: 'unavailable' };

/** RFC 9309 semantics: 2xx → rules, 4xx → allow all, 5xx/unreachable → disallow all. */
export class RobotsPolicy {
  private readonly cache = new Map<string, { at: number; parsed: Parsed }>();
  /** One fetch per origin at a time: concurrent checks share it. */
  private readonly inFlight = new Map<string, Promise<Parsed>>();

  constructor(
    /** Defaults to the SSRF-guarded fetch; a refused robots URL throws and so reads as unreachable (disallow). */
    private readonly fetchText: FetchText = guardedFetchText,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
    /**
     * `unavailable` (5xx/unreachable/429) is cached for much less than the normal TTL: it is
     * usually transient (one timeout), and caching it for a full day would wrongly record
     * weekly pages as robots_disallowed for a day. Defaults to 1 hour.
     */
    private readonly unavailableTtlMs: number = 60 * 60 * 1000,
    /** 7c2: a robots fetch is a request to the host too, so it takes a limiter slot (crawl delay unknown yet). */
    private readonly limiter?: Pick<HostRateLimiter, 'wait'>,
  ) {}

  async check(url: string): Promise<RobotsVerdict> {
    return this.verdict(url, await this.load(new URL(url).origin));
  }

  /** The cached verdict for `url`, or null when its origin has no fresh entry; never fetches. */
  peek(url: string): RobotsVerdict | null {
    const parsed = this.fresh(new URL(url).origin);
    return parsed ? this.verdict(url, parsed) : null;
  }

  private verdict(url: string, parsed: Parsed): RobotsVerdict {
    if (parsed.kind === 'unavailable') return { allowed: false, reason: 'robots_unavailable', crawlDelaySeconds: null, sitemaps: [] };
    if (parsed.kind === 'allow_all') return { allowed: true, reason: 'allowed', crawlDelaySeconds: null, sitemaps: [] };
    const allowed = parsed.robots.isAllowed(url, BOT_TOKEN) !== false;
    return {
      allowed,
      reason: allowed ? 'allowed' : 'disallowed',
      crawlDelaySeconds: parsed.robots.getCrawlDelay(BOT_TOKEN) ?? null,
      sitemaps: parsed.robots.getSitemaps(),
    };
  }

  private fresh(origin: string): Parsed | null {
    const hit = this.cache.get(origin);
    if (!hit) return null;
    const ttl = hit.parsed.kind === 'unavailable' ? this.unavailableTtlMs : this.ttlMs;
    return this.now() - hit.at <= ttl ? hit.parsed : null;
  }

  private load(origin: string): Promise<Parsed> {
    const cached = this.fresh(origin);
    if (cached) return Promise.resolve(cached);
    const pending = this.inFlight.get(origin);
    if (pending) return pending;
    const loading = this.fetchParsed(origin).finally(() => this.inFlight.delete(origin));
    this.inFlight.set(origin, loading);
    return loading;
  }

  private async fetchParsed(origin: string): Promise<Parsed> {
    const robotsUrl = `${origin}/robots.txt`;
    let parsed: Parsed;
    try {
      await this.limiter?.wait(robotsUrl, null);
      const res = await this.fetchText(robotsUrl);
      // RFC 9309 §2.3.1.3 says 4xx → allow all, but common practice excludes 429 (rate
      // limiting): the site is asking us to back off, not declaring it has no robots.txt.
      if (res.status >= 200 && res.status < 300) parsed = { kind: 'rules', robots: robotsParser(robotsUrl, res.body) };
      else if (res.status === 429) parsed = { kind: 'unavailable' };
      else if (res.status >= 400 && res.status < 500) parsed = { kind: 'allow_all' };
      else parsed = { kind: 'unavailable' };
    } catch {
      parsed = { kind: 'unavailable' };
    }
    this.cache.set(origin, { at: this.now(), parsed });
    return parsed;
  }
}
