import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, type Cookie, expect, type Page } from '@playwright/test';
import { HOSTS_FIXTURE_FILE, OUTBOX } from '../playwright.config';
import type { HostsFixture } from './seed';

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** The platform origin (`APP_URL` in the E2E server env). */
export const PLATFORM_ORIGIN = `http://localhost:${PORT}`;
/** 13a1: an agency's client-facing host in E2E (`NEUTRAL_DOMAIN=localhost`). */
export const agencyOrigin = (slug: string) => `http://${slug}.localhost:${PORT}`;
/** 13a1 (P16): MCP and its OAuth issuer live on `mcp.<NEUTRAL_DOMAIN>`. */
export const MCP_ORIGIN = `http://mcp.localhost:${PORT}`;

/** Read lazily: test files are collected before global setup writes the fixture. */
export const hostsFixture = (): HostsFixture => JSON.parse(readFileSync(HOSTS_FIXTURE_FILE, 'utf8')) as HostsFixture;
/** The client-facing origin of a seeded agency, by its seed name (default: E2E Agency). */
export const agencyOriginOf = (agencyName = 'E2E Agency'): string => {
  const slug = hostsFixture().slugs[agencyName];
  if (!slug) throw new Error(`no host slug for agency ${agencyName} in ${HOSTS_FIXTURE_FILE}`);
  return agencyOrigin(slug);
};
/**
 * `test.use({ baseURL: agencyBaseURL(name) })`: a describe whose pages run as a client user on that agency's host (a client-only
 * user on the platform host is bounced there). A fixture function, so the slug is read after global setup.
 */
export const agencyBaseURL = (agencyName = 'E2E Agency') =>
  async ({}, use: (url: string) => Promise<void>) => {
    await use(agencyOriginOf(agencyName));
  };

/** A Node-side response from `hostRequest` (redirects are never followed). */
export type HostResponse = { status: number; headers: Record<string, string | string[] | undefined>; text: string; json<T = unknown>(): T };

/**
 * A request to the E2E server with an explicit `Host` (Node's resolver does not map `*.localhost` to loopback, Chromium does):
 * `http.request` to `127.0.0.1:${E2E_PORT}` with `Host: <host>:<port>`. `host` is a hostname (`mcp.localhost`, `<slug>.localhost`).
 * `body`: a string as is; an object as JSON, or form-encoded when `form: true`.
 */
export function hostRequest(
  host: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Record<string, unknown>; form?: boolean } = {},
): Promise<HostResponse> {
  const headers: Record<string, string> = { host: `${host}:${PORT}`, ...init.headers };
  let body: string | undefined;
  if (typeof init.body === 'string') body = init.body;
  else if (init.body && init.form) {
    body = new URLSearchParams(Object.entries(init.body).map(([k, v]) => [k, String(v)])).toString();
    headers['content-type'] ??= 'application/x-www-form-urlencoded';
  } else if (init.body) {
    body = JSON.stringify(init.body);
    headers['content-type'] ??= 'application/json';
  }
  if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: PORT, path, method: init.method ?? (body === undefined ? 'GET' : 'POST'), headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: <T>() => JSON.parse(text) as T });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => req.destroy(new Error(`hostRequest ${host}${path} timed out`)));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/**
 * Session cookies saved for one host, re-scoped to another (13a1: cookies are host-only, every origin shares the auth secret),
 * so a cross-host case reuses a session instead of a new magic-link sign-in.
 */
export function cookiesFor(cookies: Cookie[], hostname: string): Cookie[] {
  return cookies.map((c) => ({ ...c, domain: hostname }));
}

/** A new context on `origin` with a saved state's cookies on their own host plus a copy re-scoped to `origin`'s host. */
export async function contextOnHost(browser: Browser, statePath: string, origin: string): Promise<BrowserContext> {
  const saved = JSON.parse(readFileSync(statePath, 'utf8')) as { cookies: Cookie[] };
  const context = await browser.newContext({ baseURL: origin, storageState: { cookies: [], origins: [] } });
  await context.addCookies([...saved.cookies, ...cookiesFor(saved.cookies, new URL(origin).hostname)]);
  return context;
}

