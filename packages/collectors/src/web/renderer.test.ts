import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../../test/fixtures-server';
import { createPlaywrightRenderer } from './renderer';

let server: Awaited<ReturnType<typeof startFixtureServer>>;
const renderer = createPlaywrightRenderer({ timeoutMs: 3000 });

beforeAll(async () => {
  server = await startFixtureServer({
    '/ok': { body: '<html><head><title>Smith HVAC Pricing</title></head><body><h1>AC tune-up $99</h1><a href="/services">Services</a><a href="https://other.example/x">Out</a></body></html>' },
    '/forbidden': { status: 403, body: '<title>Just a moment...</title>' },
    '/slow': { body: '<html>late</html>', delayMs: 10_000 },
    '/missing': { status: 404, body: '<html><body>not found</body></html>' },
    '/broken': { status: 500, body: '<html><body>server error</body></html>' },
    '/hung': { body: '<html><body><script>while(true){}</script></body></html>' },
  });
});
afterAll(async () => {
  await renderer.close();
  await server.close();
});

describe('Playwright renderer', () => {
  it('renders title, visible text, absolute links and a WebP screenshot', async () => {
    const page = await renderer.render(server.url('/ok'));
    try {
      expect(page).toMatchObject({ status: 'ok', httpStatus: 200, title: 'Smith HVAC Pricing', error: null });
      expect(page.text).toContain('AC tune-up $99');
      expect(page.html).toContain('<h1>AC tune-up $99</h1>');
      expect(page.links).toContainEqual({ href: server.url('/services'), text: 'Services' });
      const shot = await page.screenshot();
      expect(new TextDecoder().decode(shot.subarray(8, 12))).toBe('WEBP');
    } finally {
      await page.close();
    }
  });

  it('flags bot challenges as blocked', async () => {
    const page = await renderer.render(server.url('/forbidden'));
    expect(page).toMatchObject({ status: 'blocked', httpStatus: 403 });
    await page.close();
  });

  it('reports timeouts', async () => {
    const page = await renderer.render(server.url('/slow'));
    expect(page.status).toBe('timeout');
    await page.close();
  });

  it('treats a 404 page as an error capture, not a successful one', async () => {
    const page = await renderer.render(server.url('/missing'));
    expect(page).toMatchObject({ status: 'error', httpStatus: 404, error: 'HTTP 404' });
    await page.close();
  });

  it('treats a 500 page as an error capture, not a successful one', async () => {
    const page = await renderer.render(server.url('/broken'));
    expect(page).toMatchObject({ status: 'error', httpStatus: 500, error: 'HTTP 500' });
    await page.close();
  });

  it('times out a page whose script hangs forever, and recovers for the next render', async () => {
    const page = await renderer.render(server.url('/hung'));
    expect(page.status).toBe('timeout');
    await page.close();

    // The hang must not poison the renderer's browser/context for subsequent captures.
    const ok = await renderer.render(server.url('/ok'));
    expect(ok.status).toBe('ok');
    await ok.close();
  });
});
