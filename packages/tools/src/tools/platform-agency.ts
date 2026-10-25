import { applyHoldCollection, isOnHold } from '@cs/billing';
import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { agency, client } from '@cs/db';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { assertTeamInviteBudget, changeMemberRole, inviteMember, listTeam, resendInvitation, revokeInvitation, revokeMembership } from '../access/team';
import { sendTeamInviteEmail } from '../access/team-invite-email';
import type { ToolDeps } from '../deps';
import { platformAgencyCtx } from '../platform/agency-ctx';
import { archiveTenant } from '../platform/archive';
import { sendAgencyHoldEmail } from '../platform/hold-email';
import { operate } from './platform-billing';

/**
 * Phase 15c-3a platform agency tools (spec §4.4): platform staff manage any agency's people and name from the console.
 * Each tool runs through `operate()` (operator role first, then `requireAgency`, then one `withPlatformAudit` row in the
 * target agency's `audit_log`). The agency-side `team.ts` services run with `platformAgencyCtx`, built only inside `operate()`.
 */
const { defineTool } = toolkit<ToolDeps>();

const Id = z.string().uuid();
const AGENCY_ROLE = z.enum(['agency_admin', 'account_manager']);
/** Emails sent on the operator's behalf speak for the agency: no person named, no reply-to, no Cc. */
const AS_AGENCY = { inviter: { agency: true as const } };

const PeopleOut = z.object({
  members: z.array(z.object({
    membershipId: z.string(), userId: z.string(), name: z.string(), email: z.string(), role: z.string(),
    clients: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
  invitations: z.array(z.object({
    invitationId: z.string(), email: z.string(), role: z.string(), clientId: z.string().nullable(), clientName: z.string().nullable(),
    sentAt: z.string(), expiresAt: z.string(),
  })),
});

export const listAgencyPeopleTool = defineTool({
  name: 'list_agency_people',
  access: 'read',
  description: 'Platform operators: an agency’s members (with the clients they cover) and pending invitations.',
  input: z.object({ agencyId: Id }),
  output: PeopleOut,
  permission: 'agency',
  audit: 'skip-web',
  supportMask: ['members[].email', 'invitations[].email'],
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'viewer', 'list_agency_people', input, input.agencyId, async () => {
      const team = await listTeam(deps.service, platformAgencyCtx(ctx, input.agencyId));
      const scopeIds = [...new Set(team.members.flatMap((m) => m.clientScope ?? []))];
      const names = new Map(scopeIds.length === 0 ? [] : (await deps.service
        .select({ id: client.id, name: client.name })
        .from(client)
        .where(and(eq(client.agencyId, input.agencyId), inArray(client.id, scopeIds)))).map((c) => [c.id, c.name] as const));
      return {
        members: team.members.map((m) => ({
          membershipId: m.membershipId, userId: m.userId, name: m.name, email: m.email, role: m.role,
          // client roles: their client; scoped account managers: the scope; all-client admins/AMs: [] ("All clients").
          clients: m.clientId
            ? [{ id: m.clientId, name: m.clientName ?? '' }]
            : (m.clientScope ?? []).flatMap((id) => (names.has(id) ? [{ id, name: names.get(id)! }] : [])),
        })),
        invitations: team.invitations.map((i) => ({
          invitationId: i.id, email: i.email, role: i.role, clientId: i.clientId, clientName: i.clientName, sentAt: i.sentAt, expiresAt: i.expiresAt.toISOString(),
        })),
      };
    }, { allowArchived: true });
  },
});

export const platformRenameAgencyTool = defineTool({
  name: 'platform_rename_agency',
  access: 'write',
  description: 'Platform staff: rename an agency.',
  input: z.object({ agencyId: Id, name: z.string().trim().min(1).max(120) }),
  output: z.object({ name: z.string() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_rename_agency', input, input.agencyId, async () => {
      await deps.service.update(agency).set({ name: input.name }).where(eq(agency.id, input.agencyId));
      return { name: input.name };
    });
  },
});

export const platformChangeMemberRoleTool = defineTool({
  name: 'platform_change_member_role',
  access: 'write',
  description: 'Platform staff: move an agency member between agency admin and account manager (an agency keeps at least one admin).',
  input: z.object({ agencyId: Id, membershipId: Id, role: AGENCY_ROLE }),
  output: z.object({ role: z.string() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_change_member_role', input, input.agencyId, async () =>
      changeMemberRole(deps.service, platformAgencyCtx(ctx, input.agencyId), input.membershipId, input.role));
  },
});

export const platformRemoveMemberTool = defineTool({
  name: 'platform_remove_member',
  access: 'write',
  description: 'Platform staff: remove anyone’s access to an agency (an agency keeps at least one admin).',
  input: z.object({ agencyId: Id, membershipId: Id }),
  output: z.object({ removed: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_remove_member', input, input.agencyId, async () => {
      await revokeMembership(deps.service, platformAgencyCtx(ctx, input.agencyId), input.membershipId);
      return { removed: true as const };
    });
  },
});

