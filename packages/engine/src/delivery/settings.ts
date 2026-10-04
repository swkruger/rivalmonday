import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { AGENCY_KINDS, agencyWebhook, type AlertMode, client, type Db, feedback, withTenant } from '@cs/db';
import { eq } from 'drizzle-orm';

const SLACK_HOSTS = ['hooks.slack.com'];
/** Teams incoming webhooks (legacy connectors) and Teams Workflows (Power Automate / Logic Apps) trigger hosts. */
const TEAMS_SUFFIXES = ['.webhook.office.com', '.logic.azure.com', '.environment.api.powerplatform.com'];

/** Phase 4b decision 20: why a webhook URL is refused (null = acceptable). Checked when saved and before every send. */
export function webhookUrlProblem(kind: 'slack' | 'teams', raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'not a URL';
  }
  if (u.protocol !== 'https:') return 'webhook must use https';
  if (u.username || u.password) return 'webhook URL must not carry credentials';
  if (u.port !== '') return 'webhook URL must use the default https port';
  const host = u.hostname.toLowerCase();
  const ok = kind === 'slack' ? SLACK_HOSTS.includes(host) : TEAMS_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
  return ok ? null : `${host} is not a ${kind === 'slack' ? 'Slack' : 'Teams'} webhook host`;
}

export function assertWebhookUrl(kind: 'slack' | 'teams', raw: string): URL {
  const problem = webhookUrlProblem(kind, raw);
  if (problem) throw new ToolError('invalid_input', `Invalid webhook: ${problem}`);
  return new URL(raw);
}

export async function addAgencyWebhook(db: Db, input: { agencyId: string; kind: 'slack' | 'teams'; url: string; kinds?: string[] | null; createdBy: string }): Promise<string> {
  assertWebhookUrl(input.kind, input.url);
  if (input.kinds && !input.kinds.every((k) => (AGENCY_KINDS as readonly string[]).includes(k))) throw new ToolError('invalid_input', `Webhooks take agency notification kinds only (${AGENCY_KINDS.join(', ')})`);
  const [row] = await db.insert(agencyWebhook).values({ agencyId: input.agencyId, kind: input.kind, url: input.url, kinds: input.kinds ?? null, createdBy: input.createdBy }).returning({ id: agencyWebhook.id });
  return row!.id;
}

export const ALERT_MODES: readonly AlertMode[] = ['direct', 'after_am_check', 'digest_only'];

/** Spec §9.3 client alert mode and §9.1.6 auto-send are agency decisions: agency roles only, written by the service role. */
export async function updateClientDelivery(deps: { service: Db; app: Db }, ctx: AccessContext, clientId: string, patch: { alertMode?: AlertMode; briefAutoSend?: boolean }): Promise<void> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles may change delivery settings');
  const [visible] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)));
  if (!visible || !canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  if (patch.alertMode !== undefined && !ALERT_MODES.includes(patch.alertMode)) throw new ToolError('invalid_input', `Unknown alert mode ${String(patch.alertMode)}`);
  await deps.service.transaction(async (tx) => {
    const [before] = await tx.select({ agencyId: client.agencyId, alertMode: client.alertMode, briefAutoSend: client.briefAutoSend }).from(client).where(eq(client.id, clientId)).for('update');
    if (!before) throw new ToolError('not_found', 'Client not found');
    const set = { ...(patch.alertMode !== undefined ? { alertMode: patch.alertMode } : {}), ...(patch.briefAutoSend !== undefined ? { briefAutoSend: patch.briefAutoSend } : {}) };
    if (Object.keys(set).length === 0) return;
    await tx.update(client).set(set).where(eq(client.id, clientId));
    await tx.insert(feedback).values({
      agencyId: before.agencyId, clientId, subjectType: 'client', subjectId: clientId, kind: 'edit', actor: ctx.userId,
      before: { alertMode: before.alertMode, briefAutoSend: before.briefAutoSend }, after: { alertMode: set.alertMode ?? before.alertMode, briefAutoSend: set.briefAutoSend ?? before.briefAutoSend },
    });
  });
}
