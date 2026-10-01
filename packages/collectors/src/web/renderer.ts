import { type Browser, type BrowserContext, chromium, errors } from 'playwright';
import sharp from 'sharp';
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

export function createPlaywrightRenderer(
  opts: { userAgent?: string; timeoutMs?: number; maxScreenshotHeight?: number; renderDeadlineMs?: number } = {},
): Renderer {
  const userAgent = opts.userAgent ?? BOT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const renderDeadlineMs = opts.renderDeadlineMs ?? timeoutMs * 2;
  const maxHeight = opts.maxScreenshotHeight ?? 8000;
  const browserCache = createBrowserCache(() => chromium.launch({ headless: true }));

  return {
    async render(url) {
      let context: BrowserContext | null = null;
      // Bounds the whole post-goto body (content/title/evaluate + later screenshot) so a page
      // whose JS hangs forever can never stall the single worker indefinitely.
      const deadlineAt = Date.now() + renderDeadlineMs;
      try {
        context = await (await browserCache.get()).newContext({ userAgent, viewport: { width: 1366, height: 900 } });
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
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
