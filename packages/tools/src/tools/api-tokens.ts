import { grantableScopes, isAgencyRole, TOKEN_SCOPES, toolkit, ToolError, type AccessContext, type TokenScope } from '@cs/core';
import { generatePat } from '@cs/core/server';
import { apiToken, client, oauthGrantBinding, withTenant } from '@cs/db';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { deletePluginConsent, revokePluginTokens } from '../access/oauth';
import type { ToolDeps } from '../deps';
import { requireVisibleClient } from '../workspace/scope';
import { ApiTokenView, OAuthGrantView } from './schemas';

/**
 * Phase 6a Task 12: web-only tools behind the "AI connections" pages. A PAT's plaintext exists only in
 * `create_api_token`'s return value: it is never stored, logged or returned by anything else.
 */
const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const MAX_ACTIVE_TOKENS = 20;
const Scope = z.enum(TOKEN_SCOPES);
const OK = z.object({ ok: z.literal(true) });

function requireSignedIn(ctx: AccessContext) {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to manage AI connections');
}

/**
 * The client a list is narrowed to: client roles are forced to their own; agency roles may pick one they can access.
 * 7c1: a named client outside the caller's scope (or agency) is `not_found` for every role, never an empty or own list.
 */
async function listClientFilter(deps: ToolDeps, ctx: AccessContext, clientId: string | undefined): Promise<string | null> {
  if (clientId) await requireVisibleClient(deps, ctx, clientId);
  if (!isAgencyRole(ctx.role)) return ctx.clientScope === 'all' ? null : ctx.clientScope[0] ?? null;
  return clientId ?? null;
}

async function clientNames(deps: ToolDeps, ctx: AccessContext, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((i): i is string => !!i))];
  if (!wanted.length) return new Map();
  const rows = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id, name: client.name }).from(client).where(inArray(client.id, wanted)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function userNames(deps: ToolDeps, ids: string[]): Promise<Map<string, string | null>> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return new Map();
  const rows = [...(await deps.service.execute<{ id: string; name: string | null }>(sql`SELECT id, name FROM auth."user" WHERE id IN (${sql.join(wanted.map((w) => sql`${w}`), sql`, `)})`))];
  return new Map(rows.map((r) => [r.id, r.name]));
}

