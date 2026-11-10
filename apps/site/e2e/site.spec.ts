import { expect, test, type Page } from '@playwright/test';
import { BUSINESS } from '../content/business';
import { CHOOSER, SWITCH } from '../content/chooser';
import { GALLERY } from '../content/gallery';
import { HERO } from '../content/home';
import { NAV_EXTRA } from '../content/pages';
import { PRICING } from '../content/pricing';
import { APP, mockApp, overflow } from './helpers';

const dialog = (page: Page) => page.getByRole('dialog');
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

const agencyHeadline = `${HERO.headline.lead} ${HERO.headline.mark}`;
const businessHeadline = `${BUSINESS.hero.headline.lead} ${BUSINESS.hero.headline.mark}`;
const chooserHeadline = `${CHOOSER.headline.lead} ${CHOOSER.headline.mark}`;
const AGENCY_FORM = 'About your agency';
const BUSINESS_FORM = 'About your business';
const CHOOSE_STEP = 'Join the Rival Monday pilot';
const businessMenuHrefs = NAV_EXTRA.filter((n) => n.side === 'business').map((n) => n.href);

/** Opens the popup from the page's own join button (header on desktop, the menu sheet below 1024 px). */
async function openJoin(page: Page, label: string = HERO.primaryCta) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await dialog(page).getByRole('button', { name: label, exact: true }).click();
  } else {
    await page.locator('header').getByRole('button', { name: label, exact: true }).click();
  }
}

/** Hrefs of the side's menu: the inline menu on desktop, the sheet's list on phones. */
async function menuHrefs(page: Page): Promise<string[]> {
  if (isPhone(page)) {
    await page.getByRole('button', { name: 'Menu' }).click();
    const links = dialog(page).getByRole('navigation', { name: 'Mobile' }).getByRole('link');
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    return hrefs;
  }
  const links = page.locator('header').getByRole('navigation', { name: 'Main' }).getByRole('link');
  return links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
}

const firstClaim = (page: Page) => page.locator('[data-item] button[aria-haspopup="dialog"]').first();

/** Runs the page's fake clock in one-second steps (real pauses between, so the pictures the gallery preloads can arrive). */
async function runClock(page: Page, ms: number) {
  for (let spent = 0; spent < ms; spent += 1000) {
    await page.clock.runFor(1000);
    await page.waitForTimeout(40);
  }
}

const gallery = (page: Page) => page.locator('[data-slot="hero-gallery"]');
const tab = (page: Page, label: string) => gallery(page).getByRole('tab', { name: label, exact: true });
const firstTab = GALLERY.slides[0]!.label;
const secondTab = GALLERY.slides[1]!.label;

test('agencies renders the decided headline', async ({ page }) => {
  await mockApp(page);
  await page.goto('/agencies');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(agencyHeadline);
});

