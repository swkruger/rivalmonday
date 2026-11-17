import { brandLeaks } from '@cs/core';
import { expect, test, type TestInfo } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { AGENCY_HOST_ROUTES, FINAL_PATH, fillRoute, routeParams } from './agency-routes';
import { agencyOriginOf, cookieHeader, ensureClientHostState, hostRequest, hostsFixture, type HostResponse } from './helpers';
import { ASK_USER_EMAIL, FLAGGED_BRIEF } from './seed';

/**
 * 13a2 Q5: nothing client-facing names Rival Monday. Every app route is requested on E2E Agency's own host as the seeded
 * client owner (or signed out), plus the MCP host's pages. A leak is the platform name, the wordmark half, the radar mark or
 * an RM icon link, in the body, the status line or any header, on every response and every same-host redirect hop.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const MAX_HOPS = 6;

/** What a client or crawler could read of one response: status line, every header, body. */
function surface(res: HostResponse): string {
  const headers = Object.entries(res.headers).map(([k, v]) => `${k}: ${[v].flat().join(', ')}`);
  return [`HTTP ${res.status}`, ...headers, res.text].join('\n');
}

const isHtml = (res: HostResponse) => /text\/html/i.test(String(res.headers['content-type'] ?? ''));

type Chain = { hops: { path: string; res: HostResponse }[]; final: HostResponse };

/** Requests `path` on `host` and follows same-host redirects by hand; any other redirect target is a failure (V11: none to the platform). */
async function fetchChain(host: string, path: string, cookie?: string): Promise<Chain> {
  const hops: Chain['hops'] = [];
  let at = path;
  for (let i = 0; i <= MAX_HOPS; i++) {
    const res = await hostRequest(host, at, cookie ? { headers: { cookie } } : {});
    hops.push({ path: at, res });
    if (res.status < 300 || res.status >= 400) return { hops, final: res };
    const location = res.headers.location;
    expect(location, `${host}${at}: a ${res.status} without Location`).toBeTruthy();
    const target = new URL(String(location), `http://${host}:${PORT}`);
    expect(target.host, `${host}${at} redirects off its host to ${target.href}`).toBe(`${host}:${PORT}`);
    at = `${target.pathname}${target.search}`;
  }
  throw new Error(`${host}${path}: more than ${MAX_HOPS} redirects`);
}

/** The neutral-brand rules for one response; returns the problems so one request reports all of them. */
function problemsOf(label: string, res: HostResponse): string[] {
  const out = brandLeaks(surface(res)).map((l) => `${label}: ${l}`);
  if (!isHtml(res)) return out;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(res.text)?.[1] ?? '';
  out.push(...brandLeaks(title).map((l) => `${label}: <title> ${l}`));
  for (const tag of res.text.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel="[^"]*\bicon\b[^"]*"/i.test(tag)) continue;
    const href = /\bhref="([^"]*)"/i.exec(tag)?.[1];
    if (href !== '/neutral-icon.svg') out.push(`${label}: icon link ${tag}`);
  }
  return out;
}

const EXPECTED_STATUS = { client: 200, client_404: 404, public: 200, deny: 404, bounce: 404, error: 500 } as const;

