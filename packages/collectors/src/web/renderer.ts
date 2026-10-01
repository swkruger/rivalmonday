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

export function createPlaywrightRenderer(opts: { userAgent?: string; timeoutMs?: number; maxScreenshotHeight?: number } = {}): Renderer {
  const userAgent = opts.userAgent ?? BOT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxHeight = opts.maxScreenshotHeight ?? 8000;
  let browser: Promise<Browser> | null = null;
  const getBrowser = () => {
    if (!browser) {
      // A rejected launch must not be cached forever (the worker keeps one renderer alive):
      // clear it so the next render retries the launch instead of replaying the same failure.
      browser = chromium.launch({ headless: true }).catch((err) => {
        browser = null;
        throw err;
      });
    }
    return browser;
  };

  return {
    async render(url) {
      let context: BrowserContext | null = null;
      try {
        context = await (await getBrowser()).newContext({ userAgent, viewport: { width: 1366, height: 900 } });
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        const httpStatus = response?.status() ?? null;
        const html = await page.content();
        const ctx = context;
        if (detectBlocked(httpStatus, html)) {
          await ctx.close();
          return emptyPage(url, 'blocked', null, httpStatus);
        }
        const title = await page.title();
        const text = await page.evaluate(() => document.body?.innerText ?? '');
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: ((a as HTMLAnchorElement).innerText || a.getAttribute('aria-label') || '').trim().slice(0, 120),
          })),
        );
        return {
          requestedUrl: url, finalUrl: page.url(), httpStatus, status: 'ok', title, html, text, links, error: null,
          async screenshot() {
            const jpeg = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 });
            return new Uint8Array(
              await sharp(jpeg).resize({ width: 1366, height: maxHeight, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer(),
            );
          },
          close: () => ctx.close(),
        };
      } catch (err) {
        await context?.close().catch(() => {});
        if (err instanceof errors.TimeoutError) return emptyPage(url, 'timeout', err.message);
        return emptyPage(url, 'error', err instanceof Error ? err.message : String(err));
      }
    },
    async close() {
      if (browser) await (await browser).close();
      browser = null;
    },
  };
}