export const platformInviteAgencyAdminTool = defineTool({
  name: 'platform_invite_agency_admin',
  access: 'write', // sends an email
  description: 'Platform staff: invite an agency admin; the email speaks for the agency.',
  input: z.object({ agencyId: Id, email: z.string().max(320) }),
  output: z.object({ invitationId: Id, expiresAt: z.string(), emailSent: z.boolean() }),
  permission: 'agency',
  audit: 'skip-web',
  supportMask: ['emailSent'], // a boolean (nothing to mask); listed because the key matches /email/i
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_invite_agency_admin', input, input.agencyId, async () => {
      const pctx = platformAgencyCtx(ctx, input.agencyId);
      const now = new Date();
      // `inviteMember` normalises the address and applies `invite_member`'s duplicate rule (same errors).
      const r = await deps.service.transaction(async (tx) => {
        await assertTeamInviteBudget(tx, input.agencyId);
        return inviteMember(tx, pctx, { email: input.email, role: 'agency_admin' }, now, AS_AGENCY);
      });
      // R8: after the invitation committed (a failed send keeps it), mirroring `invite_member`.
      const emailSent = await sendTeamInviteEmail(deps, { agencyId: input.agencyId, to: input.email, role: 'agency_admin', ...AS_AGENCY, expiresAt: r.expiresAt });
      return { invitationId: r.id, expiresAt: r.expiresAt.toISOString(), emailSent };
    });
  },
});

export const platformResendInvitationTool = defineTool({
  name: 'platform_resend_invitation',
  access: 'write', // sends an email
  description: 'Platform staff: send an agency’s pending invitation again; shares the 3 per 24 hours limit with the agency’s own resend.',
  input: z.object({ agencyId: Id, invitationId: Id }),
  output: z.object({ sentAt: z.string(), expiresAt: z.string(), emailSent: z.boolean() }),
  permission: 'agency',
  audit: 'skip-web',
  supportMask: ['emailSent'], // a boolean (nothing to mask); listed because the key matches /email/i
  async handler(ctx: AccessContext, input, deps) {
    // A5: the audited input is `{ invitationId }` (not the full input), so the hash matches `resend_invitation`'s for the shared limits.
    return operate(deps, ctx, 'staff', 'platform_resend_invitation', { invitationId: input.invitationId }, input.agencyId, async () => {
      const r = await resendInvitation(platformAgencyCtx(ctx, input.agencyId), deps, input.invitationId, new Date(), AS_AGENCY);
      return { sentAt: r.sentAt.toISOString(), expiresAt: r.expiresAt.toISOString(), emailSent: r.emailSent };
    });
  },
});

export const platformRevokeInvitationTool = defineTool({
  name: 'platform_revoke_invitation',
  access: 'write',
  description: 'Platform staff: cancel an agency’s pending invitation.',
  input: z.object({ agencyId: Id, invitationId: Id }),
  output: z.object({ revoked: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_revoke_invitation', input, input.agencyId, async () => {
      await revokeInvitation(deps.service, platformAgencyCtx(ctx, input.agencyId), input.invitationId);
      return { revoked: true as const };
    });
  },
});

// ---- hold / lift / archive (spec §4.4 "Hold order", A2) ----

export const ARCHIVE_BILLING_MESSAGE = 'This agency still has active billing. Cancel it in Stripe first, then archive.';

const HoldBillingOut = z.object({
  done: z.number().int(),
  failed: z.array(z.object({ kind: z.enum(['agency', 'client']), clientId: z.string().optional(), clientName: z.string().optional() })),
});
const refuse = (msg: string) => new ToolError('invalid_input', msg, { userFacing: true });
/** Billing not configured → no gateway: the hold still applies and `applyHoldCollection` records an empty attempt. */
const gatewayOrNull = (deps: ToolDeps) => deps.billing ?? null;

export const platformSuspendAgencyTool = defineTool({
  name: 'platform_suspend_agency',
  access: 'write', // pauses Stripe collection, sends emails
  description: 'Platform staff: put an agency on hold (read-only, scheduled work and billing paused); its admins get an email.',
  input: z.object({ agencyId: Id, reason: z.string().trim().min(3).max(500) }), // zod 4 counts code points, matching the DB CHECK's char_length
  output: z.object({ suspendedAt: z.string(), billing: HoldBillingOut, emailsSent: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  supportMask: ['emailsSent'], // a number (nothing to mask); listed because the key matches /email/i
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_suspend_agency', input, input.agencyId, async () => {
      // 1. The hold commits on its own (guarded, so two operators can't both start it); Stripe and the emails follow.
      const [row] = await deps.service.transaction((tx) => tx
        .update(agency)
        .set({ suspendedAt: new Date(), suspendedReason: input.reason, suspendedBy: ctx.userId })
        .where(and(eq(agency.id, input.agencyId), isNull(agency.suspendedAt)))
        .returning({ suspendedAt: agency.suspendedAt }));
      if (!row?.suspendedAt) throw refuse('This agency is already on hold.');
      // 2-3. Never undo the hold: both record / log their own failures and don't throw.
      const billing = await applyHoldCollection(deps.service, gatewayOrNull(deps), input.agencyId, 'pause', ctx.userId);
      const emailsSent = await sendAgencyHoldEmail(deps, input.agencyId, 'started');
      return { suspendedAt: row.suspendedAt.toISOString(), billing, emailsSent };
    });
  },
});

