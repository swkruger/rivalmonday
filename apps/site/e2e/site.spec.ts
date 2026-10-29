import { expect, test, type Page, type Route } from '@playwright/test';

const APP = 'https://app.e2e.test';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
const COUNTERS = { rivalSitesWatched: 120, snapshotsThisWeek: 940, claimsChecked: 2300, claimsDropped: 41 };

type Mocks = { pilotMode?: boolean; counters?: typeof COUNTERS | null; waitlist?: { status: number; body: unknown } };

/** Routes the app's two public endpoints (no real network). Returns the waitlist request bodies seen. */
async function mockApp(page: Page, m: Mocks = {}): Promise<unknown[]> {
  const bodies: unknown[] = [];
  const reply = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  await page.route(`${APP}/api/site-status`, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : reply(route, 200, { pilotMode: m.pilotMode ?? true, counters: m.counters === undefined ? COUNTERS : m.counters }),
  );
  await page.route(`${APP}/api/waitlist`, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    bodies.push(route.request().postDataJSON());
    const w = m.waitlist ?? { status: 200, body: { ok: true } };
    return reply(route, w.status, w.body);
  });
  return bodies;
}

const dialog = (page: Page) => page.getByRole('dialog');
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

async function openJoin(page: Page) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await dialog(page).getByRole('button', { name: 'Join the pilot' }).click();
  } else {
    await page.locator('header').getByRole('button', { name: 'Join the pilot' }).click();
  }
  await expect(dialog(page).getByRole('heading', { name: 'Join the Rival Monday pilot' })).toBeVisible();
}

async function overflow(page: Page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
}

const firstClaim = (page: Page) => page.locator('[data-item] button[aria-haspopup="dialog"]').first();

test('home renders the decided headline', async ({ page }) => {
  await mockApp(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Every Monday, your clients learn what their competitors did last week, under your brand.',
  );
});

test.describe('no horizontal overflow', () => {
  for (const path of ['/', '/sample-brief', '/how-it-works', '/privacy', '/terms', '/no-such-page']) {
    test(`page ${path}`, async ({ page }) => {
      await mockApp(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const { sw, cw } = await overflow(page);
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }

  test('with the join dialog open', async ({ page }) => {
    await mockApp(page);
    await page.goto('/');
    await openJoin(page);
    const first = await overflow(page);
    expect(first.sw).toBeLessThanOrEqual(first.cw);
    // The longest form too.
    await dialog(page).getByText('I run an agency').click();
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await dialog(page).getByLabel(/Send me a real sample brief/).check();
    const second = await overflow(page);
    expect(second.sw).toBeLessThanOrEqual(second.cw);
  });

  test('with the sample evidence sheet open', async ({ page }) => {
    await mockApp(page);
    await page.goto('/sample-brief');
    await firstClaim(page).click();
    await expect(dialog(page)).toBeVisible();
    const { sw, cw } = await overflow(page);
    expect(sw).toBeLessThanOrEqual(cw);
  });
});

test('no csp violations or console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}`);
    });
  });
  await mockApp(page);
  const violations: string[] = [];
  for (const path of ['/', '/sample-brief', '/how-it-works', '/privacy', '/terms']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if (path === '/') {
      await openJoin(page);
      await page.keyboard.press('Escape');
    }
    if (path === '/sample-brief') {
      await firstClaim(page).click();
      await expect(dialog(page)).toBeVisible();
    }
    violations.push(...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)));
  }
  // Known, harmless: zod 4 probes `Function('')` inside try/catch to choose its JIT path; the CSP (no unsafe-eval) reports
  // that probe as a script-src "eval" violation and zod falls back. Anything else (or eval from a non-site chunk) fails.
  const unexpected = violations.filter((v) => !/^script-src eval http:\/\/localhost:\d+\/_next\/static\/chunks\//.test(v));
  expect(unexpected).toEqual([]);
  expect(problems).toEqual([]);
});

test('security headers present', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  const csp = h['content-security-policy']!;
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain(`connect-src 'self' ${APP}`);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain('upgrade-insecure-requests');
  expect(h['strict-transport-security']).toContain('max-age=63072000');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
});

