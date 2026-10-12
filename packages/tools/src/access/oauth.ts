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
 * SQL: binding `b` still matches a live membership, as `tokenAccess` (@cs/mcp) requires: an agency role in its agency for
 * an agency-wide binding; for a client-bound one a client role for that client, and the client still `active`.
 */
const LIVE = sql`(
  EXISTS (SELECT 1 FROM membership m WHERE m.user_id = b.user_id AND m.agency_id = b.agency_id AND (
    (b.client_id IS NULL AND m.role IN ('agency_admin', 'account_manager'))
    OR (b.client_id IS NOT NULL AND m.role IN ('client_owner', 'client_viewer') AND m.client_id = b.client_id)))
  AND (b.client_id IS NULL OR EXISTS (SELECT 1 FROM client c WHERE c.id = b.client_id AND c.agency_id = b.agency_id AND c.status = 'active')))`;

/**
 * Ruling R9 (+ fix round 1): a plugin consent without a usable binding would let the plugin skip the consent page and
 * issue tokens our verifier refuses (an MCP client then loops on 401s the user never sees). Here, for this user:
 * 1. active bindings whose membership is gone (or whose client is no longer active) are marked revoked;
 * 2. plugin consents without an active binding are deleted, so the next authorize shows the consent page;
 * 3. every (user, OAuth client) pair touched by 1 or 2 has its plugin tokens revoked. Tokens are keyed by the pair, not
 *    by consent, so a stray token must not come back to life under the binding the next consent writes.
 * `oauthClientId` null = every OAuth client of this user.
 */
export async function dropUnboundConsents(service: Db, userId: string, oauthClientId: string | null): Promise<void> {
  await service.transaction(async (tx) => {
    const stale = [...(await tx.execute<{ oauth_client_id: string }>(sql`
      UPDATE oauth_grant_binding b SET revoked_at = now()
      WHERE b.user_id = ${userId} AND b.revoked_at IS NULL
        AND (${oauthClientId}::text IS NULL OR b.oauth_client_id = ${oauthClientId})
        AND NOT ${LIVE}
      RETURNING b.oauth_client_id`))];
    const dropped = [...(await tx.execute<{ clientId: string }>(sql`
      DELETE FROM auth."oauthConsent" c
      WHERE c."userId" = ${userId}
        AND (${oauthClientId}::text IS NULL OR c."clientId" = ${oauthClientId})
        AND NOT EXISTS (SELECT 1 FROM oauth_grant_binding b WHERE b.consent_id = c.id AND b.user_id = ${userId} AND b.oauth_client_id = c."clientId" AND b.revoked_at IS NULL)
      RETURNING c."clientId"`))];
    const pairs = new Set([...stale.map((r) => r.oauth_client_id), ...dropped.map((r) => r.clientId)]);
    for (const c of pairs) await revokePluginTokens(tx, userId, c);
  });
}
