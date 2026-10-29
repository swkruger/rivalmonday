import { expect, test, type Page } from '@playwright/test';
import { mockApp, overflow, sitemapPaths, watchProblems } from './helpers';

const ORIGIN = 'https://rivalmonday.com';
const NEW_PAGES = [
  '/integrations',
  '/integrations/stripe',
  '/sources',
  '/sources/ads',
  '/compare',
  '/compare/brightlocal',
  '/pricing',
  '/partners',
];

async function ldJson(page: Page): Promise<unknown[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((t) => JSON.parse(t) as unknown);
}

/** All `@type` values in a JSON-LD blob (handles arrays and `@graph`). */
function types(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(types);
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const own = typeof o['@type'] === 'string' ? [o['@type']] : Array.isArray(o['@type']) ? (o['@type'] as string[]) : [];
    return [...own, ...types(o['@graph'] ?? [])];
  }
  return [];
}

test.describe('no horizontal overflow on new pages', () => {
  for (const path of NEW_PAGES) {
    test(`page ${path}`, async ({ page }) => {
      await mockApp(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const { sw, cw } = await overflow(page);
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }

  test('header fits at 1024', async ({ page }) => {
    await mockApp(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { sw, cw } = await overflow(page);
    expect(sw).toBeLessThanOrEqual(cw);
  });

  test('every sitemap page at 390 and at 1024', async ({ page, request }) => {
    test.setTimeout(180_000);
    await mockApp(page);
    const paths = await sitemapPaths(request);
    expect(paths.length).toBeGreaterThan(10);
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const { sw, cw } = await overflow(page);
        expect(sw, `${path} at ${width}`).toBeLessThanOrEqual(cw);
      }
    }
  });
});

test('no csp violations or console errors on new pages', async ({ page }) => {
  const watch = await watchProblems(page);
  await mockApp(page);
  const violations: string[] = [];
  for (const path of NEW_PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    violations.push(...(await watch.csp()));
  }
  expect(violations).toEqual([]);
  expect(watch.problems).toEqual([]);
});

test.describe('compare toggle', () => {
  test('a disabled rival is a 404 with the site shell', async ({ page }) => {
    await mockApp(page);
    const res = await page.goto('/compare/visualping');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('an enabled rival is 200 with its fact date', async ({ page }) => {
    await mockApp(page);
    const res = await page.goto('/compare/brightlocal');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/Facts checked/)).toBeVisible();
  });

  test('sitemap, llms.txt, hub and footer never mention the disabled rival', async ({ page, request }) => {
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('visualping');
    expect(await (await request.get('/llms.txt')).text()).not.toContain('visualping');
    await mockApp(page);
    for (const path of ['/compare', '/']) {
      await page.goto(path);
      await expect(page.locator('a[href*="visualping"]')).toHaveCount(0);
      await expect(page.locator('footer a[href="/compare/brightlocal"]')).toHaveCount(1);
    }
  });

  test('a disabled rival has no og image', async ({ request }) => {
    expect((await request.get('/compare/visualping/opengraph-image')).status()).toBe(404);
  });

  test('no static chunk any page loads contains the disabled rival', async ({ page, request }) => {
    test.setTimeout(120_000);
    await mockApp(page);
    const chunks = new Set<string>();
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/_next/static/')) chunks.add(u.pathname);
    });
    for (const path of ['/', '/compare', '/compare/brightlocal', '/pricing', '/integrations', '/sources']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(chunks.size).toBeGreaterThan(0);
    const leaking: string[] = [];
    for (const c of chunks) if ((await (await request.get(c)).text()).includes('Visualping')) leaking.push(c);
    expect(leaking).toEqual([]);
  });
});

test.describe('structured data', () => {
  test('every ld+json block parses on every sitemap page', async ({ page, request }) => {
    test.setTimeout(120_000);
    await mockApp(page);
    for (const path of await sitemapPaths(request)) {
      await page.goto(path);
      await ldJson(page); // throws on invalid JSON
    }
  });

  test('home has Organization and SoftwareApplication', async ({ page }) => {
    await mockApp(page);
    await page.goto('/');
    const t = (await ldJson(page)).flatMap(types);
    expect(t).toContain('Organization');
    expect(t).toContain('SoftwareApplication');
  });

  test('pricing FAQPage questions equal the visible summaries', async ({ page }) => {
    await mockApp(page);
    await page.goto('/pricing');
    const faq = (await ldJson(page)).flat().find((n) => types(n).includes('FAQPage')) as { mainEntity: { name: string }[] } | undefined;
    expect(faq).toBeDefined();
    const visible = (await page.locator('details > summary').allTextContents()).map((s) => s.trim());
    expect(visible.length).toBeGreaterThan(0);
    expect(faq!.mainEntity.map((q) => q.name)).toEqual(visible);
  });

  test('a compare page has BreadcrumbList', async ({ page }) => {
    await mockApp(page);
    await page.goto('/compare/brightlocal');
    expect((await ldJson(page)).flatMap(types)).toContain('BreadcrumbList');
  });

  for (const path of ['/how-it-works', '/sample-brief', '/privacy', '/terms']) {
    test(`${path} has BreadcrumbList`, async ({ page }) => {
      await mockApp(page);
      await page.goto(path);
      expect((await ldJson(page)).flatMap(types)).toContain('BreadcrumbList');
    });
  }
});

test('og images: absolute url, served locally as png, canonical on the real domain', async ({ page, request }) => {
  test.setTimeout(120_000);
  await mockApp(page);
  for (const path of ['/', ...NEW_PAGES]) {
    await page.goto(path);
    const og = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(og, `${path} og:image`).toMatch(new RegExp(`^${ORIGIN}/`));
    const res = await request.get(new URL(og!).pathname);
    expect(res.status(), `${path} og image status`).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical === ORIGIN + path || (path === '/' && canonical === ORIGIN), `${path} canonical ${canonical}`).toBe(true);
  }
});

test('rendered pages never name a data vendor', async ({ page, request }) => {
  test.setTimeout(120_000);
  await mockApp(page);
  for (const path of await sitemapPaths(request)) {
    await page.goto(path);
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    expect(html, path).not.toMatch(/dataforseo|apify|scrapecreators|stadia/i);
  }
});

test('pricing pilot off shows trial cards', async ({ page }) => {
  await mockApp(page, { pilotMode: false });
  await page.goto('/pricing');
  const agency = page.locator('[data-slot="plan-agency"]');
  await expect(agency).toContainText('free trial');
  await expect(agency).not.toContainText('Free during the pilot');
  await expect(page.locator('[data-slot="plan-business"]')).not.toContainText('Free during the pilot');
});