export const createApiToken = defineTool({
  name: 'create_api_token',
  access: 'write',
  description: 'Create a personal access token for connecting an AI assistant. The token is shown once.',
  input: z.object({ name: z.string().trim().min(1).max(80), scope: Scope }),
  output: z.object({ id: uuid, token: z.string(), prefix: z.string(), scope: Scope }),
  permission: 'read',
  feature: 'mcp',
  channels: ['web'],
  async handler(ctx, input, deps) {
    requireSignedIn(ctx);
    if (!grantableScopes(ctx.role).includes(input.scope)) throw new ToolError('invalid_input', "Your role can't create a token with that access level.");
    let clientId: string | null = null;
    if (!isAgencyRole(ctx.role)) {
      clientId = ctx.clientScope === 'all' ? null : ctx.clientScope[0] ?? null;
      const active = clientId ? await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(and(eq(client.id, clientId!), eq(client.status, 'active')))) : [];
      if (!active.length) throw new ToolError('invalid_input', "Your client isn't active, so a token can't be created.");
    }
    const pat = generatePat();
    const id = await deps.service.transaction(async (tx) => {
      // Serialise per user so two concurrent creates cannot both pass the cap.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`api_token:${ctx.userId}`}))`);
      const counted = [...(await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM api_token WHERE user_id = ${ctx.userId} AND revoked_at IS NULL`))];
      if ((counted[0]?.n ?? 0) >= MAX_ACTIVE_TOKENS) throw new ToolError('invalid_input', `You already have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`);
      const [row] = await tx.insert(apiToken).values({
        agencyId: ctx.agencyId, userId: ctx.userId, clientId, name: input.name, tokenHash: pat.hash, tokenPrefix: pat.prefix, scope: input.scope,
      }).returning({ id: apiToken.id });
      return row!.id;
    });
    return { id, token: pat.token, prefix: pat.prefix, scope: input.scope };
  },
});

export const revokeApiToken = defineTool({
  name: 'revoke_api_token',
  access: 'write',
  description: 'Revoke a personal access token; it stops working immediately.',
  input: z.object({ tokenId: uuid }),
  output: OK,
  permission: 'read',
  feature: 'mcp',
  channels: ['web'],
  async handler(ctx, { tokenId }, deps) {
    requireSignedIn(ctx);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.update(apiToken).set({ revokedAt: new Date() }).where(and(eq(apiToken.id, tokenId), isNull(apiToken.revokedAt))).returning({ id: apiToken.id }));
    if (!rows.length) throw new ToolError('not_found', 'Token not found');
    return { ok: true as const };
  },
});

export const listApiTokens = defineTool({
  name: 'list_api_tokens',
  supportMask: ['items[].ownerName'], // a display name can be (or contain) an e-mail
  access: 'read',
  description: 'Active personal access tokens you can see (your own; agency admins see the whole agency).',
  input: z.object({ clientId: uuid.optional() }),
  output: z.object({ items: z.array(ApiTokenView) }),
  permission: 'read',
  feature: 'mcp',
  channels: ['web'],
  async handler(ctx, input, deps) {
    requireSignedIn(ctx);
    const only = await listClientFilter(deps, ctx, input.clientId);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({
        id: apiToken.id, name: apiToken.name, prefix: apiToken.tokenPrefix, scope: apiToken.scope, clientId: apiToken.clientId, userId: apiToken.userId,
        createdAt: apiToken.createdAt, lastUsedAt: apiToken.lastUsedAt,
      }).from(apiToken).where(and(isNull(apiToken.revokedAt), only ? eq(apiToken.clientId, only) : undefined)).orderBy(desc(apiToken.createdAt)));
    const [owners, clients] = await Promise.all([userNames(deps, rows.map((r) => r.userId)), clientNames(deps, ctx, rows.map((r) => r.clientId))]);
    return {
      items: rows.map((r) => ({
        id: r.id, name: r.name, prefix: r.prefix, scope: r.scope as TokenScope, clientId: r.clientId, clientName: r.clientId ? clients.get(r.clientId) ?? null : null,
        ownerUserId: r.userId, ownerName: owners.get(r.userId) ?? null, createdAt: r.createdAt.toISOString(), lastUsedAt: iso(r.lastUsedAt), mine: r.userId === ctx.userId,
      })),
    };
  },
});

export const listOauthGrants = defineTool({
  name: 'list_oauth_grants',
  supportMask: ['items[].ownerName'], // a display name can be (or contain) an e-mail
  access: 'read',
  description: 'AI apps connected through sign-in (OAuth) that you can see.',
  input: z.object({ clientId: uuid.optional() }),
  output: z.object({ items: z.array(OAuthGrantView) }),
  permission: 'read',
  feature: 'mcp',
  channels: ['web'],
  async handler(ctx, input, deps) {
    requireSignedIn(ctx);
    const only = await listClientFilter(deps, ctx, input.clientId);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({
        id: oauthGrantBinding.id, oauthClientId: oauthGrantBinding.oauthClientId, scope: oauthGrantBinding.scope, clientId: oauthGrantBinding.clientId,
        userId: oauthGrantBinding.userId, createdAt: oauthGrantBinding.createdAt,
      }).from(oauthGrantBinding).where(and(isNull(oauthGrantBinding.revokedAt), only ? eq(oauthGrantBinding.clientId, only) : undefined)).orderBy(desc(oauthGrantBinding.createdAt)));
    const appIds = [...new Set(rows.map((r) => r.oauthClientId))];
    const apps = new Map<string, string | null>();
    if (appIds.length) {
      const found = [...(await deps.service.execute<{ clientId: string; name: string | null }>(sql`SELECT "clientId", name FROM auth."oauthClient" WHERE "clientId" IN (${sql.join(appIds.map((a) => sql`${a}`), sql`, `)})`))];
      for (const a of found) apps.set(a.clientId, a.name);
    }
    const [owners, clients] = await Promise.all([userNames(deps, rows.map((r) => r.userId)), clientNames(deps, ctx, rows.map((r) => r.clientId))]);
    return {
      items: rows.map((r) => ({
        id: r.id, appName: apps.get(r.oauthClientId) || 'AI app', scope: r.scope as TokenScope, clientId: r.clientId, clientName: r.clientId ? clients.get(r.clientId) ?? null : null,
        ownerName: owners.get(r.userId) ?? null, connectedAt: r.createdAt.toISOString(), mine: r.userId === ctx.userId,
      })),
    };
  },
});

export const revokeOauthGrant = defineTool({
  name: 'revoke_oauth_grant',
  access: 'write',
  description: 'Disconnect an AI app; its access stops immediately and it must ask for consent again.',
  input: z.object({ grantId: uuid }),
  output: OK,
  permission: 'read',
  feature: 'mcp',
  channels: ['web'],
  async handler(ctx, { grantId }, deps) {
    requireSignedIn(ctx);
    // 1. The binding goes first (RLS authorises it): verifyOAuth then fails closed even if step 2 fails.
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.update(oauthGrantBinding).set({ revokedAt: new Date() }).where(and(eq(oauthGrantBinding.id, grantId), isNull(oauthGrantBinding.revokedAt)))
        .returning({ userId: oauthGrantBinding.userId, oauthClientId: oauthGrantBinding.oauthClientId, consentId: oauthGrantBinding.consentId }));
    const b = rows[0];
    if (!b) throw new ToolError('not_found', 'Connection not found');
    // 2. Plugin tokens and consent (service role, one transaction), so the next authorize shows consent again.
    await deps.service.transaction(async (tx) => {
      await revokePluginTokens(tx, b.userId, b.oauthClientId);
      await deletePluginConsent(tx, b.consentId);
    });
    return { ok: true as const };
  },
});

export const apiTokenTools = [createApiToken, revokeApiToken, listApiTokens, listOauthGrants, revokeOauthGrant];
