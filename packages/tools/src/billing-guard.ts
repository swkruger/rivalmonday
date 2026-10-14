import { billingAccess, syncSeats } from '@cs/billing';
import { type WriteGuard, ToolError } from '@cs/core';
import type { ToolDeps } from './deps';
import { knowledgeAdminTools } from './tools/knowledge-admin';
import { modelOpsTools } from './tools/model-ops';
import { platformConsoleTools } from './tools/platform-console';
import { platformCostTools } from './tools/platform-costs';
import { supportTools } from './tools/support';
import { themeTools } from './tools/themes';

export const SERVICE_PAUSED_MESSAGE = 'Service is paused. Update your payment method to resume.';
const PAUSED_AGENCY_STAFF_MESSAGE = "Your agency's account needs attention.";
const PAUSED_CLIENT_MESSAGE = 'This workspace is temporarily unavailable.';

/** R17: only the agency admin can act on the payment problem; everyone else gets copy that doesn't expose billing. */
function pausedMessage(role: string): string {
  if (role === 'agency_admin') return SERVICE_PAUSED_MESSAGE;
  return role === 'account_manager' ? PAUSED_AGENCY_STAFF_MESSAGE : PAUSED_CLIENT_MESSAGE;
}

/** R19: seat sync after commit is best-effort (the daily job reconciles); it must never fail or stall the tool. Logs no payload. */
export async function postCommitSeatSync(deps: ToolDeps, agencyId: string): Promise<void> {
  if (!deps.billing) return;
  await syncSeats(deps.service, deps.billing, agencyId).catch((e: unknown) => {
    console.error('[billing] post-commit seat sync failed', { agencyId }, (e as { name?: string } | null)?.name);
  });
}

/** Platform-operator tools act on the platform, not on a paying agency, so a paused home agency never blocks them. Derived from the module arrays, not guessed names. */
const PLATFORM_TOOLS: readonly string[] = [...platformConsoleTools, ...platformCostTools, ...modelOpsTools, ...knowledgeAdminTools, ...supportTools, ...themeTools].map((t) => t.name);

/** Writes that stay open while the agency is `read_only`/`suspended`: paying to resume, and managing who has access. */
export const PAUSED_WRITE_ALLOW_LIST: readonly string[] = [
  'create_checkout_session', 'create_portal_session', 'redeem_discount_code',
  'invite_member', 'revoke_membership', 'revoke_invitation',
  ...PLATFORM_TOOLS,
];

/** R4: refuses write tools for an agency whose billing state is `read_only` or `suspended` (`service_paused`). */
export function billingWriteGuard(deps: ToolDeps): WriteGuard {
  return async (ctx, tool) => {
    if (PAUSED_WRITE_ALLOW_LIST.includes(tool.name)) return;
    const access = await billingAccess(deps.service, ctx.agencyId);
    if (access.readOnly || access.suspended) throw new ToolError('service_paused', pausedMessage(ctx.role));
  };
}
