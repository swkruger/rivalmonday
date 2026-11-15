import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { MCP_CLIENTS_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { hostRequest, MCP_ORIGIN, openMagicLink, PLATFORM_ORIGIN, requestMagicLink } from './helpers';

/**
 * Phase 6a "AI connections": a personal access token is shown once and revoking it cuts `/mcp` off; an AI app connects
 * through the real OAuth flow (dynamic registration, PKCE, signed-out authorize → magic-link sign-in → consent page)
 * and its token reaches only the workspace picked on the consent page.
 *
 * 13a1 (P16): MCP, its OAuth endpoints and the consent page live on `mcp.localhost`; Node-side calls go through `hostRequest`
 * (Node does not resolve `*.localhost`), the browser opens the mcp origin directly.
 */
test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));
test.use({ storageState: ADMIN_STATE });

const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' };

const MCP_HOST = new URL(MCP_ORIGIN).hostname;

async function mcp(token: string, method: string, params: Record<string, unknown> = {}) {
  return hostRequest(MCP_HOST, '/mcp', { headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` }, body: { jsonrpc: '2.0', id: 1, method, params } });
}

/** The tool's JSON result, or its mapped error (`{ code, message }`) when `isError`. */
async function callTool(token: string, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; body: Record<string, unknown> }> {
  const res = await mcp(token, 'tools/call', { name, arguments: args });
  expect(res.status).toBe(200);
  const json = res.json<{ result: { isError?: boolean; content: { type: string; text: string }[] } }>();
  return { isError: json.result.isError === true, body: JSON.parse(json.result.content[0]!.text) as Record<string, unknown> };
}

/** Creates a read-only token on the AI connections page (already open) and returns it. */
async function createToken(page: Page, name: string): Promise<string> {
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Access').selectOption({ label: 'Read only' });
  await page.getByRole('button', { name: 'Create token' }).click();
  await expect(page.getByText("Copy your token now. You won't be able to see it again.")).toBeVisible();
  const token = (await page.getByTestId('new-token-value').textContent())?.trim() ?? '';
  expect(token).toMatch(/^rm_pat_[0-9A-Za-z]{43}$/);
  return token;
}

test('an admin creates a token, sees it once, and revokes it', { tag: ['@ai-connections', '@nav'] }, async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'Agency settings' }).first().click();
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'AI connections' }).click();
  await expect(page).toHaveURL(/\/agency\/settings\/ai$/);
  await expect(page.getByRole('heading', { name: 'AI connections' })).toBeVisible();
  await expect(page.getByTestId('connector-url')).toHaveText(`${MCP_ORIGIN}/mcp`);

  const name = `E2E token ${Date.now()}`;
  const token = await createToken(page, name);
  const prefix = token.slice(0, 12);

  // The token works until it is revoked.
  expect((await mcp(token, 'tools/list')).status).toBe(200);

  // Shown once: after a reload only the prefix is left.
  await page.reload();
  await expect(page.getByText(token)).toHaveCount(0);
  const row = page.getByTestId('token-row').filter({ hasText: name });
  await expect(row).toContainText(prefix);
  await expect(row).toContainText('Read only');

  await row.getByRole('button', { name: `Revoke ${name}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Anything using it stops working straight away.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByText('Token revoked.')).toBeVisible();
  await expect(page.getByTestId('token-row').filter({ hasText: name })).toHaveCount(0);

  const res = await mcp(token, 'tools/list');
  expect(res.status).toBe(401);
});

test('MCP: PAT works on the mcp host; platform /mcp is 404', { tag: ['@ai-connections', '@hosts'] }, async ({ page, request }) => {
  await page.goto('/agency/settings/ai');
  const token = await createToken(page, `E2E host token ${Date.now()}`);
  expect((await mcp(token, 'tools/list')).status).toBe(200);
  // The platform serves no MCP, OAuth metadata or consent page (P16).
  const auth = { ...MCP_HEADERS, authorization: `Bearer ${token}` };
  expect((await request.post(`${PLATFORM_ORIGIN}/mcp`, { headers: auth, data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} } })).status()).toBe(404);
  expect((await request.get(`${PLATFORM_ORIGIN}/.well-known/oauth-protected-resource/mcp`)).status()).toBe(404);
  expect((await request.get(`${PLATFORM_ORIGIN}/oauth/consent`)).status()).toBe(404);
  // The mcp host publishes its own metadata, with itself as the resource, and serves nothing but MCP paths.
  const meta = await hostRequest(MCP_HOST, '/.well-known/oauth-protected-resource/mcp');
  expect(meta.status).toBe(200);
  expect(meta.json<{ resource: string }>().resource).toBe(`${MCP_ORIGIN}/mcp`);
  expect((await hostRequest(MCP_HOST, '/agency')).status).toBe(404);
});

/**
 * Tools a client-bound read token lists for a workspace with only the `mcp` feature (no `dashboard`): the client read list of
 * packages/mcp/src/integration.test.ts minus its dashboard-gated tools.
 */
