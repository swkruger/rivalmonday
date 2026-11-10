import { expect, test, type Page } from '@playwright/test';
import { HOME_ANCHORS } from '../content/home';
import { mockApp, overflow, sitemapPaths, watchProblems } from './helpers';

const ORIGIN = 'https://rivalmonday.com';
const NEW_PAGES = [
  '/integrations',
  '/integrations/stripe',
  '/sources',
  '/sources/ads',
  '/compare',
  '/compare/brightlocal',
  '/agencies',
  '/business',
  '/agencies/pricing',
  '/business/pricing',
  '/partners',
  '/roadmap',
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

  /** One line and no overflow: the container is one `min-h-16` row, every shown part sits inside it and inside the viewport. */
  async function headerFit(page: Page, path: string, width: number) {
    await page.setViewportSize({ width, height: 768 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => {
      const header = document.querySelector('header')!;
      const box = header.firstElementChild as HTMLElement;
      const parts = [...box.children].filter((e) => e.getClientRects().length > 0).map((e) => e.getBoundingClientRect());
      const inner = box.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(box).paddingLeft) + parseFloat(getComputedStyle(box).paddingRight);
      return {
        vw: document.documentElement.clientWidth,
        sw: document.documentElement.scrollWidth,
        boxHeight: Math.round(inner.height),
        boxScroll: box.scrollWidth - box.clientWidth,
        // The parts' own widths plus the bar's 16 px column gap (`gap-x-4`): what the bar needs, whatever `justify-between` spreads.
        content: Math.round(parts.reduce((s, r) => s + r.width, 0) + 16 * (parts.length - 1)),
        room: Math.round(inner.width - pad),
        maxRight: Math.round(Math.max(...parts.map((r) => r.right))),
        // Every shown part's vertical centre lies on one line.
        centres: parts.map((r) => Math.round(r.top + r.height / 2)),
      };
    });
    console.log(`HEADER ${path} @${width}: content ${m.content}px of ${m.room}px room (viewport ${m.vw}px), height ${m.boxHeight}px`);
    expect(m.sw, `${path} @${width} page overflow`).toBeLessThanOrEqual(m.vw);
    expect(m.boxScroll, `${path} @${width} header overflow`).toBeLessThanOrEqual(0);
    expect(m.maxRight, `${path} @${width} right edge`).toBeLessThanOrEqual(m.vw);
    expect(m.boxHeight, `${path} @${width} one line`).toBeLessThanOrEqual(65);
    expect(Math.max(...m.centres) - Math.min(...m.centres), `${path} @${width} one row`).toBeLessThanOrEqual(8);
    return m;
  }

  test('the header fits at 1024 px on both sides', async ({ page }) => {
    await mockApp(page);
    for (const path of ['/agencies', '/business']) {
      await headerFit(page, path, 1024);
      // Below 1280 px the menu lives in the sheet: with it open, how many Audience navs does the accessibility tree hold?
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const navs = await page.getByRole('navigation', { name: 'Audience' }).count();
      console.log(`AUDIENCE navs in the accessibility tree at 1024 with the sheet open (${path}): ${navs}`);
      test.info().annotations.push({ type: 'audience-navs', description: `${path}: ${navs}` });
      await page.keyboard.press('Escape');
    }
  });

  test('the header stays on one line at 1280 and 1440 on both sides', async ({ page }) => {
    await mockApp(page);
    for (const width of [1280, 1440]) {
      for (const path of ['/agencies', '/business']) await headerFit(page, path, width);
    }
  });

  test('no overflow at 390 and 1024', async ({ page }) => {
    test.setTimeout(90_000);
    await mockApp(page);
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/', '/agencies', '/business', '/agencies/pricing', '/business/pricing']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const { sw, cw } = await overflow(page);
        expect(sw, `${path} at ${width}`).toBeLessThanOrEqual(cw);
      }
    }
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
    for (const path of ['/', '/agencies', '/business', '/compare', '/compare/brightlocal', '/agencies/pricing', '/business/pricing', '/integrations', '/sources']) {
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

  for (const path of ['/', '/agencies']) {
    test(`${path} has Organization and SoftwareApplication`, async ({ page }) => {
      await mockApp(page);
      await page.goto(path);
      const t = (await ldJson(page)).flatMap(types);
      expect(t).toContain('Organization');
      expect(t).toContain('SoftwareApplication');
    });
  }

  test('/business has Organization and no SoftwareApplication (it carries the agency offer)', async ({ page }) => {
    await mockApp(page);
    await page.goto('/business');
    const t = (await ldJson(page)).flatMap(types);
    expect(t).toContain('Organization');
    expect(t).not.toContain('SoftwareApplication');
  });

  for (const path of ['/agencies/pricing', '/business/pricing']) {
    test(`${path} FAQPage questions equal the visible summaries`, async ({ page }) => {
      await mockApp(page);
      await page.goto(path);
      const faq = (await ldJson(page)).flat().find((n) => types(n).includes('FAQPage')) as { mainEntity: { name: string }[] } | undefined;
      expect(faq).toBeDefined();
      const visible = (await page.locator('details > summary').allTextContents()).map((s) => s.trim());
      expect(visible.length).toBeGreaterThan(0);
      expect(faq!.mainEntity.map((q) => q.name)).toEqual(visible);
    });
  }

  for (const path of ['/agencies/pricing', '/business/pricing']) {
    test(`${path} has BreadcrumbList`, async ({ page }) => {
      await mockApp(page);
      await page.goto(path);
      expect((await ldJson(page)).flatMap(types)).toContain('BreadcrumbList');
    });
  }

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
  await page.goto('/agencies/pricing');
  const agency = page.locator('[data-slot="plan-agency"]');
  await expect(agency).toContainText('free trial');
  await expect(agency).not.toContainText('Free during the pilot');
  await page.goto('/business/pricing');
  await expect(page.locator('[data-slot="plan-business"]')).not.toContainText('Free during the pilot');
});

