import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { agency, type AgencyBranding, agencyWebhook, type AlertMode, auditLog, client, contact, type Db } from '@cs/db';
import { type Branding, resolveBranding } from '@cs/email';
import { addAgencyWebhook, addContact, ALERT_MODES, loadBranding, postWebhook, updateClientDelivery, type WebhookPostResult, webhookUrlProblem } from '@cs/engine';
import { and, asc, count, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { validTimezone } from './timezone';

const requireAdmin = (ctx: AccessContext) => {
  if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins change agency settings');
};
const requireAgencyFor = (ctx: AccessContext, clientId: string) => {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles manage delivery');
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
};

/** True for a Postgres unique-violation (SQLSTATE 23505), including Drizzle 0.44's driver-error wrapper (HANDOVER §6). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null | undefined;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

// ---- branding (global constraint: accent #F5A524 is never overridable — it is dropped here, not merely defaulted) ----
const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Keys this layer accepts and stores. `accent` is intentionally absent: `resolveBranding` always returns the fixed accent. */
const LIMITS: Record<Exclude<keyof AgencyBranding, 'accent'>, number> = { displayName: 80, logoUrl: 500, primary: 7, secondary: 7, fromName: 80, fromEmail: 200, signOff: 300, assistantName: 30 };
type StorableKey = keyof typeof LIMITS;

function clean(input: AgencyBranding): AgencyBranding {
  const out: AgencyBranding = {};
  for (const key of Object.keys(LIMITS) as StorableKey[]) {
    const v = input[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

/** An uploaded logo is served by this deployment (`/files/logo/…`), which in dev is plain http; external logos stay https-only. */
const isOwnLogoUrl = (url: string, appUrl: string | undefined): boolean => !!appUrl && url.startsWith(`${appUrl.replace(/\/+$/, '')}/files/logo/`);

export function brandingProblems(input: AgencyBranding, appUrl?: string): string[] {
  const b = clean(input);
  const problems: string[] = [];
  for (const [key, max] of Object.entries(LIMITS) as [StorableKey, number][]) {
    if ((b[key]?.length ?? 0) > max) problems.push(`${key} is longer than ${max} characters`);
  }
  for (const key of ['primary', 'secondary'] as const) if (b[key] && !HEX.test(b[key]!)) problems.push(`${key} must be a colour like #47A8E7`);
  if (b.logoUrl) {
    try {
      if (new URL(b.logoUrl).protocol !== 'https:' && !isOwnLogoUrl(b.logoUrl, appUrl)) problems.push('logoUrl must start with https://');
    } catch {
      problems.push('logoUrl is not a URL');
    }
  }
  if (b.fromEmail && !EMAIL.test(b.fromEmail)) problems.push('fromEmail is not an email address');
  return problems;
}

export async function getAgencyBranding(service: Db, ctx: AccessContext): Promise<{ stored: AgencyBranding; resolved: Branding }> {
  const [a] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, ctx.agencyId));
  if (!a) throw new ToolError('not_found', 'Agency not found');
  return { stored: a.branding ?? {}, resolved: resolveBranding(a.name, a.branding ?? null) };
}

export async function updateAgencyBranding(service: Db, ctx: AccessContext, input: AgencyBranding, appUrl?: string): Promise<void> {
  requireAdmin(ctx);
  const problems = brandingProblems(input, appUrl);
  if (problems.length) throw new ToolError('invalid_input', problems.join('; '));
  await service.update(agency).set({ branding: clean(input) }).where(eq(agency.id, ctx.agencyId));
}

// ---- webhooks (the URL is a secret: never returned) ----
export interface WebhookView {
  id: string;
  kind: 'slack' | 'teams';
  host: string;
  kinds: string[] | null;
  active: boolean;
  createdAt: Date;
}

export async function listWebhooks(service: Db, ctx: AccessContext): Promise<WebhookView[]> {
  requireAdmin(ctx);
  const rows = await service.select().from(agencyWebhook).where(eq(agencyWebhook.agencyId, ctx.agencyId)).orderBy(asc(agencyWebhook.createdAt));
  return rows.map((w) => ({ id: w.id, kind: w.kind as WebhookView['kind'], host: new URL(w.url).hostname, kinds: w.kinds ?? null, active: w.active, createdAt: w.createdAt }));
}

export async function addWebhook(service: Db, ctx: AccessContext, input: { kind: 'slack' | 'teams'; url: string; kinds?: string[] | null }): Promise<string> {
  requireAdmin(ctx);
  const problem = webhookUrlProblem(input.kind, input.url);
  if (problem) throw new ToolError('invalid_input', problem);
  return addAgencyWebhook(service, { agencyId: ctx.agencyId, kind: input.kind, url: input.url.trim(), kinds: input.kinds ?? null, createdBy: ctx.userId });
}

export async function setWebhookActive(service: Db, ctx: AccessContext, id: string, active: boolean): Promise<void> {
  requireAdmin(ctx);
  const rows = await service.update(agencyWebhook).set({ active }).where(and(eq(agencyWebhook.id, id), eq(agencyWebhook.agencyId, ctx.agencyId))).returning({ id: agencyWebhook.id });
  if (rows.length === 0) throw new ToolError('not_found', 'Webhook not found');
}

/** 15c-2a T10: hard delete; the webhook's notification rows go with it (FK `ON DELETE CASCADE`). */
export async function deleteWebhook(service: Db, ctx: AccessContext, id: string): Promise<void> {
  requireAdmin(ctx);
  const rows = await service.delete(agencyWebhook).where(and(eq(agencyWebhook.id, id), eq(agencyWebhook.agencyId, ctx.agencyId))).returning({ id: agencyWebhook.id });
  if (rows.length === 0) throw new ToolError('not_found', 'Webhook not found');
}

/** Spec §6: at most 5 test sends per webhook in any 10 minutes. */
export const WEBHOOK_TEST_LIMIT = { max: 5, windowMinutes: 10 };
const TEST_WEBHOOK_TOOL = 'test_webhook';
const WEBHOOK_TEST_TIMEOUT_MS = 5_000;

/**
 * 15c-2a B2: prior successful `test_webhook` calls for this webhook, counted from the registry's audit rows (same agency,
 * tool and input hash of the parsed input `{ webhookId }`, `outcome = 'ok'`, inside the window). Refused calls are
 * audited with their error code, so they never count. The current call's own row is written after the handler.
 */
async function recentWebhookTests(service: Db, agencyId: string, webhookId: string): Promise<number> {
  const [row] = await service.select({ n: count() }).from(auditLog).where(and(
    eq(auditLog.agencyId, agencyId),
    eq(auditLog.tool, TEST_WEBHOOK_TOOL),
    eq(auditLog.inputHash, hashInput({ webhookId })),
    eq(auditLog.outcome, 'ok'),
    gt(auditLog.createdAt, sql`now() - make_interval(mins => ${WEBHOOK_TEST_LIMIT.windowMinutes})`),
  ));
  return Number(row?.n ?? 0);
}

/**
 * 15c-2a T10 / B9: posts one test message to the agency's own webhook (active or not) and reports what the receiver said.
 * Never writes a `notification` row. The URL goes through the host allow-list inside `postWebhook` (not the SSRF guard:
 * the allow-list is stricter), and redirects are never followed.
 */
export async function testWebhook(deps: { service: Db; webhookFetch?: typeof fetch }, ctx: AccessContext, id: string): Promise<WebhookPostResult> {
  requireAdmin(ctx);
  const [h] = await deps.service.select({ kind: agencyWebhook.kind, url: agencyWebhook.url }).from(agencyWebhook).where(and(eq(agencyWebhook.id, id), eq(agencyWebhook.agencyId, ctx.agencyId)));
  if (!h) throw new ToolError('not_found', 'Webhook not found');
  if ((await recentWebhookTests(deps.service, ctx.agencyId, id)) >= WEBHOOK_TEST_LIMIT.max) {
    throw new ToolError('rate_limited', 'You can send another test in a few minutes.', { userFacing: true });
  }
  const name = (await loadBranding(deps.service, ctx.agencyId)).displayName;
  const msg = { title: `Test message from ${name}`, body: `Briefs and alerts from ${name} will appear in this channel.`, link: null };
  return postWebhook(h.kind as 'slack' | 'teams', h.url, msg, { ...(deps.webhookFetch ? { fetch: deps.webhookFetch } : {}), timeoutMs: WEBHOOK_TEST_TIMEOUT_MS });
}

// ---- client recipients (email-only contacts; members get theirs from acceptInvitations) ----
export interface RecipientView {
  contactId: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  hasAccount: boolean;
}

export async function listClientRecipients(service: Db, ctx: AccessContext, clientId: string): Promise<RecipientView[]> {
  requireAgencyFor(ctx, clientId);
  // 7c1: refuse another agency's (or an archived) client instead of answering with an empty list.
  const [own] = await service.select({ id: client.id }).from(client).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId), isNull(client.archivedAt)));
  if (!own) throw new ToolError('not_found', 'Client not found');
  const rows = await service.select().from(contact).where(and(eq(contact.agencyId, ctx.agencyId), eq(contact.clientId, clientId))).orderBy(asc(sql`lower(${contact.email})`));
  return rows.map((c) => ({ contactId: c.id, email: c.email, name: c.name, role: c.role, active: c.active, hasAccount: c.userId !== null }));
}

