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

  it('data: image/png URI renders while every request is aborted', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=';
    const withData = `<html><body><img width="100" height="100" src="data:image/png;base64,${png}"></body></html>`;
    const withBoth = `<html><body><img width="100" height="100" src="data:image/png;base64,${png}"><img width="50" height="50" src="https://example.invalid/x.png"></body></html>`;
    const withNet = '<html><body><img width="50" height="50" src="https://example.invalid/x.png"></body></html>';
    // Test-only seam: the launch hook wraps the page's `route` so the test sees every request URL the renderer's handler receives.
    const routed: string[] = [];
    const spied = createPdfRenderer(async () => {
      const b = await chromium.launch({ headless: true });
      const newContext = b.newContext.bind(b);
      b.newContext = (async (o?: Parameters<typeof newContext>[0]) => {
        const ctx = await newContext(o);
        const newPage = ctx.newPage.bind(ctx);
        ctx.newPage = (async () => {
          const page = await newPage();
          const route = page.route.bind(page);
          page.route = ((url: Parameters<typeof route>[0], h: Parameters<typeof route>[1]) => route(url, (r, q) => (routed.push(q.url()), h(r, q)))) as typeof page.route;
          return page;
        }) as typeof ctx.newPage;
        return ctx;
      }) as typeof b.newContext;
      return b;
    });
    try {
      // The aborted network image leaves Chromium's 14x16 broken-image icon; the embedded PNG is the only 2x2 image XObject.
      const images = async (html: string) => (Buffer.from(await spied(html, meta, { allowUrls: [] })).toString('latin1').match(/\/Subtype \/Image\s+\/Width 2\s+\/Height 2\b/g) ?? []).length;
      expect(await images(withNet)).toBe(0); // the network image is aborted
      expect(routed.some((u) => u.startsWith('https://example.invalid/'))).toBe(true); // the spy sees real requests
      routed.length = 0;
      expect(await images(withData)).toBe(1); // the data: image is not blocked
      expect(await images(withBoth)).toBe(1); // only the data one
      expect(routed.filter((u) => u.startsWith('data:'))).toEqual([]); // the route handler never saw a data: request
    } finally {
      await spied.close();
    }
  }, 60_000);

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
