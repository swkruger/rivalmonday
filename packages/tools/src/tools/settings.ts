import { type AccessContext, isAgencyRole, ROLES, toolkit, ToolError } from '@cs/core';
import { AGENCY_KINDS, CLIENT_KINDS, type NotificationKind } from '@cs/db';
import { ALERT_MODES, PERSONAL_CHANNELS } from '@cs/engine';
import { z } from 'zod';
import { inviteClientUser } from '../access/client-invite';
import { inviteMember, revokeInvitation, revokeMembership } from '../access/team';
import type { ToolDeps } from '../deps';
import { setMyNotificationPref, updateMyContact } from '../preferences';
import { addClientRecipient, addWebhook, deactivateRecipient, setWebhookActive, updateAgencyBranding, updateClientDeliverySettings } from '../settings';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const OK = z.object({ ok: z.literal(true) });
const ok = { ok: true as const };
const text = (max: number) => z.string().max(max).optional();
const NOTIFICATION_KINDS = [...new Set([...CLIENT_KINDS, ...AGENCY_KINDS])] as [string, ...string[]];

/** Guests (email-link sessions) are read-only (5a decision 11). */
function requireSignedIn(ctx: AccessContext) {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to change your settings');
}

export const inviteMemberTool = defineTool({
  name: 'invite_member',
  access: 'write',
  description: 'Invite someone to this agency or one of its clients.',
  input: z.object({ email: z.string().max(320), role: z.enum(ROLES), clientId: uuid.nullable().optional(), clientScope: z.array(uuid).max(500).nullable().optional() }),
  output: z.object({ invitationId: uuid, expiresAt: z.string() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    // 11b Q4: client roles go through the shared client invite (contact + `client_invite` email); agency roles unchanged.
    if (!isAgencyRole(input.role)) {
      if (!input.clientId) throw new ToolError('invalid_input', 'Client roles need a client');
      if (input.clientScope != null) throw new ToolError('invalid_input', 'Only account managers have a client scope');
      const r = await inviteClientUser(ctx, deps, { clientId: input.clientId, email: input.email, name: null, role: input.role as 'client_owner' | 'client_viewer' }, new Date());
      return { invitationId: r.invitationId, expiresAt: r.expiresAt.toISOString() };
    }
    const r = await inviteMember(deps.service, ctx, input);
    return { invitationId: r.id, expiresAt: r.expiresAt.toISOString() };
  },
});

export const revokeMembershipTool = defineTool({
  name: 'revoke_membership',
  access: 'write',
  description: 'Remove someone’s access.',
  input: z.object({ membershipId: uuid }),
  output: OK,
  permission: 'agency',
  async handler(ctx, { membershipId }, deps) {
    await revokeMembership(deps.service, ctx, membershipId);
    return ok;
  },
});

export const revokeInvitationTool = defineTool({
  name: 'revoke_invitation',
  access: 'write',
  description: 'Cancel a pending invitation.',
  input: z.object({ invitationId: uuid }),
  output: OK,
  permission: 'agency',
  async handler(ctx, { invitationId }, deps) {
    await revokeInvitation(deps.service, ctx, invitationId);
    return ok;
  },
});

export const updateAgencyBrandingTool = defineTool({
  name: 'update_agency_branding',
  access: 'write',
  description: 'Save the agency’s white-label branding (agency admins).',
  input: z.object({ displayName: text(200), logoUrl: text(1000), primary: text(20), secondary: text(20), fromName: text(200), signOff: text(600), assistantName: text(200) }),
  output: OK,
  permission: 'agency',
  async handler(ctx, input, deps) {
    await updateAgencyBranding(deps.service, ctx, input, deps.appUrl);
    return ok;
  },
});

export const addWebhookTool = defineTool({
  name: 'add_webhook',
  access: 'write',
  description: 'Send agency notices to a Slack or Teams channel (agency admins).',
  input: z.object({ kind: z.enum(['slack', 'teams']), url: z.string().max(2000), kinds: z.array(z.string().max(40)).max(30).nullable().optional() }),
  output: z.object({ webhookId: uuid }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    return { webhookId: await addWebhook(deps.service, ctx, input) };
  },
});

export const setWebhookActiveTool = defineTool({
  name: 'set_webhook_active',
  access: 'write',
  description: 'Pause or resume a Slack/Teams webhook (agency admins).',
  input: z.object({ webhookId: uuid, active: z.boolean() }),
  output: OK,
  permission: 'agency',
  async handler(ctx, { webhookId, active }, deps) {
    await setWebhookActive(deps.service, ctx, webhookId, active);
    return ok;
  },
});

export const addClientRecipientTool = defineTool({
  name: 'add_client_recipient',
  access: 'write',
  description: 'Add an email-only recipient of a client’s briefs and alerts.',
  input: z.object({ clientId: uuid, email: z.string().max(320), name: z.string().max(200).nullable().optional(), role: z.enum(['client_owner', 'client_viewer']) }),
  output: z.object({ contactId: uuid }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    return { contactId: await addClientRecipient(deps.service, ctx, input) };
  },
});

export const deactivateRecipientTool = defineTool({
  name: 'deactivate_recipient',
  access: 'write',
  description: 'Stop sending to a recipient and expire every link already sent to them.',
  input: z.object({ contactId: uuid }),
  output: OK,
  permission: 'agency',
  async handler(ctx, { contactId }, deps) {
    await deactivateRecipient(deps.service, ctx, contactId);
    return ok;
  },
});

export const updateClientDeliveryTool = defineTool({
  name: 'update_client_delivery',
  access: 'write',
  description: 'Set a client’s alert mode, brief auto-send and time zone.',
  input: z.object({ clientId: uuid, alertMode: z.enum(ALERT_MODES).optional(), briefAutoSend: z.boolean().optional(), timezone: z.string().max(64).optional() }),
  output: OK,
  permission: 'agency',
  async handler(ctx, { clientId, ...patch }, deps) {
    await updateClientDeliverySettings(deps, ctx, clientId, patch);
    return ok;
  },
});

export const setMyNotificationPrefTool = defineTool({
  name: 'set_my_notification_pref',
  access: 'write',
  description: 'Turn one of your own notifications on or off.',
  input: z.object({ contactId: uuid, kind: z.enum(NOTIFICATION_KINDS), channel: z.enum(PERSONAL_CHANNELS), enabled: z.boolean() }),
  output: OK,
  permission: 'read',
  async handler(ctx, input, deps) {
    requireSignedIn(ctx);
    await setMyNotificationPref(deps.service, ctx.userId, { ...input, kind: input.kind as NotificationKind });
    return ok;
  },
});

export const updateMyContactTool = defineTool({
  name: 'update_my_contact',
  access: 'write',
  description: 'Set your own time zone and quiet hours.',
  input: z.object({ contactId: uuid, timezone: z.string().max(64).nullable().optional(), quietHours: z.object({ start: z.string().max(5), end: z.string().max(5) }).nullable().optional() }),
  output: OK,
  permission: 'read',
  async handler(ctx, input, deps) {
    requireSignedIn(ctx);
    await updateMyContact(deps.service, ctx.userId, input);
    return ok;
  },
});

export const settingsTools = [
  inviteMemberTool,
  revokeMembershipTool,
  revokeInvitationTool,
  updateAgencyBrandingTool,
  addWebhookTool,
  setWebhookActiveTool,
  addClientRecipientTool,
  deactivateRecipientTool,
  updateClientDeliveryTool,
  setMyNotificationPrefTool,
  updateMyContactTool,
];
