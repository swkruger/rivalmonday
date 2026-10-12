import { createHash, randomBytes } from 'node:crypto';

export const APP = 'http://localhost:3000';
export const RESOURCE = `${APP}/mcp`;
export const REDIRECT = 'http://127.0.0.1:33418/callback';

type Handler = { handler: (req: Request) => Promise<Response> };
export interface Called { status: number; location: string | null; body: any }

/**
 * Drives the OAuth provider in-process through `auth.handler`, like a browser plus an MCP client (Task 1 spike).
 * `latestLink` returns the newest magic-link URL (from `onMagicLink`); `flush` awaits the background send.
 */
export function oauthHarness(auth: Handler, latestLink: () => string | undefined, flush: () => Promise<unknown>, app = APP) {
  const resource = `${app}/mcp`;
  const jar = new Map<string, string>();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  async function call(url: string, init: { method?: string; json?: unknown; form?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Called> {
    const headers = new Headers(init.headers);
    headers.set('origin', app);
    if (jar.size) headers.set('cookie', cookie());
    let body: string | undefined;
    if (init.json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(init.json); }
    if (init.form) { headers.set('content-type', 'application/x-www-form-urlencoded'); body = new URLSearchParams(init.form).toString(); }
    const res = await auth.handler(new Request(url.startsWith('http') ? url : `${app}${url}`, { method: init.method ?? 'GET', headers, body }));
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv!.indexOf('=');
      jar.set(kv!.slice(0, i), kv!.slice(i + 1));
    }
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, location: res.headers.get('location'), body: parsed };
  }

  const register = (body: Record<string, unknown>) => call('/api/auth/oauth2/register', { method: 'POST', json: body });

  async function registerPublic(): Promise<string> {
    const r = await register({ client_name: 'Claude Code', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: 'read feedback manage offline_access' });
    if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.client_id as string;
  }

  function authorizeUrl(clientId: string, scope = 'read offline_access') {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const qs = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, scope, state: 'st', code_challenge: challenge, code_challenge_method: 'S256', resource });
    return { url: `/api/auth/oauth2/authorize?${qs}`, verifier };
  }

  /** Magic-link sign-in that resumes at `callbackURL`; returns the verify redirect target. */
  async function signIn(email: string, callbackURL = '/'): Promise<string> {
    const r = await call('/api/auth/sign-in/magic-link', { method: 'POST', json: { email, callbackURL } });
    if (r.status !== 200) throw new Error(`magic link failed: ${r.status}`);
    await flush();
    const v = await call(latestLink()!, { headers: { accept: 'text/html' } });
    return v.location!;
  }

  /** Accept or deny through the consent endpoint (as the server action does). */
  const consent = (oauthQuery: string, accept: boolean) => call('/api/auth/oauth2/consent', { method: 'POST', json: { accept, oauth_query: oauthQuery } });

  async function exchange(clientId: string, code: string, verifier: string) {
    return call('/api/auth/oauth2/token', { method: 'POST', form: { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource } });
  }

  return { jar, call, register, registerPublic, authorizeUrl, signIn, consent, exchange };
}

export const queryOf = (location: string) => new URL(location, APP).search.slice(1);
export const pathOf = (location: string) => new URL(location, APP).pathname;
