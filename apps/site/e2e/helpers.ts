import type { Page, Route } from '@playwright/test';

export const APP = 'https://app.e2e.test';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
export const COUNTERS = { rivalSitesWatched: 120, snapshotsThisWeek: 940, claimsChecked: 2300, claimsDropped: 41 };

export type Mocks = { pilotMode?: boolean; counters?: typeof COUNTERS | null; waitlist?: { status: number; body: unknown } };

/** Routes the app's two public endpoints (no real network). Returns the waitlist request bodies seen. */
export async function mockApp(page: Page, m: Mocks = {}): Promise<unknown[]> {
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

export async function overflow(page: Page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
}


/** Collects CSP violations (in-page listener) and console/page errors. Call before `goto`. */
export async function watchProblems(page: Page): Promise<{ problems: string[]; csp: () => Promise<string[]> }> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp ??= [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}`);
    });
  });
  return { problems, csp: () => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []) };
}

/** Pathnames of every `<loc>` in the served sitemap (never the real domain). */
export async function sitemapPaths(request: import('@playwright/test').APIRequestContext): Promise<string[]> {
  const res = await request.get('/sitemap.xml');
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
}
