import { type AccessContext, ROLES, ToolError, toolkit } from '@cs/core';
import { z } from 'zod';
import { listTeam } from '../access/team';
import type { ToolDeps } from '../deps';
import { getAgencyBranding, listClientRecipients, listWebhooks } from '../settings';

/**
 * 7a2 §4 (support audit): the settings pages' reads as web-only registered tools, so a support session's view of them is
 * audited in the target agency and masked by `supportMask` (8b). Each wraps the service function and keeps its own role
 * checks; `server/theme.ts` keeps calling `getAgencyBranding` directly (every page's theme, not a settings read).
 */
const { defineTool } = toolkit<ToolDeps>();

const role = z.enum(ROLES);

const TeamMember = z.object({
  membershipId: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role,
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  clientScope: z.array(z.string()).nullable(),
});
const PendingInvite = z.object({ id: z.string(), email: z.string(), role, clientId: z.string().nullable(), clientName: z.string().nullable(), expiresAt: z.date(), sentAt: z.string() });

const AgencyBranding = z.object({
  displayName: z.string().optional(),
  logoUrl: z.string().optional(),
  primary: z.string().optional(),
  secondary: z.string().optional(),
  accent: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().optional(),
  signOff: z.string().optional(),
  assistantName: z.string().optional(),
});
const ResolvedBranding = z.object({
  displayName: z.string(),
  logoUrl: z.string().nullable(),
  primary: z.string(),
  secondary: z.string(),
  accent: z.string(),
  ink: z.string(),
  canvas: z.string(),
  panel: z.string(),
  fromName: z.string(),
  fromEmail: z.string().nullable(),
  signOff: z.string().nullable(),
});

const Webhook = z.object({ id: z.string(), kind: z.enum(['slack', 'teams']), host: z.string(), kinds: z.array(z.string()).nullable(), active: z.boolean(), createdAt: z.date() });
const Recipient = z.object({ contactId: z.string(), email: z.string(), name: z.string().nullable(), role: z.string(), active: z.boolean(), hasAccount: z.boolean() });

/** The branding page (and the onboarding branding step) is agency-admin only; the service function itself has no role check. */
function requireAgencyAdmin(ctx: AccessContext): void {
  if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Agency admins only');
}

export const getTeamTool = defineTool({
  name: 'get_team',
  access: 'read',
  description: 'Agency roles: the members and pending invitations this viewer may manage.',
  input: z.object({}),
  output: z.object({ members: z.array(TeamMember), invitations: z.array(PendingInvite) }),
  permission: 'agency',
  supportMask: ['members[].email', 'members[].name', 'invitations[].email'],
  async handler(ctx, _input, deps) {
    return listTeam(deps.service, ctx);
  },
});

export const getAgencyBrandingTool = defineTool({
  name: 'get_agency_branding',
  access: 'read',
  description: 'Agency admins: the stored white-label branding and how it resolves.',
  input: z.object({}),
  output: z.object({ stored: AgencyBranding, resolved: ResolvedBranding }),
  permission: 'agency',
  supportMask: ['stored.fromEmail', 'resolved.fromEmail'],
  async handler(ctx, _input, deps) {
    requireAgencyAdmin(ctx);
    return getAgencyBranding(deps.service, ctx);
  },
});

export const listWebhooksTool = defineTool({
  name: 'list_webhooks',
  access: 'read',
  description: 'Agency admins: the Slack/Teams webhooks (host only; the URL is a secret).',
  input: z.object({}),
  output: z.object({ items: z.array(Webhook) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    return { items: await listWebhooks(deps.service, ctx) };
  },
});

export const listClientRecipientsTool = defineTool({
  name: 'list_client_recipients',
  access: 'read',
  description: 'Agency roles: who receives one client’s briefs and alerts.',
  input: z.object({ clientId: z.string().uuid() }),
  output: z.object({ items: z.array(Recipient) }),
  permission: 'agency',
  supportMask: ['items[].email', 'items[].name'],
  async handler(ctx, { clientId }, deps) {
    return { items: await listClientRecipients(deps.service, ctx, clientId) };
  },
});

export const agencySettingsReadTools = [getTeamTool, getAgencyBrandingTool, listWebhooksTool, listClientRecipientsTool];
