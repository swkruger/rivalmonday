import { type APIResponse, type Browser, type BrowserContext, chromium, errors, type Page, type Route } from 'playwright';
import sharp from 'sharp';
import { assertPublicUrl, SsrfBlockedError } from '../net/guard';
import { detectBlocked } from './blocked';
import { BOT_USER_AGENT } from './user-agent';

export type RenderStatus = 'ok' | 'blocked' | 'timeout' | 'error' | 'robots_disallowed';

export interface RenderedPage {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  status: RenderStatus;
  title: string;
  html: string;
  text: string;
  links: { href: string; text: string }[];
  error: string | null;
  /** Full-page WebP screenshot; only call when the content changed (cost). */
  screenshot(): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface Renderer {
  render(url: string): Promise<RenderedPage>;
  close(): Promise<void>;
}

export function emptyPage(url: string, status: RenderStatus, error: string | null, httpStatus: number | null = null): RenderedPage {
  return {
    requestedUrl: url, finalUrl: url, httpStatus, status, title: '', html: '', text: '', links: [], error,
    screenshot: async () => { throw new Error(`No screenshot for a ${status} page`); },
    close: async () => {},
  };
}

/**
 * Caches a single launched Browser, but never hands back one that has died: a cached
 * promise for a crashed/disconnected browser would otherwise poison the single worker
 * forever (every subsequent render would try to use a dead connection).
 *
 * Exported standalone (rather than kept as a closure in createPlaywrightRenderer) so the
 * recovery logic can be unit-tested with a fake launcher/Browser instead of a real
 * chromium process.
 */
export function createBrowserCache(launch: () => Promise<Browser>) {
  let cached: Promise<Browser> | null = null;

  async function get(): Promise<Browser> {
    if (cached) {
      try {
        const existing = await cached;
        if (existing.isConnected()) return existing;
      } catch {
        // Launch itself failed; fall through and relaunch below.
      }
      cached = null;
    }
    const launching: Promise<Browser> = launch().then((b) => {
      // The browser can die later (crash, OOM, manual kill) without us calling close():
      // drop the cache so the next render relaunches instead of hanging on a dead handle.
      b.on('disconnected', () => {
        if (cached === launching) cached = null;
      });
      return b;
    });
    cached = launching;
    try {
      return await launching;
    } catch (err) {
      if (cached === launching) cached = null;
      throw err;
    }
  }

  async function close(): Promise<void> {
    if (!cached) return;
    const pending = cached;
    cached = null;
    const b = await pending.catch(() => null);
    if (b) await b.close();
  }

  return { get, close };
}

/** Races `promise` against a timer; rejects with `message` if the timer fires first. Never leaks the timer. */
function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), Math.max(0, ms));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

const RENDER_DEADLINE_MESSAGE = 'render deadline exceeded';
const MAX_REDIRECTS = 5;

function redirectLocation(res: APIResponse): string | null {
  const s = res.status();
  return s === 301 || s === 302 || s === 303 || s === 307 || s === 308 ? (res.headers().location ?? null) : null;
}

/** Per-render guard state: the main-frame navigation was refused, or answered with a redirect we follow ourselves. */
type GuardState = { blocked: boolean; redirect: string | null };

/**
 * SSRF guard for every browser request (spec D11). Playwright never calls a route handler for a redirect hop (the
 * browser follows it internally), so instead of `route.continue()` each http(s) request is fetched with
 * `route.fetch({ maxRedirects: 0 })` and every hop is checked before it is requested:
 * - main-frame navigations: a redirect is answered with an empty page and recorded; `render` then navigates to the
 *   target itself, so the hop comes back through this handler (and `page.url()` stays the real final URL);
 * - everything else (sub-resources, iframes, popups): hops are followed here, then the final response is fulfilled.
 * A refusal aborts with `blockedbyclient`; a refused main-frame navigation marks the render `ssrf_blocked`.
 * Media is aborted outright: `route.fetch` buffers whole bodies, and a capture needs no video/audio.
 */
async function guardRoute(route: Route, page: Page, state: GuardState, assertUrl: (url: string) => Promise<void>, fetchTimeoutMs: number) {
  const req = route.request();
  const url = req.url();
  try {
    if (!/^https?:/i.test(url)) return await route.continue();
    let mainNav = false;
    try {
      mainNav = req.isNavigationRequest() && req.frame() === page.mainFrame();
    } catch {
      // Service-worker requests have no frame (and service workers are blocked anyway).
    }
    const check = async (u: string): Promise<boolean> => {
      try {
        await assertUrl(u);
        return true;
      } catch (err) {
        if (!(err instanceof SsrfBlockedError)) throw err; // lookup failures are ordinary fetch errors (Decision 6)
        if (mainNav) state.blocked = true;
        return false;
      }
    };
    if (!(await check(url))) return await route.abort('blockedbyclient');
    if (req.resourceType() === 'media') return await route.abort('blockedbyclient');
    let res = await route.fetch({ maxRedirects: 0, timeout: fetchTimeoutMs });
    if (mainNav) {
      const location = redirectLocation(res);
      if (location) {
        state.redirect = new URL(location, url).href;
        return await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
      }
      return await route.fulfill({ response: res });
    }
    let current = url;
    for (let hop = 0; ; hop++) {
      const location = redirectLocation(res);
      if (!location) break;
      if (hop >= MAX_REDIRECTS) return await route.abort('failed');
      current = new URL(location, current).href;
      if (!(await check(current))) return await route.abort('blockedbyclient');
      res = await route.fetch({ url: current, maxRedirects: 0, timeout: fetchTimeoutMs });
    }
    return await route.fulfill({ response: res });
  } catch {
    // Network error, lookup failure or the context closing mid-request: fail this request only.
    await route.abort('failed').catch(() => {});
  }
}

