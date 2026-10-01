import { siteHost } from './user-agent';

export interface RateLimiterOptions {
  minIntervalMs?: number;
  maxCrawlDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Politeness: at most one request per interval per site (spec §4.2: ≥ a few seconds per host). */
export class HostRateLimiter {
  private readonly nextSlot = new Map<string, number>();
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

  async wait(url: string, crawlDelaySeconds?: number | null): Promise<void> {
    const host = siteHost(url);
    const interval = Math.max(this.minIntervalMs, Math.min((crawlDelaySeconds ?? 0) * 1000, this.maxCrawlDelayMs));
    const now = this.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? now);
    // Reserve synchronously so concurrent callers queue behind each other.
    this.nextSlot.set(host, slot + interval);
    if (slot > now) await this.sleep(slot - now);
  }
}
