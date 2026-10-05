import type { Db } from '@cs/db';
import type { Branding, EmailPayload } from '@cs/email';
import { acceptInvitations, hasSignInRight } from '@cs/tools';
import type { BetterAuthOptions } from 'better-auth';
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
  now?: () => Date;
}

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
        // Decision 2: no link for people without a right to sign in. The check and the send run in the background, so the
        // response (status, body and timing) is the same either way and a failed send never surfaces to the caller.
        sendMagicLink: ({ email, url }) => {
          deps.runInBackground((async () => {
            if (!(await hasSignInRight(deps.service, email, now()))) return;
            await deps.sendEmail(email, { template: 'sign_in', props: { branding: await deps.branding(), url, expiresMinutes: MAGIC_LINK_MINUTES } });
          })().catch((e: unknown) => {
            // Never log the link or token; the error text comes from the DB, the renderer or the transport.
            console.error(`[auth] sign-in link not sent: ${e instanceof Error ? e.message : String(e)}`);
          }));
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          // Covers Google and a magic link whose invitation was revoked after it was sent; `false` blocks the insert.
          before: async (user) => ((await hasSignInRight(deps.service, user.email, now())) ? undefined : false),
        },
      },
      session: {
        create: {
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
