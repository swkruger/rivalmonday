import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../../test/fixtures-server';
import { SsrfBlockedError } from '../net/guard';
import { createPlaywrightRenderer } from './renderer';

let server: Awaited<ReturnType<typeof startFixtureServer>>;
// The fixtures live on 127.0.0.1, which the default guard refuses: these tests admit them explicitly.
const permissive = async () => {};
const renderer = createPlaywrightRenderer({ timeoutMs: 3000, assertUrl: permissive });
/** A guard that admits every fixture path except the listed ones. */
const refusing = (...paths: string[]) => async (u: string) => {
  if (paths.includes(new URL(u).pathname)) throw new SsrfBlockedError(u);
};

beforeAll(async () => {
  server = await startFixtureServer({
    '/ok': { body: '<html><head><title>Smith HVAC Pricing</title></head><body><h1>AC tune-up $99</h1><a href="/services">Services</a><a href="https://other.example/x">Out</a></body></html>' },
    '/forbidden': { status: 403, body: '<title>Just a moment...</title>' },
    '/slow': { body: '<html>late</html>', delayMs: 10_000 },
    '/missing': { status: 404, body: '<html><body>not found</body></html>' },
    '/broken': { status: 500, body: '<html><body>server error</body></html>' },
    '/hung': { body: '<html><body><script>while(true){}</script></body></html>' },
    '/redir': { status: 302, body: '', headers: { location: '/secret' } },
    '/hop1': { status: 301, body: '', headers: { location: '/hop2' } },
    '/hop2': { status: 302, body: '', headers: { location: '/secret' } },
    '/to-ok': { status: 302, body: '', headers: { location: '/ok' } },
    '/secret': { body: '<html><head><title>Internal admin</title></head><body>secret</body></html>' },
    '/with-sub': { body: '<html><head><title>Has images</title></head><body><p>Visible text</p><img src="/secret-img"><img src="/img-redir"><iframe src="/frame-redir"></iframe><script src="/secret-js"></script></body></html>' },
    '/img-redir': { status: 302, body: '', headers: { location: '/secret-img2' } },
    '/frame-redir': { status: 302, body: '', headers: { location: '/secret-frame' } },
    '/sw-page': {
      body: `<html><head><title>pending</title></head><body><script>
        navigator.serviceWorker.register('/sw.js').then(() => { document.title = 'sw registered'; }, () => { document.title = 'sw refused'; });
      </script></body></html>`,
    },
    '/sw.js': { body: "self.addEventListener('fetch', () => {});", contentType: 'text/javascript' },
    '/ws-page': {
      body: `<html><head><title>pending</title></head><body><script>
        const ws = new WebSocket(location.origin.replace('http', 'ws') + '/ws');
        ws.onopen = () => { document.title = 'ws open'; };
        ws.onclose = () => { document.title = 'ws closed'; };
      </script></body></html>`,
    },
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

  it('aborts a redirect to 127.0.0.1 (the guard admits only the start URL) and never requests it', async () => {
    const start = server.url('/redir');
    const guarded = createPlaywrightRenderer({ timeoutMs: 3000, assertUrl: async (u) => { if (u !== start) throw new SsrfBlockedError(u); } });
    try {
      const page = await guarded.render(start);
      expect(page).toMatchObject({ status: 'error', error: 'ssrf_blocked', requestedUrl: start, finalUrl: start, html: '' });
      await page.close();
      expect(server.hits).not.toContain('/secret');
    } finally {
      await guarded.close();
    }
  });

  it('checks every hop of a redirect chain', async () => {
    const guarded = createPlaywrightRenderer({ timeoutMs: 3000, assertUrl: refusing('/secret') });
    try {
      const page = await guarded.render(server.url('/hop1'));
      expect(page).toMatchObject({ status: 'error', error: 'ssrf_blocked' });
      await page.close();
      expect(server.hits).toContain('/hop2');
      expect(server.hits).not.toContain('/secret');
    } finally {
      await guarded.close();
    }
  });

  it('still follows an allowed redirect and reports where it landed', async () => {
    const page = await renderer.render(server.url('/to-ok'));
    try {
      expect(page).toMatchObject({ status: 'ok', httpStatus: 200, title: 'Smith HVAC Pricing', finalUrl: server.url('/ok') });
      expect(page.links).toContainEqual({ href: server.url('/services'), text: 'Services' });
    } finally {
      await page.close();
    }
  });

  it('refuses a blocked start URL without requesting it', async () => {
    const guarded = createPlaywrightRenderer({ timeoutMs: 3000, assertUrl: refusing('/secret') });
    try {
      const page = await guarded.render(server.url('/secret'));
      expect(page).toMatchObject({ status: 'error', error: 'ssrf_blocked' });
      expect(server.hits).not.toContain('/secret');
    } finally {
      await guarded.close();
    }
  });

  it('blocks a sub-resource to 127.0.0.1 (directly or via a redirect hop, image or iframe) but renders the page', async () => {
    const guarded = createPlaywrightRenderer({ timeoutMs: 3000, assertUrl: refusing('/secret-img', '/secret-img2', '/secret-frame', '/secret-js') });
    try {
      const page = await guarded.render(server.url('/with-sub'));
      try {
        expect(page).toMatchObject({ status: 'ok', httpStatus: 200, title: 'Has images', error: null });
        expect(page.text).toContain('Visible text');
      } finally {
        await page.close();
      }
      expect(server.hits).toEqual(expect.arrayContaining(['/with-sub', '/img-redir', '/frame-redir']));
      for (const p of ['/secret-img', '/secret-img2', '/secret-frame', '/secret-js']) expect(server.hits).not.toContain(p);
    } finally {
      await guarded.close();
    }
  });

  it('blocks service workers', async () => {
    const page = await renderer.render(server.url('/sw-page'));
    try {
      await new Promise((r) => setTimeout(r, 800));
      expect(server.hits).not.toContain('/sw.js');
    } finally {
      await page.close();
    }
  });

  it('closes every WebSocket before it reaches the network', async () => {
    const page = await renderer.render(server.url('/ws-page'));
    try {
      await new Promise((r) => setTimeout(r, 800));
      expect(server.upgrades).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it('uses the public-address guard by default (the 127.0.0.1 fixture is refused)', async () => {
    const strict = createPlaywrightRenderer({ timeoutMs: 3000 });
    try {
      const before = server.hits.length;
      const page = await strict.render(server.url('/ok'));
      expect(page).toMatchObject({ status: 'error', error: 'ssrf_blocked' });
      expect(server.hits.length).toBe(before);
    } finally {
      await strict.close();
    }
  });
});
