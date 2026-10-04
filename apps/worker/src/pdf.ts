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
 * Renders print HTML with Chromium: JavaScript off, every request blocked except `allowUrls` (the agency's https logo),
 * so neither a scraped string nor a tracking pixel can make the worker fetch anything. One browser, reused.
 */
export function createPdfRenderer(): PdfRenderer & { close(): Promise<void> } {
  let browser: Promise<Browser> | null = null;
  const getBrowser = () => (browser ??= chromium.launch({ headless: true }).catch((err) => {
    browser = null;
    throw err;
  }));
  const render: PdfRenderer = async (html, meta, opts) => {
    const context = await (await getBrowser()).newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      const allow = new Set(opts.allowUrls);
      await page.route('**/*', (route) => (allow.has(route.request().url()) ? route.continue() : route.abort()));
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
      return cleanPdfMetadata(new Uint8Array(pdf), meta, new Date());
    } finally {
      await context.close();
    }
  };
  return Object.assign(render, {
    async close() {
      if (browser) await (await browser).close().catch(() => {});
      browser = null;
    },
  });
}
