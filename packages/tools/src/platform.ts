import { type AccessContext, ToolError } from '@cs/core';
import { sql } from 'drizzle-orm';
import type { ToolDeps } from './deps';

export { normalizeAdminEmails } from '@cs/core';

/** Decision 2: a signed-in user (never an email-link guest) whose account email is listed in PLATFORM_ADMIN_EMAILS. */
export async function isPlatformOperator(deps: Pick<ToolDeps, 'service' | 'platformAdmins'>, ctx: AccessContext): Promise<boolean> {
  const admins = deps.platformAdmins ?? [];
  if (admins.length === 0 || ctx.userId.startsWith('contact:')) return false;
  const rows = [...(await deps.service.execute<{ email: string }>(sql`select email from auth."user" where id = ${ctx.userId}`))];
  const email = rows[0]?.email?.toLowerCase();
  return email !== undefined && admins.includes(email);
}

/** Every platform-operator tool calls this first: anyone else gets `permission_denied` (→ 404). */
export async function requirePlatformOperator(deps: Pick<ToolDeps, 'service' | 'platformAdmins'>, ctx: AccessContext): Promise<void> {
  if (!(await isPlatformOperator(deps, ctx))) throw new ToolError('permission_denied', 'Platform operators only');
}
