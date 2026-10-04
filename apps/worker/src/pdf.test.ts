import { PDFDocument } from 'pdf-lib';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanPdfMetadata, createPdfRenderer } from './pdf';

const renderer = createPdfRenderer();
afterAll(() => renderer.close());
const meta = { title: 'A1 HVAC — weekly competitor brief 2026-10-05', author: 'Acme Marketing', subject: 'Weekly competitor brief' };

describe('pdf', () => {
  it('renders HTML to a PDF whose metadata names the agency and carries no browser fingerprint', async () => {
    const html = '<html><head><title>x</title></head><body><h1>Hello</h1><img src="https://tracker.example/pixel.png"></body></html>';
    const bytes = await renderer(html, meta, { allowUrls: [] });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe(meta.title);
    expect(doc.getAuthor()).toBe('Acme Marketing');
    expect(doc.getCreator()).toBe('Acme Marketing');
    expect(doc.getProducer()).toBe('Acme Marketing');
    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw).not.toMatch(/HeadlessChrome|Chromium|Skia/);
  }, 60_000);

  it('cleans metadata of an existing PDF', async () => {
    const src = await PDFDocument.create();
    src.addPage();
    src.setProducer('Skia/PDF m140');
    src.setCreator('Mozilla/5.0 HeadlessChrome');
    const out = await PDFDocument.load(await cleanPdfMetadata(await src.save(), meta, new Date('2026-10-05T12:00:00Z')), { updateMetadata: false });
    expect([out.getProducer(), out.getCreator(), out.getModificationDate()?.toISOString()]).toEqual(['Acme Marketing', 'Acme Marketing', '2026-10-05T12:00:00.000Z']);
  });

  it('recovers when the cached browser disconnects after a successful render (worker is long-lived)', async () => {
    const launched: Browser[] = [];
    const recovering = createPdfRenderer(async () => {
      const b = await chromium.launch({ headless: true });
      launched.push(b);
      return b;
    });
    try {
      const html = '<html><body><h1>One</h1></body></html>';
      await recovering(html, meta, { allowUrls: [] });
      expect(launched).toHaveLength(1);

      await launched[0]!.close(); // simulates the browser process dying underneath us, without renderer.close() being called

      const bytes = await recovering(html, meta, { allowUrls: [] });
      expect(launched).toHaveLength(2); // relaunched instead of reusing the dead handle
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    } finally {
      await recovering.close();
    }
  }, 60_000);
});