test('the pricing chip is readable', async ({ page }) => {
  await mockApp(page);
  for (const [path, slot] of [['/agencies/pricing', 'plan-agency'], ['/business/pricing', 'plan-business']] as const) {
    await page.goto(path);
    const chip = page.locator(`[data-slot="${slot}"] [data-slot="plan-chip"]`);
    await expect(chip).toHaveCount(1);
    await expect(chip).toBeVisible();
    // WCAG contrast of the chip's text over what is really behind it. A canvas turns any CSS colour (oklch, color-mix) into sRGB,
    // and the chip's own and every ancestor's background are painted in order over white, so translucent layers count.
    const ratio = await chip.evaluate((el) => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const paint = (css: string) => {
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
      };
      const read = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) as [number, number, number];
      ctx.canvas.width = ctx.canvas.height = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1, 1);
      const layers: string[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') layers.unshift(bg);
      }
      layers.forEach(paint);
      const back = read();
      paint(getComputedStyle(el).color);
      const text = read();
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const [hi, lo] = [lum(back), lum(text)].sort((a, b) => b - a);
      return (hi! + 0.05) / (lo! + 0.05);
    });
    console.log(`CHIP ${path} contrast ${ratio.toFixed(2)}:1`);
    expect(ratio, `${path} chip contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test('the agencies page is shorter', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only (1440)');
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApp(page);
  await page.goto('/agencies');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#live')).toBeVisible();
  const m = await page.evaluate((ids) => {
    const h = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().height) : -1);
    const w = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().width) : -1);
    const plan = document.querySelector('[data-slot="plan-line"]');
    const grid = document.querySelector('#commercial div.grid');
    return {
      total: document.documentElement.scrollHeight,
      hero: h(document.querySelector('[data-slot="hero"]')),
      sections: ids.map((id) => ({ id, px: h(document.getElementById(id)) })),
      gap: grid ? getComputedStyle(grid).columnGap : 'none',
      plan: w(plan),
      container: w(plan?.parentElement ?? null),
    };
  }, [...HOME_ANCHORS]);
  console.log(`HEIGHT hero ${m.hero}`);
  for (const s of m.sections) console.log(`HEIGHT ${s.id} ${s.px}`);
  console.log(`HEIGHT total ${m.total}`);
  console.log(`GAP commercial ${m.gap}`);
  console.log(`WIDTH plan-line ${m.plan}`);
  console.log(`WIDTH commercial-container ${m.container}`);
  expect(m.total).toBeLessThanOrEqual(11_500);
});
