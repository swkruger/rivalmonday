import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, test, type TestInfo } from '@playwright/test';
import { MCP_CLIENTS_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { agencyOrigin, agencyOriginOf, contextOnHost, hostRequest, hostsFixture, PLATFORM_ORIGIN, signIn } from './helpers';
import { IN_SLUG, SI_AGENCY } from './seed';

/**
 * 13a1 hosts: client traffic runs on the agency's own host (`<host_slug>.localhost`), staff on the platform, and each host
 * serves only its own agency. One magic-link sign-in (the client owner `mcp-owner@e2e.test` on E2E Agency's host); the
 * cross-host cases re-scope saved session cookies to the other host (host-only cookies, one auth secret).
 */
const AGENCY_CLIENT_STATE = fileURLToPath(new URL('../test-results/agency-client-state.json', import.meta.url));
const CLIENT_EMAIL = 'mcp-owner@e2e.test';
type McpClients = Record<'first' | 'second', { id: string; name: string }>;
const clients = (): McpClients => JSON.parse(readFileSync(MCP_CLIENTS_FILE, 'utf8')) as McpClients;
const hostOf = (url: string) => new URL(url).host;

/** The client owner's session on E2E Agency's host (the one new magic-link sign-in of this phase). */
async function ensureAgencyClientState(browser: Browser): Promise<void> {
  if (existsSync(AGENCY_CLIENT_STATE)) return;
  const origin = agencyOriginOf();
  const context = await browser.newContext({ baseURL: origin, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await signIn(page, CLIENT_EMAIL, `/c/${clients().first.id}`, origin);
    await expect(page).toHaveURL(`${origin}/c/${clients().first.id}`);
    await context.storageState({ path: AGENCY_CLIENT_STATE });
  } finally {
    await context.close();
  }
}

test('client signs in on the agency host and sees their client', { tag: ['@hosts', '@auth'] }, async ({ browser }) => {
  await ensureAgencyClientState(browser);
  const origin = agencyOriginOf();
  const context = await browser.newContext({ baseURL: origin, storageState: AGENCY_CLIENT_STATE });
  try {
    const page = await context.newPage();
    await page.goto(`/c/${clients().first.id}`);
    expect(hostOf(page.url())).toBe(hostOf(origin));
    await expect(page.getByRole('main')).toContainText(clients().first.name);
    // The session is host-only: no cookie for the platform host.
    const cookies = await context.cookies(PLATFORM_ORIGIN);
    expect(cookies.filter((c) => c.name.endsWith('session_token'))).toEqual([]);
  } finally {
    await context.close();
  }
});

test('agency admin session on the agency host is redirected to the platform', { tag: ['@hosts', '@auth'] }, async ({ browser }, testInfo: TestInfo) => {
  await ensureAdminState(browser, testInfo);
  const origin = agencyOriginOf();
  const context = await contextOnHost(browser, ADMIN_STATE, origin);
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/c/${clients().first.id}`);
    await expect(page).toHaveURL(`${PLATFORM_ORIGIN}/c/${clients().first.id}`);
  } finally {
    await context.close();
  }
});

test('client-only session on the platform is redirected to the agency host', { tag: ['@hosts', '@auth'] }, async ({ browser }) => {
  await ensureAgencyClientState(browser);
  const origin = agencyOriginOf();
  const context = await contextOnHost(browser, AGENCY_CLIENT_STATE, PLATFORM_ORIGIN);
  try {
    const page = await context.newPage();
    await page.goto(`${PLATFORM_ORIGIN}/c/${clients().second.id}`);
    await expect(page).toHaveURL(`${origin}/c/${clients().second.id}`);
    await expect(page.getByRole('main')).toContainText(clients().second.name);
  } finally {
    await context.close();
  }
});

test("other agency's client on the agency host → 404", { tag: ['@hosts'] }, async ({ browser }) => {
  await ensureAgencyClientState(browser);
  const { other } = hostsFixture();
  const origin = agencyOriginOf();
  const context = await browser.newContext({ baseURL: origin, storageState: AGENCY_CLIENT_STATE });
  try {
    const page = await context.newPage();
    expect((await page.goto(`/c/${other.clientId}`))?.status()).toBe(404);
    // The other agency's host does not know this session's memberships either.
    const theirs = await contextOnHost(browser, AGENCY_CLIENT_STATE, agencyOrigin(other.slug));
    try {
      const p2 = await theirs.newPage();
      const res = await p2.goto(`${agencyOrigin(other.slug)}/c/${clients().first.id}`);
      expect(hostOf(p2.url())).toBe(hostOf(agencyOrigin(other.slug)));
      // No membership counts on that host (host-viewer: own agency's client roles only), so the user lands on /no-access.
      expect(res?.status()).toBe(200);
      expect(new URL(p2.url()).pathname).toBe('/no-access');
      await expect(p2.getByText(clients().first.name)).toHaveCount(0);
    } finally {
      await theirs.close();
    }
  } finally {
    await context.close();
  }
});

test('unknown host → 404', { tag: ['@hosts'] }, async () => {
  for (const host of ['no-such-agency.localhost', 'a.b.localhost', 'www.localhost', 'evil.example']) {
    const res = await hostRequest(host, '/sign-in');
    expect(res.status, host).toBe(404);
  }
  // Liveness answers on any host.
  expect((await hostRequest('no-such-agency.localhost', '/health')).status).toBe(200);
});

/**
 * V11 (13a2): `/agency*` and `/platform*` on an agency host are 404 for everyone but a verified staff viewer of that agency, who
 * is bounced (307) to the platform; no one else is ever redirected to the platform origin.
 */
test('agency host /agency → platform only for staff of that agency', { tag: ['@hosts', '@auth'] }, async ({ browser }, testInfo: TestInfo) => {
  await ensureAdminState(browser, testInfo);
  const origin = agencyOriginOf();
  const context = await contextOnHost(browser, ADMIN_STATE, origin);
  try {
    const page = await context.newPage();
    const res = await page.goto(`${origin}/agency/settings?x=1`);
    const first = res?.request().redirectedFrom();
    expect(first?.url()).toBe(`${origin}/agency/settings?x=1`);
    const hop = await first?.response();
    expect(hop?.status()).toBe(307);
    expect(hop?.headers().location).toBe(`${PLATFORM_ORIGIN}/agency/settings?x=1`);
  } finally {
    await context.close();
  }
});

test('platform guest cookie is refused at /agency on an agency host', { tag: ['@hosts', '@guest'] }, async () => {
  const { slug } = hostsFixture();
  for (const path of ['/agency', '/agency/settings?x=1']) {
    const res = await hostRequest(`${slug}.localhost`, path, { headers: { cookie: 'rm_guest=forged.value' } });
    expect(res.status, path).toBe(404);
    expect(res.headers.location, path).toBeUndefined();
  }
});

test('client session at /agency on an agency host → 404, no Location', { tag: ['@hosts', '@auth'] }, async ({ browser }) => {
  await ensureAgencyClientState(browser);
  const origin = agencyOriginOf();
  const context = await browser.newContext({ baseURL: origin, storageState: AGENCY_CLIENT_STATE });
  try {
    for (const path of ['/agency', '/agency/settings?x=1']) {
      const res = await context.request.get(`${origin}${path}`, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
      expect(res.headers().location, path).toBeUndefined();
    }
  } finally {
    await context.close();
  }
});

test('no session at /platform on an agency host → 404', { tag: ['@hosts'] }, async () => {
  const { slug } = hostsFixture();
  for (const path of ['/platform', '/platform/agencies', '/agency']) {
    const res = await hostRequest(`${slug}.localhost`, path);
    expect(res.status, path).toBe(404);
    expect(res.headers.location, path).toBeUndefined();
  }
});

test('agency host: internal routes and platform-only paths are not served', { tag: ['@hosts'] }, async () => {
  const { slug } = hostsFixture();
  // The internal redirect route is not reachable directly, on any host.
  for (const host of [`${slug}.localhost`, 'localhost', 'mcp.localhost']) {
    expect((await hostRequest(host, '/rm-internal/host-redirect', { headers: { 'x-rm-redirect-to': 'https://evil.example/' } })).status, host).toBe(404);
  }
  // Platform-only and MCP paths are not served on an agency host at all.
  for (const path of ['/mcp', '/sign-up', '/bot', '/.well-known/oauth-authorization-server']) {
    expect((await hostRequest(`${slug}.localhost`, path)).status, path).toBe(404);
  }
});

test('agency host /start → 404, /start/<own slug> → 200', { tag: ['@hosts', '@leads'] }, async () => {
  const { slugs, slug: e2eSlug } = hostsFixture();
  const siHost = `${slugs[SI_AGENCY]!}.localhost`;
  expect((await hostRequest(siHost, '/start')).status).toBe(404);
  const own = await hostRequest(siHost, `/start/${IN_SLUG}`);
  expect(own.status).toBe(200);
  expect(own.text).not.toContain('Rival Monday');
  // Another agency's intake slug is not served on this host.
  expect((await hostRequest(`${e2eSlug}.localhost`, `/start/${IN_SLUG}`)).status).toBe(404);
  // The platform keeps /start (R6).
  expect((await hostRequest('localhost', '/start')).status).toBe(200);
});
