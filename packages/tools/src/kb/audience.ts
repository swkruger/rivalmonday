import { type AccessContext, ToolError, viewerAudience, type ViewerAudience } from '@cs/core';
import { requirePlatformOperator, type PlatformDeps } from '../platform';

export type HelpContext = 'platform' | 'agency' | 'client';

/**
 * The help audience of a knowledge read from its caller's role alone (any channel): agency roles → `agency`; client roles,
 * guests and client-scoped MCP/Ask tokens (their ctx carries the client role) → `client`. Never `operator`: operator
 * content needs an explicit platform context (`helpAudienceFor`).
 */
export function roleAudience(ctx: AccessContext): ViewerAudience {
  return viewerAudience(ctx.role, 'client'); // outside platform context the result depends on the role only
}

/** `platform` context is for platform operators only (anyone else: `not_found`, like an unknown page); otherwise `roleAudience`. */
export async function helpAudienceFor(deps: PlatformDeps, ctx: AccessContext, context?: HelpContext): Promise<ViewerAudience> {
  if (context !== 'platform') return roleAudience(ctx);
  try {
    await requirePlatformOperator(deps, ctx);
  } catch (e) {
    if (e instanceof ToolError && e.code === 'permission_denied') throw new ToolError('not_found', 'Not found');
    throw e;
  }
  return viewerAudience(ctx.role, 'platform');
}
