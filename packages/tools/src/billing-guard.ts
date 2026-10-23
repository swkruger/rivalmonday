import { ACCOUNT_NEEDS_ATTENTION_MESSAGE, billingAccess, syncSeats } from '@cs/billing';
import { type WriteGuard, ToolError } from '@cs/core';
import type { ToolDeps } from './deps';
import { knowledgeAdminTools } from './tools/knowledge-admin';
import { modelOpsTools } from './tools/model-ops';
import { platformBillingTools } from './tools/platform-billing';
import { platformConsoleTools } from './tools/platform-console';
import { platformCostTools } from './tools/platform-costs';
import { spendGuardPlatformTools } from './tools/spend-guard';
import { usagePlatformTools } from './tools/usage';
import { platformSignupsTools } from './tools/platform-signups';
import { supportTools } from './tools/support';
import { topicTools } from './tools/topics';

export const SERVICE_PAUSED_MESSAGE = 'Service is paused. Update your payment method to resume.';
const PAUSED_AGENCY_STAFF_MESSAGE = ACCOUNT_NEEDS_ATTENTION_MESSAGE;
const PAUSED_CLIENT_MESSAGE = 'This workspace is temporarily unavailable.';

/** R17: only the agency admin can act on the payment problem; everyone else gets copy that doesn't expose billing. */
export function pausedMessage(role: string): string {
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
const PLATFORM_TOOLS: readonly string[] = [...platformConsoleTools, ...platformBillingTools, ...platformSignupsTools, ...platformCostTools, ...usagePlatformTools, ...spendGuardPlatformTools, ...modelOpsTools, ...knowledgeAdminTools, ...supportTools, ...topicTools].map((t) => t.name);

/**
 * Writes that stay open while the agency is `read_only`/`suspended`: paying to resume, managing who has access, and
 * self-protection (R28: revoking tokens/grants, opting out of notifications, removing a recipient).
 */
export const PAUSED_WRITE_ALLOW_LIST: readonly string[] = [
  'create_checkout_session', 'create_portal_session', 'open_billing_portal', 'redeem_discount_code', 'pause_client', 'disconnect_stripe', 'disable_client_billing',
  'invite_member', 'revoke_membership', 'revoke_invitation',
  'revoke_api_token', 'revoke_oauth_grant', 'set_my_notification_pref', 'deactivate_recipient',
  ...PLATFORM_TOOLS,
];

/** Up-front refusal for non-registry entry points (Ask turn, MCP `tools/call`): `service_paused` for a `read_only`/`suspended` agency, role-aware copy. */
export async function assertAgencyServiceable(service: ToolDeps['service'], ctx: { agencyId: string; role: string }): Promise<void> {
  const access = await billingAccess(service, ctx.agencyId);
  if (access.readOnly || access.suspended) throw new ToolError('service_paused', pausedMessage(ctx.role));
}

/** R4: refuses write tools for an agency whose billing state is `read_only` or `suspended` (`service_paused`). */
export function billingWriteGuard(deps: ToolDeps): WriteGuard {
  return async (ctx, tool) => {
    if (PAUSED_WRITE_ALLOW_LIST.includes(tool.name)) return;
    await assertAgencyServiceable(deps.service, ctx);
  };
}