export function createPlaywrightRenderer(
  opts: {
    userAgent?: string;
    timeoutMs?: number;
    maxScreenshotHeight?: number;
    renderDeadlineMs?: number;
    /** SSRF check for every request and redirect hop; throws `SsrfBlockedError` to refuse. Tests on 127.0.0.1 fixtures inject a permissive one. */
    assertUrl?: (url: string) => Promise<void>;
  } = {},
): Renderer {
  const userAgent = opts.userAgent ?? BOT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const renderDeadlineMs = opts.renderDeadlineMs ?? timeoutMs * 2;
  const maxHeight = opts.maxScreenshotHeight ?? 8000;
  const assertUrl = opts.assertUrl ?? ((u: string) => assertPublicUrl(u));
  const browserCache = createBrowserCache(() => chromium.launch({ headless: true }));

  return {
    async render(url) {
      let context: BrowserContext | null = null;
      const state: GuardState = { blocked: false, redirect: null };
      // Bounds the whole post-goto body (content/title/evaluate + later screenshot) so a page
      // whose JS hangs forever can never stall the single worker indefinitely.
      const deadlineAt = Date.now() + renderDeadlineMs;
      try {
        // Service workers would fetch outside our routes; WebSockets are never routed through them either.
        context = await (await browserCache.get()).newContext({ userAgent, viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
        await context.routeWebSocket(() => true, (ws) => ws.close());
        const page = await context.newPage();
        // The fetch timeout outlives goto's, so a slow page still reports `timeout` (goto's TimeoutError) first.
        await context.route('**/*', (route) => guardRoute(route, page, state, assertUrl, renderDeadlineMs));
        let target = url;
        let response = null;
        for (let hop = 0; ; hop++) {
          state.redirect = null;
          response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          if (!state.redirect) break;
          if (hop >= MAX_REDIRECTS) {
            await context.close();
            return emptyPage(url, 'error', `too many redirects (more than ${MAX_REDIRECTS})`);
          }
          target = state.redirect;
        }
        if (state.blocked) {
          await context.close();
          return emptyPage(url, 'error', 'ssrf_blocked');
        }
        const httpStatus = response?.status() ?? null;
        const ctx = context;

        const remaining = () => Math.max(0, deadlineAt - Date.now());
        const bounded = <T>(p: Promise<T>) => withDeadline(p, remaining(), RENDER_DEADLINE_MESSAGE);

        const html = await bounded(page.content());
        if (detectBlocked(httpStatus, html)) {
          await ctx.close();
          return emptyPage(url, 'blocked', null, httpStatus);
        }
        if (httpStatus !== null && httpStatus >= 400) {
          await ctx.close();
          return emptyPage(url, 'error', `HTTP ${httpStatus}`, httpStatus);
        }
        const title = await bounded(page.title());
        const text = await bounded(page.evaluate(() => document.body?.innerText ?? ''));
        const links = await bounded(
          page.evaluate(() =>
            Array.from(document.querySelectorAll('a[href]')).map((a) => ({
              href: (a as HTMLAnchorElement).href,
              text: ((a as HTMLAnchorElement).innerText || a.getAttribute('aria-label') || '').trim().slice(0, 120),
            })),
          ),
        );
        if (state.blocked) {
          // A later main-frame navigation (script redirect) was refused while we read the page.
          await ctx.close();
          return emptyPage(url, 'error', 'ssrf_blocked');
        }
        return {
          requestedUrl: url, finalUrl: page.url(), httpStatus, status: 'ok', title, html, text, links, error: null,
          async screenshot() {
            return withDeadline(
              (async () => {
                const jpeg = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 });
                return new Uint8Array(
                  await sharp(jpeg).resize({ width: 1366, height: maxHeight, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer(),
                );
              })(),
              renderDeadlineMs,
              'screenshot deadline exceeded',
            );
          },
          close: () => ctx.close(),
        };
      } catch (err) {
        await context?.close().catch(() => {});
        if (state.blocked) return emptyPage(url, 'error', 'ssrf_blocked');
        if (err instanceof errors.TimeoutError) return emptyPage(url, 'timeout', err.message);
        if (err instanceof Error && err.message === RENDER_DEADLINE_MESSAGE) return emptyPage(url, 'timeout', err.message);
        return emptyPage(url, 'error', err instanceof Error ? err.message : String(err));
      }
    },
    async close() {
      await browserCache.close();
    },
  };
}