export async function addClientRecipient(
  service: Db,
  ctx: AccessContext,
  input: { clientId: string; email: string; name?: string | null; role: 'client_owner' | 'client_viewer' },
): Promise<string> {
  requireAgencyFor(ctx, input.clientId);
  if (input.role !== 'client_owner' && input.role !== 'client_viewer') throw new ToolError('invalid_input', 'Recipients are client owners or viewers');
  try {
    return await addContact(service, { agencyId: ctx.agencyId, clientId: input.clientId, role: input.role, email: input.email.trim(), name: input.name?.trim() || null });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ToolError('invalid_input', 'That email already receives this client’s updates', { cause: err });
    throw err;
  }
}

/** Stops delivery and kills every link already sent to this recipient immediately (Review Focus 3). */
export async function deactivateRecipient(service: Db, ctx: AccessContext, contactId: string, now = new Date()): Promise<void> {
  const [c] = await service.select().from(contact).where(and(eq(contact.id, contactId), eq(contact.agencyId, ctx.agencyId), isNotNull(contact.clientId)));
  if (!c || !isAgencyRole(ctx.role) || !canAccessClient(ctx, c.clientId!)) throw new ToolError('not_found', 'Recipient not found');
  await service.update(contact).set({ active: false, linksRevokedBefore: now }).where(eq(contact.id, c.id));
}

// ---- client delivery mode ----
export async function updateClientDeliverySettings(
  deps: { service: Db; app: Db },
  ctx: AccessContext,
  clientId: string,
  patch: { alertMode?: AlertMode; briefAutoSend?: boolean; timezone?: string },
): Promise<void> {
  requireAgencyFor(ctx, clientId);
  if (patch.alertMode && !ALERT_MODES.includes(patch.alertMode)) throw new ToolError('invalid_input', 'Unknown alert mode');
  if (patch.timezone !== undefined) {
    if (!validTimezone(patch.timezone)) throw new ToolError('invalid_input', 'Unknown time zone');
    await deps.service.update(client).set({ timezone: patch.timezone }).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId)));
  }
  if (patch.alertMode !== undefined || patch.briefAutoSend !== undefined) {
    await updateClientDelivery(deps, ctx, clientId, { alertMode: patch.alertMode, briefAutoSend: patch.briefAutoSend });
  }
}
