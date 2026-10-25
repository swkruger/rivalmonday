import { siteHost } from './user-agent';

export interface RateLimiterOptions {
  minIntervalMs?: number;
  maxCrawlDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** `withHostLock` result when another render for the same site is already in progress. */
export const HOST_BUSY: unique symbol = Symbol('HOST_BUSY');

/**
 * Politeness: at most one request per interval per site (spec §4.2: ≥ a few seconds per host). The interval runs from the
 * start of the last request to the host and uses the *current* request's crawl delay, so a delay learned from robots.txt
 * also spaces the page request from the robots fetch that taught it.
 */
export class HostRateLimiter {
  /** Start time of the last reserved request per host. */
  private readonly last = new Map<string, number>();
  /** Deferral stagger per host (not a reservation): successive deferrals come back one interval apart. */
  private readonly cursor = new Map<string, number>();
  private readonly locked = new Set<string>();
  private readonly minIntervalMs: number;
  private readonly maxCrawlDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: RateLimiterOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 3000;
    this.maxCrawlDelayMs = opts.maxCrawlDelayMs ?? 60_000;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private intervalFor(crawlDelaySeconds?: number | null): number {
    return Math.max(this.minIntervalMs, Math.min((crawlDelaySeconds ?? 0) * 1000, this.maxCrawlDelayMs));
  }

  async wait(url: string, crawlDelaySeconds?: number | null): Promise<void> {
    const host = siteHost(url);
    const now = this.now();
    const slot = Math.max(now, (this.last.get(host) ?? -Infinity) + this.intervalFor(crawlDelaySeconds));
    // Reserve synchronously so concurrent callers queue behind each other.
    this.last.set(host, slot);
    if (slot > now) await this.sleep(slot - now);
  }

  /** Milliseconds until a request to this host may start; reserves nothing. */
  nextSlotIn(url: string, crawlDelaySeconds?: number | null): number {
    return Math.max(0, (this.last.get(siteHost(url)) ?? -Infinity) + this.intervalFor(crawlDelaySeconds) - this.now());
  }

  /** Retry delay for a deferred request (≥ the minimum interval); successive deferrals for one host are staggered. */
  deferIn(url: string, crawlDelaySeconds?: number | null): number {
    const host = siteHost(url);
    const now = this.now();
    const interval = this.intervalFor(crawlDelaySeconds);
    const at = Math.max(now + this.nextSlotIn(url, crawlDelaySeconds), this.cursor.get(host) ?? 0);
    this.cursor.set(host, at + interval);
    return Math.max(at - now, this.minIntervalMs);
  }

  /** Runs `fn` while holding the site's lock, or returns `HOST_BUSY` at once when another caller holds it. */
  async withHostLock<T>(url: string, fn: () => Promise<T>): Promise<T | typeof HOST_BUSY> {
    const host = siteHost(url);
    if (this.locked.has(host)) return HOST_BUSY;
    this.locked.add(host);
    try {
      return await fn();
    } finally {
      this.locked.delete(host);
    }
  }
}
