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
});
