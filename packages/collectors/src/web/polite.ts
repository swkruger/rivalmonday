import { HOST_BUSY, type HostRateLimiter } from './rate-limit';
import { emptyPage, type RenderedPage, type Renderer } from './renderer';
import type { RobotsPolicy, RobotsVerdict } from './robots';
import { siteHost } from './user-agent';

/** 7c2: the longest a capture may wait for its host's next slot before it is deferred instead. */
export const MAX_CAPTURE_WAIT_MS = 10_000;

export type RenderOrDeferResult = { page: RenderedPage } | { deferred: true; retryInMs: number };

export interface PoliteRenderer extends Renderer {
  /**
   * Captures: one render per site at a time and no sleeping past `maxWaitMs` (default `MAX_CAPTURE_WAIT_MS`). A busy
   * host, or a slot (robots fetch or page) further away than that, returns `deferred` with a staggered retry delay.
   */
  renderOrDefer(url: string, opts?: { maxWaitMs?: number }): Promise<RenderOrDeferResult>;
}

/**
 * robots.txt → rate limit → render → re-check where the site redirected us (Phase 3d decision 18): another site's
 * content or a robots-disallowed path is discarded. The redirect itself was the site's doing; we only refuse its content.
 * `render` blocks for its slot (KB import, discovery); `renderOrDefer` is for captures (7c2).
 */
export function createPoliteRenderer(deps: { robots: RobotsPolicy; limiter: HostRateLimiter; renderer: Renderer }): PoliteRenderer {
  /** Everything after an allowing robots verdict: wait for the slot, render, check the redirect target. */
  async function renderChecked(url: string, verdict: RobotsVerdict): Promise<RenderedPage> {
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
  }

  return {
    async render(url) {
      const verdict = await deps.robots.check(url);
      if (!verdict.allowed) return emptyPage(url, 'robots_disallowed', verdict.reason);
      return renderChecked(url, verdict);
    },
    async renderOrDefer(url, opts = {}) {
      const max = opts.maxWaitMs ?? MAX_CAPTURE_WAIT_MS;
      const defer = (d: number | null) => ({ deferred: true as const, retryInMs: deps.limiter.deferIn(url, d) });
      const r = await deps.limiter.withHostLock(url, async (): Promise<RenderOrDeferResult> => {
        const known = deps.robots.peek(url);
        if (!known && deps.limiter.nextSlotIn(url, null) > max) return defer(null); // robots fetch would wait too long
        const verdict = known ?? (await deps.robots.check(url)); // a fetch takes a slot (RobotsPolicy.limiter)
        if (!verdict.allowed) return { page: emptyPage(url, 'robots_disallowed', verdict.reason) };
        if (deps.limiter.nextSlotIn(url, verdict.crawlDelaySeconds) > max) return defer(verdict.crawlDelaySeconds);
        return { page: await renderChecked(url, verdict) };
      });
      return r === HOST_BUSY ? defer(deps.robots.peek(url)?.crawlDelaySeconds ?? null) : r;
    },
    close: () => deps.renderer.close(),
  };
}