const WORKSPACE_READ = [
  'fetch', 'get_brief', 'get_client_profile', 'get_competitor_signals', 'get_evidence', 'list_alerts', 'list_briefs', 'list_client_competitors', 'list_recommendations',
  'list_verticals', 'search', 'search_knowledge',
];

const b64url = (b: Buffer) => b.toString('base64url');

test('a client owner picks a workspace on the consent page', { tag: ['@ai-connections', '@auth'] }, async ({ browser }) => {
  // An AI app has no browser session: its Node-side requests (hostRequest) carry no cookies.
  const clients = JSON.parse(await readFile(MCP_CLIENTS_FILE, 'utf8')) as Record<'first' | 'second', { id: string; name: string }> & { first: { briefItemId: string } };
  const redirectUri = 'http://127.0.0.1:47123/callback';
  const scope = 'read feedback offline_access';

  // 1. Dynamic client registration, as Claude Code does it (public client, loopback redirect).
  const reg = await hostRequest(MCP_HOST, '/api/auth/oauth2/register', {
    body: { client_name: 'E2E Assistant', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope },
  });
  expect(reg.status).toBe(201);
  const clientId = reg.json<{ client_id: string }>().client_id;

  // 2. Authorize with PKCE, signed out (a fresh context with no session).
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(12));
  const authorize = `${MCP_ORIGIN}/api/auth/oauth2/authorize?${new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope, state, code_challenge: challenge, code_challenge_method: 'S256', resource: `${MCP_ORIGIN}/mcp`,
  })}`;
  const context = await browser.newContext({ baseURL: MCP_ORIGIN, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    let callback: URL | null = null;
    await page.route(`${redirectUri}**`, async (route) => {
      callback = new URL(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'connected' });
    });

    await page.goto(authorize);
    await expect(page).toHaveURL((u) => u.origin === MCP_ORIGIN && u.pathname === '/sign-in');
    // 3. Sign in with a magic link: it resumes the authorize request and lands on the consent page.
    await openMagicLink(page, await requestMagicLink(page, 'mcp-owner@e2e.test'));
    await expect(page).toHaveURL((u) => u.origin === MCP_ORIGIN && u.pathname === '/oauth/consent');
    await expect(page.getByText('Connect E2E Assistant to E2E Agency')).toBeVisible();
    await expect(page.getByText("After you allow, you'll be sent to 127.0.0.1:47123.")).toBeVisible();

    // 4. The picker lists both workspaces; choose the second, read only.
    const picker = page.getByLabel('Workspace');
    const options = (await picker.locator('option').allTextContents()).sort();
    expect(options).toEqual([`${clients.first.name} (E2E Agency)`, `${clients.second.name} (E2E Agency)`].sort());
    await picker.selectOption({ label: `${clients.second.name} (E2E Agency)` });
    // Read only is the default; checking it again is a no-op that keeps the step explicit.
    await expect(page.getByRole('radio', { name: /^Read only/ })).toBeChecked();
    await page.getByRole('radio', { name: /^Read only/ }).check();
    await page.getByRole('button', { name: 'Allow' }).click();
    await expect.poll(() => callback?.searchParams.get('code') ?? null).not.toBeNull();
    expect(callback!.searchParams.get('state')).toBe(state);

    // 5. Exchange the code (PKCE) for an access token bound to the chosen workspace.
    const tokenRes = await hostRequest(MCP_HOST, '/api/auth/oauth2/token', {
      form: true,
      body: { grant_type: 'authorization_code', code: callback!.searchParams.get('code')!, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: `${MCP_ORIGIN}/mcp` },
    });
    expect(tokenRes.status).toBe(200);
    const { access_token: accessToken } = tokenRes.json<{ access_token: string }>();

    const chosen = await callTool(accessToken, 'get_client_profile', { clientId: clients.second.id });
    expect(chosen.isError).toBe(false);
    expect(chosen.body.name).toBe(clients.second.name);
    const other = await callTool(accessToken, 'get_client_profile', { clientId: clients.first.id });
    expect(other).toMatchObject({ isError: true, body: { code: 'not_found' } });

    // 6. The token's tool list is exactly the read list for this workspace's features; search and fetch stay inside the chosen workspace.
    const list = await mcp(accessToken, 'tools/list');
    expect(list.status).toBe(200);
    const listed = list.json<{ result: { tools: { name: string }[] } }>().result.tools.map((t) => t.name).sort();
    expect(listed).toEqual([...WORKSPACE_READ].sort());
    const found = await callTool(accessToken, 'search', { query: 'plumber', clientId: clients.second.id });
    expect(found.isError).toBe(false);
    expect(Array.isArray(found.body.results)).toBe(true);
    const foreign = await callTool(accessToken, 'fetch', { id: `brief_item:${clients.first.briefItemId}` });
    expect(foreign).toMatchObject({ isError: true, body: { code: 'not_found' } });
  } finally {
    await context.close();
  }
});