test('/ shows the two doors and each leads to its side', async ({ page }) => {
  await mockApp(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chooserHeadline);
  // The chooser has no side: no audience switch, no join button, only Sign in.
  const header = page.locator('header');
  await expect(header.getByRole('navigation', { name: SWITCH.label })).toHaveCount(0);
  await expect(header.getByRole('button', { name: /^Join/ })).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const ids = await page.locator('[data-door]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-door')))]);
  expect(ids.sort()).toEqual(['agency', 'business']);
  for (const d of CHOOSER.doors) {
    await page.goto('/');
    const door = page.locator(`[data-door="${d.id}"]`).first();
    await expect(door).toBeVisible();
    await expect(door).toHaveAttribute('href', d.href);
    await door.click();
    await expect(page).toHaveURL(new RegExp(`${d.href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(d.id === 'agency' ? agencyHeadline : businessHeadline);
  }
});

test('each side shows its headline, its menu and its join button', async ({ page }) => {
  await mockApp(page);

  await page.goto('/agencies');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(agencyHeadline);
  const agencyHrefs = await menuHrefs(page);
  expect(agencyHrefs).toContain('/agencies/pricing');
  expect(agencyHrefs.filter((h) => h.startsWith('/business'))).toEqual([]);
  if (!isPhone(page)) {
    await expect(page.locator('header').getByRole('button', { name: HERO.primaryCta, exact: true })).toBeVisible();
    await expect(page.locator('header').getByRole('button', { name: BUSINESS.hero.primaryCta, exact: true })).toHaveCount(0);
  } else {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(dialog(page).getByRole('button', { name: HERO.primaryCta, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  }

  await page.goto('/business');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(businessHeadline);
  expect(await menuHrefs(page)).toEqual(businessMenuHrefs);
  if (!isPhone(page)) {
    await expect(page.locator('header').getByRole('button', { name: BUSINESS.hero.primaryCta, exact: true })).toBeVisible();
    await expect(page.locator('header').getByRole('button', { name: HERO.primaryCta, exact: true })).toHaveCount(0);
  } else {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(dialog(page).getByRole('button', { name: BUSINESS.hero.primaryCta, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test("the popup opens on the side's own form (agency)", async ({ page }) => {
  await mockApp(page);
  await page.goto('/agencies');
  await openJoin(page);
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: AGENCY_FORM })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect(d.getByRole('heading', { name: CHOOSE_STEP })).toHaveCount(0);
  await expect(d.getByRole('radiogroup')).toHaveCount(0);
});

test("the popup opens on the side's own form (business)", async ({ page }) => {
  await mockApp(page);
  await page.goto('/business');
  await openJoin(page, BUSINESS.hero.primaryCta);
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: BUSINESS_FORM })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect(d.getByRole('heading', { name: CHOOSE_STEP })).toHaveCount(0);
  await expect(d.getByRole('radiogroup')).toHaveCount(0);
});

test('on / the popup asks first', async ({ page }) => {
  await mockApp(page);
  await page.goto('/#join');
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: CHOOSE_STEP })).toBeVisible();
  await expect(d.getByRole('radiogroup', { name: 'Who are you?' })).toBeVisible();
  await d.getByText('I own a local business').click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await expect(d.getByRole('heading', { name: BUSINESS_FORM })).toBeVisible();
  // Reached through the choose step, so it has Back.
  await expect(d.getByRole('button', { name: 'Back' })).toBeVisible();
});

test('/agencies#join opens the agency form and /business#join the business form', async ({ page }) => {
  await mockApp(page);
  await page.goto('/agencies#join');
  await expect(dialog(page).getByRole('heading', { name: AGENCY_FORM })).toBeVisible();
  await page.goto('/business#join');
  await expect(dialog(page).getByRole('heading', { name: BUSINESS_FORM })).toBeVisible();
});

test('/pricing redirects permanently and keeps the query', async ({ request }) => {
  const res = await request.get('/pricing?utm_source=x', { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()['location']).toBe('/agencies/pricing?utm_source=x');
});

/** Every `PRICING.agency` amount as the site prints it (`$229`, `$2,290`, `$79`, `$59`). */
const money = (usd: number) => `$${usd.toLocaleString('en-US')}`;
const AGENCY_AMOUNTS = [...new Set([PRICING.agency.monthlyUsd, PRICING.agency.yearlyUsd, ...PRICING.agency.extraClientTiers.map((t) => t.usd)])];
/** A whole amount: `$79` does not match inside `$790`, `$79,000` or `$1,079`; `$229.00` still matches `$229`. */
const wholeAmount = (usd: number) => new RegExp(`${money(usd).replace(/[$]/g, '\\$')}(?!\\d|,\\d)`);
/** The same amount as a bare JSON number (`"price":229`, `"price":"229.00"`). */
const bareAmount = (usd: number) => new RegExp(`(?<![\\d.,$])${usd}(?!\\d|,\\d|\\.\\d*[1-9])`);

function agencyAmountsIn(text: string): string[] {
  return AGENCY_AMOUNTS.filter((n) => wholeAmount(n).test(text)).map(money);
}

test("the business side's source has no agency plan number", async ({ page, request }) => {
  // The one allowed overlap would be a business price equal to an agency amount; there is none by default.
  expect(AGENCY_AMOUNTS, `the business price ${PRICING.business.monthlyUsd} equals an agency amount: exclude exactly that collision here`).not.toContain(PRICING.business.monthlyUsd);
  // Positive control: on the agency pricing page the same matchers find every agency amount, so an empty scan below means absence, not a blind regex.
  const control = await (await request.get('/agencies/pricing')).text();
  expect(agencyAmountsIn(control).sort(), 'control: whole amounts on /agencies/pricing').toEqual(AGENCY_AMOUNTS.map(money).sort());
  // Its JSON-LD (SoftwareApplication offer) carries the monthly price as a bare number ("229.00" and 229); the tier and yearly amounts
  // appear there only inside "$..." description text, which the bare matcher rightly ignores.
  const controlLd = [...control.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).join('\n');
  expect(bareAmount(PRICING.agency.monthlyUsd).test(controlLd), 'control: bare monthly price in json-ld').toBe(true);
  for (const path of ['/business', '/business/pricing']) {
    const html = await (await request.get(path)).text();
    expect(html.length, `${path} html`).toBeGreaterThan(1000);
    expect(agencyAmountsIn(html), `${path} source`).toEqual([]);
    const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    for (const block of ld) {
      expect(AGENCY_AMOUNTS.filter((n) => bareAmount(n).test(block)), `${path} json-ld`).toEqual([]);
    }
  }
  // The popup opened on the business side, with the pilot on and off (the later mock answers first).
  for (const pilotMode of [true, false]) {
    await mockApp(page, { pilotMode });
    await page.goto('/business');
    await openJoin(page, BUSINESS.hero.primaryCta);
    const d = dialog(page);
    await expect(d.getByRole('heading', { name: BUSINESS_FORM })).toBeVisible();
    expect(agencyAmountsIn((await d.textContent()) ?? ''), `popup, pilot ${pilotMode}`).toEqual([]);
  }
  // The agency pricing page carries no business plan card.
  await mockApp(page);
  await page.goto('/agencies/pricing');
  await expect(page.locator('[data-slot="plan-agency"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="plan-business"]')).toHaveCount(0);
  await page.goto('/business/pricing');
  await expect(page.locator('[data-slot="plan-business"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="plan-agency"]')).toHaveCount(0);
});

test('moving between sides without a reload updates header, menu and popup', async ({ page }) => {
  await mockApp(page);
  const documents: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'document') documents.push(new URL(r.url()).pathname);
  });
  const clickSwitch = async (label: string) => {
    if (isPhone(page)) {
      await page.getByRole('button', { name: 'Menu' }).click();
      await dialog(page).getByRole('navigation', { name: SWITCH.label }).getByRole('link', { name: label, exact: true }).click();
    } else {
      await page.locator('header').getByRole('navigation', { name: SWITCH.label }).getByRole('link', { name: label, exact: true }).click();
    }
  };
  const marker = () => page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload);

  await page.goto('/agencies');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(agencyHeadline);
  await page.evaluate(() => {
    (window as unknown as { __noReload: number }).__noReload = 42;
  });
  expect(await menuHrefs(page)).toContain('/agencies/pricing');

  await clickSwitch(SWITCH.business);
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(businessHeadline);
  expect(await marker(), 'no document reload to /business').toBe(42);
  expect(await menuHrefs(page)).toEqual(businessMenuHrefs);
  await openJoin(page, BUSINESS.hero.primaryCta);
  await expect(dialog(page).getByRole('heading', { name: BUSINESS_FORM })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  await clickSwitch(SWITCH.agency);
  await expect(page).toHaveURL(/\/agencies$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(agencyHeadline);
  expect(await marker(), 'no document reload back to /agencies').toBe(42);
  expect(await menuHrefs(page)).toContain('/agencies/pricing');
  await openJoin(page);
  await expect(dialog(page).getByRole('heading', { name: AGENCY_FORM })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  // Pricing stays on pricing.
  await page.goto('/agencies/pricing');
  await page.evaluate(() => {
    (window as unknown as { __noReload: number }).__noReload = 43;
  });
  await clickSwitch(SWITCH.business);
  await expect(page).toHaveURL(/\/business\/pricing$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/One price/);
  expect(await marker(), 'no document reload between the pricing pages').toBe(43);
  // Only the two explicit page loads (`goto`) were documents.
  expect(documents).toEqual(['/agencies', '/agencies/pricing']);
});

test('nothing on the home pages moves by itself', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  test.setTimeout(90_000);
  await page.clock.install();
  await mockApp(page);
  for (const path of ['/', '/agencies', '/business']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }), `${path} rendered`).toBeVisible();
    await page.waitForLoadState('networkidle');
    // Let the gallery finish its one round, then wait for its rest state.
    await runClock(page, 40_000);
    await expect(page.getByRole('button', { name: GALLERY.play, exact: true }), `${path} gallery at rest`).toBeVisible();
    await page.waitForTimeout(400);
    // Instant scrolls, so no smooth-scroll animation of our own can be counted.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    const snapshot = () =>
      page.evaluate(() => ({
        text: document.body.innerText,
        picture: document.querySelector<HTMLImageElement>('[data-slot="hero-gallery"] img')?.currentSrc ?? '',
        selected: document.querySelector('[data-slot="hero-gallery"] [role="tab"][aria-selected="true"]')?.textContent ?? '',
      }));
    const before = await snapshot();
    await runClock(page, 10_000);
    await page.waitForTimeout(1000);
    expect(await snapshot(), `${path} content`).toEqual(before);
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => a.constructor.name + ' ' + ((a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? '')),
    );
    expect(running, `${path} running animations`).toEqual([]);
  }
});

test('the gallery plays once and then rests', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  test.setTimeout(90_000);
  await page.clock.install();
  await mockApp(page);
  await page.goto('/agencies');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(tab(page, firstTab)).toHaveAttribute('aria-selected', 'true');

  // It moves on by itself once (the second picture after one dwell)...
  await runClock(page, GALLERY.dwellMs + 1000);
  await expect(tab(page, secondTab)).toHaveAttribute('aria-selected', 'true');
  const swapped = () =>
    page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('[data-slot="hero-gallery"] img');
      return { complete: img?.complete ?? false, fade: img?.className.includes('gallery-fade') ?? false };
    });
  console.log(`GALLERY swap: ${JSON.stringify(await swapped())}`);
  await expect.poll(async () => (await swapped()).complete, { message: 'the picture is in before it is shown (no blank frame)' }).toBe(true);

  // ...and after the whole round it is back on the first tab and rests with a Play button.
  await runClock(page, 40_000 - GALLERY.dwellMs - 1000);
  await expect(tab(page, firstTab)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: GALLERY.play, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: GALLERY.pause, exact: true })).toHaveCount(0);
  await runClock(page, 30_000);
  await expect(tab(page, firstTab)).toHaveAttribute('aria-selected', 'true');
});

test('with reduced motion the gallery never moves', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await mockApp(page);
  for (const path of ['/agencies', '/business']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const selected = () => gallery(page).locator('[role="tab"][aria-selected="true"]').textContent();
    const first = await selected();
    await runClock(page, 40_000);
    expect(await selected(), `${path} tab`).toBe(first);
    await expect(page.getByRole('button', { name: GALLERY.play, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: GALLERY.pause, exact: true })).toHaveCount(0);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(running, `${path} running animations`).toBe(0);
  }
});

test('the hero fits a 320 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockApp(page);
  await page.goto('/agencies');
  await page.waitForLoadState('networkidle');
  const first = await overflow(page);
  expect(first.sw).toBeLessThanOrEqual(first.cw);
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(h1).not.toBeNull();
  expect(h1!.x).toBeGreaterThanOrEqual(0);
  expect(h1!.x + h1!.width).toBeLessThanOrEqual(320);
  // The tour button is `hidden sm:inline-flex` in the hero: it exists, and is not shown.
  const tour = page.locator('[data-slot="hero"] a[href="#client-view"]');
  await expect(tour).toHaveCount(1);
  await expect(tour).toBeHidden();
  // The tour's quiet brief button is one no-wrap line: it must stay inside the viewport.
  const cta = page.locator('[data-slot="client-view-cta"]');
  await cta.scrollIntoViewIfNeeded();
  const second = await overflow(page);
  expect(second.sw).toBeLessThanOrEqual(second.cw);
  const box = await cta.locator('button, a').first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

test('the /#join deep link opens the join dialog', async ({ page }) => {
  await mockApp(page);
  await page.goto('/#join');
  await expect(dialog(page).getByRole('heading', { name: CHOOSE_STEP })).toBeVisible();
});

test.describe('no horizontal overflow', () => {
  for (const path of ['/', '/agencies', '/business', '/sample-brief', '/how-it-works', '/privacy', '/terms', '/no-such-page']) {
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
    await page.goto('/agencies');
    await openJoin(page);
    await expect(dialog(page).getByRole('heading', { name: AGENCY_FORM })).toBeVisible();
    const first = await overflow(page);
    expect(first.sw).toBeLessThanOrEqual(first.cw);
    // The longest form too.
    await dialog(page).getByLabel(/Send me a real sample brief/).check();
    const second = await overflow(page);
    expect(second.sw).toBeLessThanOrEqual(second.cw);
    await page.keyboard.press('Escape');
    // And the business form on its own side.
    await page.goto('/business');
    await openJoin(page, BUSINESS.hero.primaryCta);
    await expect(dialog(page).getByRole('heading', { name: BUSINESS_FORM })).toBeVisible();
    const third = await overflow(page);
    expect(third.sw).toBeLessThanOrEqual(third.cw);
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
  for (const path of ['/', '/agencies', '/business', '/sample-brief', '/how-it-works', '/privacy', '/terms']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if (path === '/agencies') {
      await openJoin(page);
      await page.keyboard.press('Escape');
    }
    if (path === '/business') {
      await openJoin(page, BUSINESS.hero.primaryCta);
      await page.keyboard.press('Escape');
    }
    if (path === '/sample-brief') {
      await firstClaim(page).click();
      await expect(dialog(page)).toBeVisible();
    }
    violations.push(...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)));
  }
  expect(violations).toEqual([]);
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
  await page.goto('/agencies');
  await openJoin(page);
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: AGENCY_FORM })).toBeVisible();
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

test('agency join flow through the chooser on /', async ({ page }) => {
  const bodies = await mockApp(page);
  await page.goto('/#join');
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
  expect(bodies[0]).toMatchObject({ kind: 'agency', orgName: 'Ada Digital', turnstileToken: 'no-widget' });
});

async function fillBusiness(page: Page, vertical: 'other' | 'first') {
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: BUSINESS_FORM })).toBeVisible();
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
  await page.goto('/business');
  await openJoin(page, BUSINESS.hero.primaryCta);
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
  await mockApp(page, { waitlist: { status: 400, body: { ok: false, error: 'check' } } });
  await page.goto('/business');
  await openJoin(page, BUSINESS.hero.primaryCta);
  await fillBusiness(page, 'first');
  await dialog(page).getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText("The check didn't go through. Please try it again.");
  await expect(dialog(page).getByRole('heading', { name: /You're on the list/ })).toHaveCount(0);
});

test('pilot off swaps the CTA to sign-up', async ({ page }) => {
  await mockApp(page, { pilotMode: false });
  await page.goto('/agencies');
  if (isPhone(page)) await page.getByRole('button', { name: 'Menu' }).click();
  const scope = isPhone(page) ? dialog(page) : page.locator('header');
  await expect(scope.getByRole('link', { name: 'Start your free trial' })).toHaveAttribute('href', `${APP}/sign-up`);
  await expect(scope.getByRole('button', { name: 'Join the free pilot' })).toHaveCount(0);
});

test('pilot off keeps the waitlist on the business side', async ({ page }) => {
  await mockApp(page, { pilotMode: false });
  await page.goto('/business');
  if (isPhone(page)) await page.getByRole('button', { name: 'Menu' }).click();
  const scope = isPhone(page) ? dialog(page) : page.locator('header');
  await expect(scope.getByRole('button', { name: BUSINESS.hero.primaryCta, exact: true })).toBeVisible();
  await expect(scope.getByRole('link', { name: 'Start your free trial' })).toHaveCount(0);
});

test('counters hidden when null', async ({ page }) => {
  // Degraded answer: no counters section, and the site stays in pilot mode even though pilotMode says false.
  await mockApp(page, { counters: null, pilotMode: false });
  await page.goto('/agencies');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#live')).toHaveCount(0);
  if (isPhone(page)) await page.getByRole('button', { name: 'Menu' }).click();
  const scope = isPhone(page) ? dialog(page) : page.locator('header');
  await expect(scope.getByRole('button', { name: 'Join the free pilot' })).toBeVisible();
});

test('counters shown when present', async ({ page }) => {
  await mockApp(page);
  await page.goto('/agencies');
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

  // The rank grid's week slider changes the visible week.
  const slider = page.getByRole('slider', { name: 'Week' });
  await slider.scrollIntoViewIfNeeded();
  await expect(slider).toBeVisible();
  // The map opens on the last week and stays there until Play or the slider moves it.
  const lastWeek = await slider.getAttribute('max');
  expect(Number(lastWeek)).toBeGreaterThan(0);
  expect(await slider.inputValue()).toBe(lastWeek);
  await slider.focus();
  await slider.press('Home');
  expect(await slider.inputValue()).toBe('0');
  await slider.press('ArrowRight');
  expect(await slider.inputValue()).toBe('1');
  await slider.press('ArrowLeft');
  expect(await slider.inputValue()).toBe('0');

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

test('an unknown address under /agencies shows the both-reader header and logs no console error', async ({ page }) => {
  const target = '/agencies/no-such-page';
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The browser's own line for the 404 document: nothing wider is let through.
    const own = m.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)' && new URL(m.location().url).pathname === target;
    if (!own) problems.push(`console: ${m.text()} @ ${m.location().url}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await mockApp(page);
  const res = await page.goto(target);
  await page.waitForLoadState('networkidle');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  const header = page.locator('header');
  const links = header.getByRole('navigation', { name: SWITCH.label }).getByRole('link');
  await expect(links).toHaveCount(2);
  await expect(header.getByRole('navigation', { name: SWITCH.label }).locator('[aria-current]')).toHaveCount(0);
  await expect(header.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(header.getByRole('button', { name: /^Join/ })).toHaveCount(0);
  expect(problems).toEqual([]);
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
  await page.goto('/agencies');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Join the free pilot' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(1);
  await expect(dialog(page).getByRole('heading', { name: AGENCY_FORM })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
});
