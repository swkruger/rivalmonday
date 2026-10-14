import { billingAccess } from '@cs/billing';
import { type WriteGuard, ToolError } from '@cs/core';
import type { ToolDeps } from './deps';
import { knowledgeAdminTools } from './tools/knowledge-admin';
import { modelOpsTools } from './tools/model-ops';
import { platformConsoleTools } from './tools/platform-console';
import { platformCostTools } from './tools/platform-costs';
import { supportTools } from './tools/support';
import { themeTools } from './tools/themes';

export const SERVICE_PAUSED_MESSAGE = 'Service is paused. Update your payment method to resume.';

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
    if (access.readOnly || access.suspended) throw new ToolError('service_paused', SERVICE_PAUSED_MESSAGE);
  };
}
