import type { HostRateLimiter } from './rate-limit';
import { emptyPage, type Renderer } from './renderer';
import type { RobotsPolicy } from './robots';

/** robots.txt → rate limit → render. Disallowed URLs are never fetched. */
export function createPoliteRenderer(deps: { robots: RobotsPolicy; limiter: HostRateLimiter; renderer: Renderer }): Renderer {
  return {
    async render(url) {
      const verdict = await deps.robots.check(url);
      if (!verdict.allowed) return emptyPage(url, 'robots_disallowed', verdict.reason);
      await deps.limiter.wait(url, verdict.crawlDelaySeconds);
      return deps.renderer.render(url);
    },
    close: () => deps.renderer.close(),
  };
}