export const platformUnsuspendAgencyTool = defineTool({
  name: 'platform_unsuspend_agency',
  access: 'write', // resumes Stripe collection, sends emails
  description: 'Platform staff: lift an agency’s hold; changes, scheduled work and billing resume, and its admins get an email.',
  input: z.object({ agencyId: Id }),
  output: z.object({ billing: HoldBillingOut, emailsSent: z.number().int() }),
  permission: 'agency',
  audit: 'skip-web',
  supportMask: ['emailsSent'], // a number (nothing to mask); listed because the key matches /email/i
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_unsuspend_agency', input, input.agencyId, async () => {
      const [row] = await deps.service.transaction((tx) => tx
        .update(agency)
        .set({ suspendedAt: null, suspendedReason: null, suspendedBy: null })
        .where(and(eq(agency.id, input.agencyId), isNotNull(agency.suspendedAt)))
        .returning({ id: agency.id }));
      if (!row) throw refuse("This agency isn't on hold.");
      const billing = await applyHoldCollection(deps.service, gatewayOrNull(deps), input.agencyId, 'resume', ctx.userId);
      // R6: a seat sync skipped during the hold runs now. Lazy import: billing-guard imports this module (PLATFORM_TOOLS).
      const { postCommitSeatSync } = await import('../billing-guard');
      await postCommitSeatSync(deps, input.agencyId);
      const emailsSent = await sendAgencyHoldEmail(deps, input.agencyId, 'lifted');
      return { billing, emailsSent };
    });
  },
});

export const platformRetryHoldBillingTool = defineTool({
  name: 'platform_retry_hold_billing',
  access: 'write', // calls Stripe
  description: 'Platform staff: retry pausing (on hold) or resuming (lifted) an agency’s Stripe collection after a failure.',
  input: z.object({ agencyId: Id }),
  output: HoldBillingOut,
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_retry_hold_billing', input, input.agencyId, async () => {
      const mode = (await isOnHold(deps.service, input.agencyId)) ? 'pause' : 'resume';
      return applyHoldCollection(deps.service, gatewayOrNull(deps), input.agencyId, mode, ctx.userId);
    });
  },
});

export const platformArchiveAgencyTool = defineTool({
  name: 'platform_archive_agency',
  access: 'write',
  description: 'Platform owner: archive an agency (deleted for its users; purge possible after 30 days). Refused while it has active billing.',
  input: z.object({ agencyId: Id }),
  output: z.object({ archivedAt: z.string() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'platform_archive_agency', input, input.agencyId, async () => {
      const r = await archiveTenant(deps.service, { kind: 'agency', id: input.agencyId, undo: false }, { audit: 'none' });
      if ('error' in r) {
        if (r.error === 'billing_active') throw refuse(ARCHIVE_BILLING_MESSAGE);
        throw new ToolError('not_found', 'Agency not found');
      }
      const [a] = await deps.service.select({ archivedAt: agency.archivedAt }).from(agency).where(eq(agency.id, input.agencyId));
      return { archivedAt: a!.archivedAt!.toISOString() };
    });
  },
});

export const platformUnarchiveAgencyTool = defineTool({
  name: 'platform_unarchive_agency',
  access: 'write',
  description: 'Platform owner: bring an archived agency and its clients back as they were (paused billing does not restart).',
  input: z.object({ agencyId: Id }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'owner', 'platform_unarchive_agency', input, input.agencyId, async () => {
      const r = await archiveTenant(deps.service, { kind: 'agency', id: input.agencyId, undo: true }, { audit: 'none' });
      if ('error' in r) throw new ToolError('not_found', 'Agency not found');
      return { ok: true as const };
    }, { allowArchived: true });
  },
});

export const platformAgencyTools = [
  listAgencyPeopleTool, platformRenameAgencyTool, platformChangeMemberRoleTool, platformRemoveMemberTool,
  platformInviteAgencyAdminTool, platformResendInvitationTool, platformRevokeInvitationTool,
  platformSuspendAgencyTool, platformUnsuspendAgencyTool, platformRetryHoldBillingTool, platformArchiveAgencyTool, platformUnarchiveAgencyTool,
];
