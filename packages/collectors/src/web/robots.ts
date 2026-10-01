import robotsParser from 'robots-parser';
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

  constructor(
    private readonly fetchText: FetchText,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
  ) {}

  async check(url: string): Promise<RobotsVerdict> {
    const origin = new URL(url).origin;
    const parsed = await this.load(origin);
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

  private async load(origin: string): Promise<Parsed> {
    const hit = this.cache.get(origin);
    if (hit && this.now() - hit.at <= this.ttlMs) return hit.parsed;
    const robotsUrl = `${origin}/robots.txt`;
    let parsed: Parsed;
    try {
      const res = await this.fetchText(robotsUrl);
      if (res.status >= 200 && res.status < 300) parsed = { kind: 'rules', robots: robotsParser(robotsUrl, res.body) };
      else if (res.status >= 400 && res.status < 500) parsed = { kind: 'allow_all' };
      else parsed = { kind: 'unavailable' };
    } catch {
      parsed = { kind: 'unavailable' };
    }
    this.cache.set(origin, { at: this.now(), parsed });
    return parsed;
  }
}
