import { type AccessContext, effectiveScope, isAgencyRole, isPatFormat, PAT_PREFIX, type TokenScope } from '@cs/core';
import { hashPat } from '@cs/core/server';
import { apiToken, client, type Db, oauthGrantBinding } from '@cs/db';
import { accessContextFor, listMemberships } from '@cs/tools';
import { and, eq, isNull, sql } from 'drizzle-orm';

export interface ResolvedToken { kind: 'pat' | 'oauth'; tokenKey: string; tokenId: string; userId: string; agencyId: string; clientId: string | null; scope: TokenScope }
/** Wired by apps/web in Task 11: verifies an opaque OAuth access token and returns its user and consent, or null. */
export type VerifyOAuth = (token: string) => Promise<{ userId: string; consentId: string } | null>;

const BEARER = /^Bearer[ ]+([\x21-\x7e]{1,4096})$/i;

export async function resolveBearer(d: { service: Db; verifyOAuth: VerifyOAuth | null }, authorization: string | null): Promise<ResolvedToken | null> {
  const raw = authorization?.match(BEARER)?.[1];
  if (!raw) return null;
  if (raw.startsWith(PAT_PREFIX)) {
    if (!isPatFormat(raw)) return null;
    const [t] = await d.service.select({ id: apiToken.id, userId: apiToken.userId, agencyId: apiToken.agencyId, clientId: apiToken.clientId, scope: apiToken.scope })
      .from(apiToken).where(and(eq(apiToken.tokenHash, hashPat(raw)), isNull(apiToken.revokedAt)));
    if (!t) return null;
    return { kind: 'pat', tokenKey: `pat:${t.id}`, tokenId: t.id, userId: t.userId, agencyId: t.agencyId, clientId: t.clientId, scope: t.scope as TokenScope };
  }
  if (!d.verifyOAuth) return null;
  const info = await d.verifyOAuth(raw).catch(() => null);
  if (!info) return null;
  const [b] = await d.service.select().from(oauthGrantBinding)
    .where(and(eq(oauthGrantBinding.consentId, info.consentId), eq(oauthGrantBinding.userId, info.userId), isNull(oauthGrantBinding.revokedAt)));
  if (!b) return null;
  return { kind: 'oauth', tokenKey: `oauth:${b.consentId}`, tokenId: b.id, userId: b.userId, agencyId: b.agencyId, clientId: b.clientId, scope: b.scope as TokenScope };
}

/** d3 + d13: live membership and client status on every request; scope capped by the live role (P8). */
export async function tokenAccess(service: Db, t: ResolvedToken): Promise<{ ctx: AccessContext; scope: TokenScope } | null> {
  const ms = await listMemberships(service, t.userId);
  const m = ms.find((x) => x.agencyId === t.agencyId && (t.clientId === null ? isAgencyRole(x.role) : !isAgencyRole(x.role) && x.clientId === t.clientId));
  if (!m) return null;
  if (t.clientId !== null) {
    const [c] = await service.select({ status: client.status }).from(client).where(and(eq(client.id, t.clientId), eq(client.agencyId, t.agencyId)));
    if (c?.status !== 'active') return null;
  }
  return { ctx: await accessContextFor(service, t.userId, m), scope: effectiveScope(t.scope, m.role) };
}

/** Throttled to one write a minute per token. */
export async function touchPat(service: Db, tokenId: string): Promise<void> {
  await service.execute(sql`UPDATE api_token SET last_used_at = now() WHERE id = ${tokenId} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`);
}
