import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/**
 * Phase 6a: the few writes/reads on @better-auth/oauth-provider's tables (schema `auth`, migration 0041) that the
 * consent flow (apps/web) and `revoke_oauth_grant` (Task 12) need. Service role only; names verified by the Task 1 spike.
 */
type Executor = Pick<Db, 'execute'>;

/** Revokes every access and refresh token the OAuth client holds for this user (verify then fails, refresh 400s). */
export async function revokePluginTokens(tx: Executor, userId: string, oauthClientId: string): Promise<void> {
  await tx.execute(sql`UPDATE auth."oauthAccessToken" SET revoked = now() WHERE "userId" = ${userId} AND "clientId" = ${oauthClientId} AND revoked IS NULL`);
  await tx.execute(sql`UPDATE auth."oauthRefreshToken" SET revoked = now() WHERE "userId" = ${userId} AND "clientId" = ${oauthClientId} AND revoked IS NULL`);
}

/** Deletes one plugin consent, so the next authorize shows the consent page. It does NOT revoke tokens (spike item 8). */
export async function deletePluginConsent(tx: Executor, consentId: string): Promise<void> {
  await tx.execute(sql`DELETE FROM auth."oauthConsent" WHERE id = ${consentId}`);
}

/** The newest plugin consent for (user, OAuth client). There is no unique index on the pair, so take the newest. */
export async function consentIdFor(service: Executor, userId: string, oauthClientId: string): Promise<string | null> {
  const rows = [...(await service.execute<{ id: string }>(sql`SELECT id FROM auth."oauthConsent" WHERE "userId" = ${userId} AND "clientId" = ${oauthClientId} ORDER BY "updatedAt" DESC LIMIT 1`))];
  return rows[0]?.id ?? null;
}

/**
 * Ruling R9: a plugin consent without an active `oauth_grant_binding` (revoked, or never bound) would let the plugin
 * skip the consent page and issue a token our verifier refuses. Deleting those consents makes the plugin ask again,
 * so the binding is always rewritten. `oauthClientId` null = every OAuth client of this user.
 */
export async function dropUnboundConsents(service: Executor, userId: string, oauthClientId: string | null): Promise<void> {
  await service.execute(sql`
    DELETE FROM auth."oauthConsent" c
    WHERE c."userId" = ${userId}
      AND (${oauthClientId}::text IS NULL OR c."clientId" = ${oauthClientId})
      AND NOT EXISTS (SELECT 1 FROM oauth_grant_binding b WHERE b.consent_id = c.id AND b.user_id = ${userId} AND b.oauth_client_id = c."clientId" AND b.revoked_at IS NULL)`);
}
