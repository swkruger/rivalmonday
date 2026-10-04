import type { PdfMeta, PdfRenderer } from '@cs/email';
import { PDFDocument, PDFName } from 'pdf-lib';
import { type Browser, chromium } from 'playwright';

/** Decision 16: replace every Info field with the agency's, drop keywords and the XMP stream (no browser fingerprint). */
export async function cleanPdfMetadata(bytes: Uint8Array, meta: PdfMeta, now: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setTitle(meta.title, { showInWindowTitleBar: true });
  doc.setAuthor(meta.author);
  doc.setSubject(meta.subject);
  doc.setCreator(meta.author);
  doc.setProducer(meta.author);
  doc.setKeywords([]);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  doc.catalog.delete(PDFName.of('Metadata'));
  return doc.save();
}

/**
 * Caches a single launched Browser, but never hands back one that has died: a cached promise for a
 * crashed/disconnected browser would otherwise poison the long-lived worker forever (every later
 * render would try to use a dead connection). Mirrors packages/collectors/src/web/renderer.ts's
 * createBrowserCache, which this worker cannot import (not part of @cs/collectors's public API).
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
      // drop the cache so the next render relaunches instead of reusing a dead handle.
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
    if (b) await b.close().catch(() => {});
  }

  return { get, close };
}

/**
 * Renders print HTML with Chromium: JavaScript off, every request blocked except `allowUrls` (the agency's https logo),
 * so neither a scraped string nor a tracking pixel can make the worker fetch anything. One browser, reused across
 * renders via `createBrowserCache` — never a dead one.
 */
export function createPdfRenderer(launch: () => Promise<Browser> = () => chromium.launch({ headless: true })): PdfRenderer & { close(): Promise<void> } {
  const cache = createBrowserCache(launch);
  const render: PdfRenderer = async (html, meta, opts) => {
    const context = await (await cache.get()).newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      const allow = new Set(opts.allowUrls);
      await page.route('**/*', (route) => (allow.has(route.request().url()) ? route.continue() : route.abort()));
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
      return cleanPdfMetadata(new Uint8Array(pdf), meta, new Date());
    } finally {
      await context.close().catch(() => {});
    }
  };
  return Object.assign(render, { close: cache.close });
}