test('agency join flow posts a valid body and shows the done state', async ({ page }) => {
  const bodies = await mockApp(page);
  await page.goto('/');
  await openJoin(page);
  const d = dialog(page);
  await d.getByText('I run an agency').click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByLabel('Your name').fill('Ada Agency');
  await d.getByLabel('Work email').fill('ada@agency.example');
  await d.getByLabel('Agency name').fill('Ada Digital');
  await d.getByLabel('Local-business clients').selectOption('6-15');
  await d.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(d.getByRole('heading', { name: /You're on the list/ })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    kind: 'agency',
    contactName: 'Ada Agency',
    email: 'ada@agency.example',
    orgName: 'Ada Digital',
    clientCountBand: '6-15',
    turnstileToken: 'no-widget',
  });
  expect(bodies[0]).not.toHaveProperty('sample');
});

async function fillBusiness(page: Page, vertical: 'other' | 'first') {
  const d = dialog(page);
  await d.getByText('I own a local business').click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByLabel('Your name').fill('Bo Owner');
  await d.getByLabel('Email').fill('bo@shop.example');
  await d.getByLabel('Business name').fill('Bo Bakery');
  await d.getByLabel('or city / ZIP').fill('Austin, TX');
  if (vertical === 'other') {
    await d.getByLabel('Type of business').selectOption('other');
    await d.getByLabel('Describe your business').fill('Artisan bakery');
  } else {
    await d.getByLabel('Type of business').selectOption({ index: 1 });
  }
}

test('business join flow with Other', async ({ page }) => {
  const bodies = await mockApp(page);
  await page.goto('/');
  await openJoin(page);
  await fillBusiness(page, 'other');
  await dialog(page).getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(dialog(page).getByRole('heading', { name: /You're on the list/ })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    kind: 'business',
    contactName: 'Bo Owner',
    email: 'bo@shop.example',
    orgName: 'Bo Bakery',
    location: 'Austin, TX',
    verticalOther: 'Artisan bakery',
    turnstileToken: 'no-widget',
  });
  expect(bodies[0]).not.toHaveProperty('verticalId');
});

test('400 check shows the check message', async ({ page }) => {
  await mockApp(page, { waitlist: { status: 400, body: { error: 'check' } } });
  await page.goto('/');
  await openJoin(page);
  await fillBusiness(page, 'first');
  await dialog(page).getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText("The check didn't go through. Please try it again.");
  await expect(dialog(page).getByRole('heading', { name: /You're on the list/ })).toHaveCount(0);
});

test('pilot off swaps the CTA to sign-up', async ({ page }) => {
  await mockApp(page, { pilotMode: false });
  await page.goto('/');
  if (isPhone(page)) await page.getByRole('button', { name: 'Menu' }).click();
  const scope = isPhone(page) ? dialog(page) : page.locator('header');
  await expect(scope.getByRole('link', { name: 'Start your free trial' })).toHaveAttribute('href', `${APP}/sign-up`);
  await expect(scope.getByRole('button', { name: 'Join the pilot' })).toHaveCount(0);
});

test('counters hidden when null', async ({ page }) => {
  // Degraded answer: no counters section, and the site stays in pilot mode even though pilotMode says false.
  await mockApp(page, { counters: null, pilotMode: false });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#live')).toHaveCount(0);
  if (isPhone(page)) await page.getByRole('button', { name: 'Menu' }).click();
  const scope = isPhone(page) ? dialog(page) : page.locator('header');
  await expect(scope.getByRole('button', { name: 'Join the pilot' })).toBeVisible();
});

test('counters shown when present', async ({ page }) => {
  await mockApp(page);
  await page.goto('/');
  await expect(page.locator('#live')).toBeVisible();
  await expect(page.getByLabel('Live platform numbers')).toContainText('120+');
});

test('sample claim opens evidence; slider changes week; friday answer cites', async ({ page }) => {
  await mockApp(page);
  await page.goto('/sample-brief');
  const claim = firstClaim(page);
  await claim.click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(claim).toBeFocused();

  // The rank grid's week control, if the sample has a slider.
  const slider = page.getByRole('slider').first();
  if ((await slider.count()) > 0) {
    const before = await slider.inputValue();
    await slider.press('ArrowLeft');
    expect(await slider.inputValue()).not.toBe(before);
  }

  await page.getByRole('button', { name: 'What changed with Quillstone Climate Pros?' }).click();
  const pill = page.getByTestId('friday-answer').locator('button[aria-haspopup="dialog"]').first();
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(dialog(page)).toBeVisible();
});

test('unknown path is 404 with the site shell', async ({ page }) => {
  await mockApp(page);
  const res = await page.goto('/definitely-not-here');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
});

test('robots disallows on a non-production build', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toMatch(/User-Agent: \*/i);
  expect(text).toMatch(/Disallow: \//);
  expect(text).not.toMatch(/Allow: \//);
});

test('Join the pilot from the mobile menu closes the menu and focuses the dialog', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'mobile menu only below lg');
  await mockApp(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Join the pilot' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(1);
  await expect(dialog(page).getByRole('heading', { name: 'Join the Rival Monday pilot' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
});

test.describe('hero fragments do not overlap', () => {
  for (const width of [1024, 1280]) {
    test(`at ${width}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'fixed widths set here');
      await mockApp(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const boxes = await page.evaluate(() =>
        ['brief', 'snapshot', 'friday'].map((n) => {
          const r = document.querySelector(`[data-fragment="${n}"]`)!.getBoundingClientRect();
          return { n, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.n} vs ${b.n}: ${JSON.stringify([a, b])}`).toBe(false);
        }
      }
    });
  }
});
