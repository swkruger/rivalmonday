import 'server-only';
import type { AccessContext } from '@cs/core';
import { revalidatePath } from 'next/cache';
import type { CreateTokenResult, RowResult } from '@/components/ai-connections';
import { runTool } from './run-tool';

/**
 * Phase 6a: the write half of the AI connections pages (`/c/<id>/settings/ai`, `/agency/settings/ai`). Every write is a
 * registered tool via `runTool`; the caller has already re-derived `ctx` and checked its role. The created token's
 * text is returned to the form once and never logged.
 */
export async function createToken(ctx: AccessContext, fd: FormData, path: string): Promise<CreateTokenResult> {
  const r = await runTool<{ id: string; token: string; prefix: string }>(ctx, 'create_api_token', {
    name: String(fd.get('name') ?? ''),
    scope: String(fd.get('scope') ?? ''),
  });
  if (!r.ok) return r;
  revalidatePath(path);
  return { ok: true, id: r.data.id, token: r.data.token, prefix: r.data.prefix };
}

export async function revokeToken(ctx: AccessContext, fd: FormData, path: string): Promise<RowResult> {
  const tokenId = String(fd.get('tokenId') ?? '');
  const r = await runTool(ctx, 'revoke_api_token', { tokenId });
  if (!r.ok) return { ...r, rowId: tokenId };
  revalidatePath(path);
  return { ok: true, message: 'Token revoked.', rowId: tokenId };
}

export async function revokeGrant(ctx: AccessContext, fd: FormData, path: string): Promise<RowResult> {
  const grantId = String(fd.get('grantId') ?? '');
  const r = await runTool(ctx, 'revoke_oauth_grant', { grantId });
  if (!r.ok) return { ...r, rowId: grantId };
  revalidatePath(path);
  return { ok: true, message: 'App disconnected.', rowId: grantId };
}
