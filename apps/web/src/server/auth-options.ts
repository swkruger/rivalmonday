import { oauthProvider } from '@better-auth/oauth-provider';
import type { Db } from '@cs/db';
import type { Branding, EmailPayload } from '@cs/email';
import { acceptInvitations, dropUnboundConsents, hasSignInRight } from '@cs/tools';
import type { BetterAuthOptions } from 'better-auth';
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins/magic-link';
import { sql } from 'drizzle-orm';
import { PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import type { WebEnv } from './env';

export const MAGIC_LINK_MINUTES = 15;

export interface AuthDeps {
  env: WebEnv;
  service: Db;
  /** Service-role pg pool for Better Auth's Kysely adapter. */
  pool: Pool;
  sendEmail: (to: string, payload: EmailPayload) => Promise<void>;
  branding: () => Promise<Branding>;
  /**
   * Schedules work that must neither delay nor fail the response (Next's `after()` in the app). The sign-in-link
   * right-check and send run here so invited and uninvited emails get the same response in the same time (decision 2).
   */
  runInBackground: (task: Promise<unknown>) => void;
  /** Dev panel only (deviation 4): receives each sign-in URL synchronously, before the background send. */
  onMagicLink?: (email: string, url: string) => void;
  now?: () => Date;
}

/**
 * Phase 6a: OAuth 2.1 provider for MCP clients (config proven by the Task 1 spike). Opaque access tokens stored as
 * SHA-256 hashes; public clients may register themselves (DCR); every token is for the `<appUrl>/mcp` resource.
 * `resources` + `clientRegistrationDefaultResources` are required (`enforcePerClientResources` defaults to true);
 * `clientRegistrationAllowedScopes` lets clients ask for feedback/manage; `grantTypes` drops client_credentials.
 */
export function oauthOptions(appUrl: string) {
  const resource = `${appUrl}/mcp`;
  return {
    loginPage: '/sign-in',
    consentPage: '/oauth/consent',
    scopes: ['offline_access', 'read', 'feedback', 'manage'],
    disableJwtPlugin: true,
    storeTokens: 'hashed' as const,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationDefaultScopes: ['read', 'offline_access'],
    clientRegistrationAllowedScopes: ['feedback', 'manage'],
    resources: [resource],
    clientRegistrationDefaultResources: [resource],
    grantTypes: ['authorization_code' as const, 'refresh_token' as const],
    accessTokenExpiresIn: 60 * 60,
    refreshTokenExpiresIn: 30 * 24 * 60 * 60,
  };
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const isHttpLoopback = (u: unknown): boolean => {
  try {
    const x = new URL(String(u));
    return x.protocol === 'http:' && LOOPBACK_HOSTS.includes(x.hostname);
  } catch {
    return false;
  }
};

/**
 * Rulings R5 + R10: Claude Code registers http loopback redirects without `application_type`; the plugin defaults to
 * `web`, which refuses them. A PUBLIC client (`token_endpoint_auth_method: 'none'`) whose redirect URIs are ALL http
 * loopback is registered as `native` (RFC 8252). Anything else is left for the plugin to judge unchanged.
 */
export function publicLoopbackAsNative(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.application_type !== undefined || b.token_endpoint_auth_method !== 'none') return null;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every(isHttpLoopback)) return null;
  return { ...b, application_type: 'native' };
}

/**
 * The consent endpoint dispatches `/oauth2/authorize` internally (through hooks) right after saving the consent and
 * before our action binds it; that inner call must not drop the consent it is completing.
 */
const isConsentRequest = (req: Request | undefined): boolean => {
  try {
    return req !== undefined && new URL(req.url).pathname.endsWith('/oauth2/consent');
  } catch {
    return false;
  }
};

/**
 * Better Auth options shared by the app, the admin CLI and tests (no `server-only` here).
 * Tables live in schema `auth` and are created by migration 0035 — Better Auth never migrates at runtime
 * (`runMigrations` only runs when called explicitly; the drift test in auth-schema.test.ts guards the shape).
 */