test('no page names the platform on the agency host', { tag: ['@whitelabel', '@hosts', '@auth'] }, async ({ browser }) => {
  test.setTimeout(600_000);
  const { slug, whiteLabel } = hostsFixture();
  const host = `${slug}.localhost`;
  const state = await ensureClientHostState(browser, ASK_USER_EMAIL, slug, `/c/${whiteLabel.clientId}`);
  const cookie = cookieHeader(state);
  const params = routeParams(whiteLabel.clientId, whiteLabel.params);
  const problems: string[] = [];
  const crawled: string[] = [];
  // Control: the platform host's own sign-in does name the platform (RM mark link), so the checks below can fail.
  expect(problemsOf('control', await hostRequest('localhost', '/sign-in')), 'the leak check must see the platform host').not.toEqual([]);

  const visit = async (route: string, path: string, as: 'client' | 'signed out', expected: number, withCookie?: string) => {
    const { hops, final } = await fetchChain(host, path, withCookie);
    crawled.push(`${as} ${route}`);
    // A rejected session redirects to /sign-in or /no-access and answers 200 there: the page must answer at its own path (or the declared one).
    if (expected === 200) {
      const want = FINAL_PATH[route] ? fillRoute(FINAL_PATH[route]!, params) : path;
      const at = hops[hops.length - 1]!.path;
      const ok = want === '/c/*' ? /^\/c\/[0-9a-f-]{36}$/.test(at) : at === want;
      if (!ok) problems.push(`${route} as ${as}: ended at ${at}, expected ${want} (via ${hops.map((h) => h.path).join(' → ')})`);
    }
    if (final.status !== expected) problems.push(`${route} as ${as}: expected ${expected}, got ${final.status} (${path}${hops.length > 1 ? `, via ${hops.map((h) => h.path).join(' → ')}` : ''})`);
    for (const h of hops) problems.push(...problemsOf(`${route} as ${as} (${h.path} → ${h.res.status})`, h.res));
  };

  // Sanity: the client's own Overview with the cookie answers where it was asked, no redirect.
  const sanity = await fetchChain(host, `/c/${whiteLabel.clientId}`, cookie);
  expect(sanity.hops.map((h) => h.path), 'the saved session must open the client Overview').toEqual([`/c/${whiteLabel.clientId}`]);

  for (const [route, kind] of Object.entries(AGENCY_HOST_ROUTES)) {
    const path = fillRoute(route, params);
    if (kind === 'public') await visit(route, path, 'signed out', 200);
    else {
      await visit(route, path, 'client', EXPECTED_STATUS[kind], cookie);
      // V11: the staff zones are 404 without a session too, never a redirect (to sign-in or to the platform).
      if (kind === 'bounce') await visit(route, path, 'signed out', 404);
    }
  }
  expect(crawled.length).toBeGreaterThan(80);
  expect(problems).toEqual([]);

  // One real browser visit: the live document title and tab icons (client-side metadata included).
  const context = await browser.newContext({ baseURL: agencyOriginOf(), storageState: state });
  try {
    const page = await context.newPage();
    const response = await page.goto(`/c/${whiteLabel.clientId}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('main')).toBeVisible();
    expect(brandLeaks(await page.title())).toEqual([]);
    const icons = await page.locator('link[rel~="icon"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(icons.length).toBeGreaterThan(0);
    expect(icons).toEqual(icons.map(() => '/neutral-icon.svg'));
  } finally {
    await context.close();
  }
});

test('MCP host pages are neutral', { tag: ['@whitelabel', '@hosts', '@ai-connections'] }, async () => {
  const host = 'mcp.localhost';
  const problems: string[] = [];
  const cases: [string, number][] = [
    ['/sign-in', 200],
    ['/oauth/consent', 200], // signed out: the session check sends it to /sign-in on the same host
    ['/.well-known/oauth-protected-resource', 200],
    ['/neutral-icon.svg', 200],
    ['/favicon.ico', 404],
    ['/brand/rm-mark.svg', 404],
  ];
  for (const [path, status] of cases) {
    const { hops, final } = await fetchChain(host, path);
    if (final.status !== status) problems.push(`${path}: expected ${status}, got ${final.status}`);
    for (const h of hops) problems.push(...problemsOf(`${path} (${h.path} → ${h.res.status})`, h.res));
  }
  expect(problems).toEqual([]);
});

test('a flagged brief shows the chip and highlights the word', { tag: ['@whitelabel', '@briefs'] }, async ({ browser }, testInfo: TestInfo) => {
  await ensureAdminState(browser, testInfo);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
  try {
    const page = await context.newPage();
    await page.goto('/agency/approvals');
    const row = page.getByRole('row').filter({ hasText: FLAGGED_BRIEF.clientName });
    await expect(row.getByText('Banned word')).toBeVisible();
    // A brief without the flag (E2E HVAC's) carries no chip.
    await expect(page.getByRole('row').filter({ hasText: 'E2E HVAC' }).getByText('Banned word')).toHaveCount(0);

    await row.getByRole('link', { name: FLAGGED_BRIEF.clientName }).click();
    await expect(page.getByText(`This brief uses a banned word: ${FLAGGED_BRIEF.term}.`)).toBeVisible();
    const marks = page.getByRole('main').locator('mark');
    await expect(marks.first()).toHaveText(FLAGGED_BRIEF.term);
    // The summary and the item headline both use it.
    expect(await marks.count()).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
  }
});