async function outboxFiles(): Promise<string[]> {
  return (await readdir(OUTBOX).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort();
}

/**
 * Snapshot the outbox *before* asking for a link, then hand the snapshot to `newMagicLink`. `sendMagicLink` sends
 * in the background (decision 2), so the new email can land after the "check your email" page shows.
 *
 * Fix round 1: this replaces a module-level "last file I returned" watermark. Playwright restarts the worker process
 * after any failed test, which reset that watermark to '' — the next test then took the newest file already in the
 * outbox (the previous test's consumed link) before its own email landed, and Better Auth answered INVALID_TOKEN
 * ("That sign-in link expired or was already used"). A snapshot taken by the caller survives worker restarts.
 */
export async function outboxSnapshot(): Promise<Set<string>> {
  return new Set(await outboxFiles());
}

/**
 * The magic link from the first email to `email` that was not in `before` (waits up to 10 s for it to land).
 * `to` is a string in the file transport's JSON; an array is accepted too in case that ever changes.
 */
export async function newMagicLink(before: Set<string>, email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    for (const f of (await outboxFiles()).filter((name) => !before.has(name))) {
      try {
        const msg = JSON.parse(await readFile(join(OUTBOX, f), 'utf8')) as { to: string | string[]; text: string };
        const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((a) => a.toLowerCase());
        if (!to.includes(email.toLowerCase())) continue;
        const m = /https?:\/\/\S+magic-link\/verify\S+/.exec(msg.text);
        if (m) return m[0];
      } catch {
        // Still being written; try again on the next tick.
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no new magic link to ${email} in the outbox ${OUTBOX} within 10 s`);
}

/** How long a rate-limited magic-link request is retried (the limit window is 60 s). */
const RATE_LIMIT_BUDGET_MS = 90_000;
const RATE_LIMIT_POLL_MS = 5_000;

/**
 * Request a magic link from the sign-in form already open in `page` and return it. Magic links are rate-limited per IP
 * across the whole run; only that signal (HTTP 429 from the magic-link endpoint) is retried, polling until the window
 * clears; any other failure fails at once.
 */
export async function requestMagicLink(page: Page, email: string): Promise<string> {
  const deadline = Date.now() + RATE_LIMIT_BUDGET_MS;
  for (;;) {
    const before = await outboxSnapshot();
    await page.getByLabel(/email/i).fill(email);
    const response = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/sign-in/magic-link'));
    await page.getByRole('button', { name: /email me a sign-in link/i }).click();
    if ((await response).status() !== 429) {
      await expect(page).toHaveURL(/check-email/);
      return newMagicLink(before, email);
    }
    if (Date.now() > deadline) throw new Error(`magic-link rate limit for ${email} did not clear within ${RATE_LIMIT_BUDGET_MS / 1000} s`);
    await page.waitForTimeout(RATE_LIMIT_POLL_MS);
  }
}

/**
 * Opens a magic link. `/magic-link/verify` has its own per-IP limit (5 per 60 s) shared across the whole run, so a 429
 * there is retried until the window clears; a rate-limited request never reaches the handler, so the token stays unused.
 */
export async function openMagicLink(page: Page, link: string): Promise<void> {
  const deadline = Date.now() + RATE_LIMIT_BUDGET_MS;
  for (;;) {
    const response = await page.goto(link);
    if (response?.status() !== 429) return;
    if (Date.now() > deadline) throw new Error(`magic-link verify rate limit did not clear within ${RATE_LIMIT_BUDGET_MS / 1000} s`);
    await page.waitForTimeout(RATE_LIMIT_POLL_MS);
  }
}

/**
 * Signs in on `origin` (default: the page's baseURL, the platform). 13a1: a client-only user signs in on their agency's host
 * (`agencyOriginOf(...)`); on the platform they would be bounced there without a session.
 */
export async function signIn(page: Page, email: string, next = '/agency', origin = ''): Promise<void> {
  await page.goto(`${origin}/sign-in?next=${encodeURIComponent(next)}`);
  await openMagicLink(page, await requestMagicLink(page, email));
}

/** A saved storage state's cookies as a `Cookie` header, for `hostRequest` (Node cannot resolve `*.localhost`, so no `APIRequestContext`). */
export const cookieHeader = (statePath: string): string =>
  (JSON.parse(readFileSync(statePath, 'utf8')) as { cookies: { name: string; value: string }[] }).cookies.map((c) => `${c.name}=${c.value}`).join('; ');

/** Where `ensureClientHostState` saves the session of `email` on the host of agency `slug`. */
export const clientHostStatePath = (email: string, slug: string): string =>
  fileURLToPath(new URL(`../test-results/client-state-${slug}-${email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, import.meta.url));

/**
 * A client user's session on an agency's own host (13a1: their sign-in lives there, cookies are host-only), signed in once per
 * run and reused as storage state. Returns the state file. `next` is where the sign-in lands (the platform default `/agency`
 * does not exist for a client on an agency host); without it the landing page is whatever the host picks for the user.
 */
export async function ensureClientHostState(browser: Browser, email: string, slug: string, next = '/'): Promise<string> {
  const state = clientHostStatePath(email, slug);
  if (existsSync(state)) return state;
  const origin = agencyOrigin(slug);
  const context = await browser.newContext({ baseURL: origin, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await signIn(page, email, next, origin);
    if (next === '/') await expect(page).not.toHaveURL(/\/sign-in|check-email|magic-link/);
    else await expect(page).toHaveURL(`${origin}${next}`);
    await context.storageState({ path: state });
  } finally {
    await context.close();
  }
  return state;
}