export function buildAuthOptions(deps: AuthDeps): BetterAuthOptions {
  const now = deps.now ?? (() => new Date());
  return {
    appName: 'Rival Monday',
    baseURL: deps.env.appUrl,
    secret: deps.env.authSecret,
    trustedOrigins: [deps.env.appUrl],
    advanced: { backgroundTasks: { handler: deps.runInBackground } },
    database: { dialect: new PostgresDialect({ pool: deps.pool }), type: 'postgres', schemaName: 'auth' },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    socialProviders: deps.env.google ? { google: { clientId: deps.env.google.clientId, clientSecret: deps.env.google.clientSecret, prompt: 'select_account' } } : {},
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_MINUTES * 60,
        // Decision 14: only a hash of the token is stored in auth.verification; the verify endpoint hashes the
        // incoming token itself before looking it up, so nothing else here changes.
        storeToken: 'hashed',
        // Decision 2: no link for people without a right to sign in. The check and the send run in the background, so the
        // response (status, body and timing) is the same either way and a failed send never surfaces to the caller.
        sendMagicLink: ({ email, url }) => {
          deps.onMagicLink?.(email, url);
          deps.runInBackground((async () => {
            if (!(await hasSignInRight(deps.service, email, now()))) return;
            await deps.sendEmail(email, { template: 'sign_in', props: { branding: await deps.branding(), url, expiresMinutes: MAGIC_LINK_MINUTES } });
          })().catch((e: unknown) => {
            // Never log the link or token; the error text comes from the DB, the renderer or the transport.
            console.error(`[auth] sign-in link not sent: ${e instanceof Error ? e.message : String(e)}`);
          }));
        },
      }),
      oauthProvider(oauthOptions(deps.env.appUrl)),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/oauth2/register') {
          const body = publicLoopbackAsNative(ctx.body);
          return body ? { context: { body } } : undefined;
        }
        if (ctx.path === '/oauth2/authorize' && !isConsentRequest(ctx.request)) {
          // Ruling R9: a plugin consent whose oauth_grant_binding is revoked (or was never written) would let authorize
          // skip /oauth/consent and mint a token our verifier refuses. Drop such consents first so the user is asked
          // again and the binding is rewritten. No session = the plugin sends them to sign in; this runs on the resume.
          const session = await getSessionFromCtx(ctx);
          if (!session) return;
          const clientId = (ctx.query as Record<string, unknown> | undefined)?.client_id;
          await dropUnboundConsents(deps.service, session.user.id, typeof clientId === 'string' ? clientId : null);
        }
        return undefined;
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Covers Google and a magic link whose invitation was revoked after it was sent; `false` blocks the insert.
          before: async (user) => ((await hasSignInRight(deps.service, user.email, now())) ? undefined : false),
        },
      },
      session: {
        create: {
          // 5b-2 decision 14 (5a carry-over): a Google user whose memberships were all removed still has an account; refuse the
          // session outright instead of landing them on /no-access. Invited users still pass (a pending invitation is a right).
          before: async (session) => {
            const rows = [...(await deps.service.execute<{ email: string }>(sql`select email from auth."user" where id = ${session.userId}`))];
            const email = rows[0]?.email;
            return email && (await hasSignInRight(deps.service, email, now())) ? undefined : false;
          },
          // Better Auth 1.7.7 runs `after` hooks once the enclosing adapter transaction has committed (and this
          // adapter config uses none), so the user row is visible to the separate service connection here.
          after: async (session) => {
            const rows = await deps.service.execute<{ id: string; email: string; name: string; verified: boolean }>(
              sql`select id, email, name, "emailVerified" as verified from auth."user" where id = ${session.userId}`,
            );
            const u = rows[0];
            // Magic-link users are created with name ''; store NULL on the contact rather than ''.
            if (u?.verified) await acceptInvitations(deps.service, { id: u.id, email: u.email, name: u.name || null }, now());
          },
        },
      },
    },
  };
}
