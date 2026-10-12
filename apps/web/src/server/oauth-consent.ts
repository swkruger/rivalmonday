import { getOAuthProviderApi, type OAuthOptions, type Scope } from '@better-auth/oauth-provider';
import { isAgencyRole, scopeCovers, TOKEN_SCOPES, type TokenScope, grantableScopes } from '@cs/core';
import { client, type Db, oauthGrantBinding } from '@cs/db';
import type { VerifyOAuth } from '@cs/mcp';
import { consentIdFor, listMemberships, revokePluginTokens } from '@cs/tools';
import type { AuthContext, GenericEndpointContext } from 'better-auth';
import { and, eq, isNull, sql } from 'drizzle-orm';

export interface ConsentOption { membershipId: string; label: string; agencyId: string; clientId: string | null; scopes: TokenScope[] }
export type ConsentTarget = { agencyId: string; clientId: string | null; scope: TokenScope };

/** P9 + d4: what this user may bind. Client options need an active client with the `mcp` feature. */
export async function consentOptions(service: Db, userId: string, requested: string | null): Promise<ConsentOption[]> {
  const asked = (requested ?? '').split(/\s+/).filter((s): s is TokenScope => (TOKEN_SCOPES as readonly string[]).includes(s));
  const cap: TokenScope | null = asked.length ? asked.reduce((a, b) => (scopeCovers(a, b) ? a : b)) : null;
  const out: ConsentOption[] = [];
  for (const m of await listMemberships(service, userId)) {
    const agency = isAgencyRole(m.role);
    if (!agency) {
      const [c] = await service.select({ status: client.status, features: client.features }).from(client).where(eq(client.id, m.clientId!));
      if (c?.status !== 'active' || !(c.features ?? []).includes('mcp')) continue;
    }
    const scopes = grantableScopes(m.role).filter((s) => cap === null || scopeCovers(cap, s));
    if (!scopes.length) continue;
    out.push({ membershipId: m.id, agencyId: m.agencyId, clientId: agency ? null : m.clientId, scopes,
      label: agency ? `${m.agencyName}: all clients you can access` : `${m.clientName} (${m.agencyName})` });
  }
  return out;
}

export function pickConsent(options: ConsentOption[], membershipId: string, scope: string): ConsentTarget | null {
  const o = options.find((x) => x.membershipId === membershipId);
  if (!o || !(o.scopes as string[]).includes(scope)) return null; // tampered form
  return { agencyId: o.agencyId, clientId: o.clientId, scope: scope as TokenScope };
}

/**
 * Review focus 4: written after the plugin accepted the consent and BEFORE the browser gets the redirect carrying the
 * code. A re-consent that changes workspace, scope or user revokes every token issued under the old binding.
 */
export async function bindConsent(service: Db, b: { consentId: string; oauthClientId: string; userId: string; target: ConsentTarget }): Promise<void> {
  await service.transaction(async (tx) => {
    const [prev] = await tx.select().from(oauthGrantBinding).where(eq(oauthGrantBinding.consentId, b.consentId)).for('update');
    const changed = prev && (prev.revokedAt !== null || prev.userId !== b.userId || prev.agencyId !== b.target.agencyId || prev.clientId !== b.target.clientId || prev.scope !== b.target.scope);
    if (changed) await revokePluginTokens(tx, b.userId, b.oauthClientId);
    await tx.insert(oauthGrantBinding)
      .values({ consentId: b.consentId, oauthClientId: b.oauthClientId, userId: b.userId, agencyId: b.target.agencyId, clientId: b.target.clientId, scope: b.target.scope })
      .onConflictDoUpdate({ target: oauthGrantBinding.consentId, set: { oauthClientId: b.oauthClientId, userId: b.userId, agencyId: b.target.agencyId, clientId: b.target.clientId, scope: b.target.scope, revokedAt: null, createdAt: new Date() } });
  });
}

/** The OAuth client's registered name (DCR `client_name`), or null for an unknown client. */
export async function oauthClientName(service: Db, oauthClientId: string): Promise<{ name: string | null } | null> {
  const rows = [...(await service.execute<{ name: string | null }>(sql`SELECT name FROM auth."oauthClient" WHERE "clientId" = ${oauthClientId} AND disabled IS NOT TRUE`))];
  if (!rows[0]) return null;
  return { name: rows[0].name?.trim() || null };
}

/** Rebuilds the signed OAuth query from Next's `searchParams` (repeated keys arrive as arrays; order does not matter). */
export function oauthQueryFrom(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  return q.toString();
}

/**
 * Ruling R7: the plugin sends a signed-out user to `/sign-in?<signed authorize query>` with no `next`. When that query
 * carries a valid signature, sign-in resumes at the authorize endpoint (which re-validates everything itself).
 */
export async function oauthResumePath(params: Record<string, string | string[] | undefined>, secret: string, verify: (q: string, s: string) => Promise<boolean>): Promise<string | null> {
  if (typeof params.client_id !== 'string' || typeof params.sig !== 'string') return null;
  const q = oauthQueryFrom(params);
  if (!(await verify(q, secret).catch(() => false))) return null;
  return `/api/auth/oauth2/authorize?${q}`;
}

type ProviderOptions = OAuthOptions<Scope[]>;
const providerOptions = (ctx: AuthContext): ProviderOptions | null =>
  ((ctx.options.plugins ?? []).find((p) => p.id === 'oauth-provider') as { options?: ProviderOptions } | undefined)?.options ?? null;

/**
 * `/mcp`'s OAuth verifier (spike item 7): the plugin checks the hashed opaque token is known, unrevoked, unexpired, its
 * client enabled and session alive (it throws otherwise). We then require the `/mcp` audience when one is recorded,
 * refuse DPoP-bound tokens (not supported here), and resolve the newest consent for (user, client), which must have an
 * ACTIVE binding for the same user and client (R9: fail closed; `resolveBearer` re-checks it). Never throws.
 */
// `context` is `auth.$context`; its inferred type varies with the plugin list, so it is taken as unknown.
export function createVerifyOAuth(d: { context: () => Promise<unknown>; service: Db; appUrl: string; now?: () => number }): VerifyOAuth {
  const resource = `${d.appUrl}/mcp`;
  return async (token) => {
    try {
      const ctx = (await d.context()) as AuthContext;
      const opts = providerOptions(ctx);
      if (!opts) return null;
      const p = await getOAuthProviderApi({ context: ctx } as unknown as GenericEndpointContext, opts).requireActiveAccessToken(token);
      if (p.active !== true || typeof p.sub !== 'string' || typeof p.client_id !== 'string') return null;
      if (typeof p.exp === 'number' && p.exp * 1000 <= (d.now ?? Date.now)()) return null;
      if ((p as { cnf?: unknown }).cnf !== undefined) return null;
      if (p.aud !== undefined && !(Array.isArray(p.aud) ? p.aud : [p.aud]).includes(resource)) return null;
      const consentId = await consentIdFor(d.service, p.sub, p.client_id);
      if (!consentId) return null;
      const [b] = await d.service.select({ id: oauthGrantBinding.id }).from(oauthGrantBinding).where(and(
        eq(oauthGrantBinding.consentId, consentId), eq(oauthGrantBinding.userId, p.sub), eq(oauthGrantBinding.oauthClientId, p.client_id), isNull(oauthGrantBinding.revokedAt)));
      return b ? { userId: p.sub, consentId } : null;
    } catch {
      return null;
    }
  };
}
