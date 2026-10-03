import type { HostRateLimiter } from './rate-limit';
import { emptyPage, type Renderer } from './renderer';
import type { RobotsPolicy } from './robots';
import { siteHost } from './user-agent';

/**
 * robots.txt → rate limit → render → re-check where the site redirected us (Phase 3d decision 18): another site's
 * content or a robots-disallowed path is discarded. The redirect itself was the site's doing; we only refuse its content.
 */
export function createPoliteRenderer(deps: { robots: RobotsPolicy; limiter: HostRateLimiter; renderer: Renderer }): Renderer {
  return {
    async render(url) {
      const verdict = await deps.robots.check(url);
      if (!verdict.allowed) return emptyPage(url, 'robots_disallowed', verdict.reason);
      await deps.limiter.wait(url, verdict.crawlDelaySeconds);
      const page = await deps.renderer.render(url);
      if (page.status !== 'ok' || !page.finalUrl || page.finalUrl === url) return page;
      if (siteHost(page.finalUrl) !== siteHost(url)) {
        await page.close();
        return emptyPage(url, 'error', `redirected off-site to ${new URL(page.finalUrl).hostname}`, page.httpStatus);
      }
      const after = await deps.robots.check(page.finalUrl);
      if (!after.allowed) {
        await page.close();
        return emptyPage(url, 'robots_disallowed', `redirected to ${page.finalUrl}: ${after.reason ?? 'disallowed'}`, page.httpStatus);
      }
      return page;
    },
    close: () => deps.renderer.close(),
  };
}
