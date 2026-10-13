import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { agency, supportSession } from '@cs/db';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pageOf, pageResult } from '../paging';
import { requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { endOpenSessionFor, startSession } from '../platform/support';

/**
 * Phase 8b support-session tools (spec § Tools). `start`/`end` run on the operator's own context (never a support context);
 * the two agency-facing tools are `agency_admin` only and filter strictly by `ctx.agencyId` (the table is service-role only).
 */
const { defineTool } = toolkit<ToolDeps>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_WEB_DEFAULT = 20;
const CONSOLE_LIMIT = 20;

const SessionRow = z.object({
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  platformUserName: z.string(),
  reason: z.string(),
  durationMinutes: z.number().int().nullable(),
  endReason: z.enum(['exit', 'expired', 'replaced', 'revoked']).nullable(),
});

type RawRow = { started_at: string | Date; ended_at: string | Date | null; name: string; reason: string; end_reason: 'exit' | 'expired' | 'replaced' | 'revoked' | null };

/** 8b M7(d): what an agency sees when a staff account's name is blank or is its email (never show the address). */
export const SUPPORT_DISPLAY_NAME = 'Rival Monday support';
const EMAIL_LIKE = /\S@\S/;

export function supportDisplayName(name: string | null | undefined): string {
  const n = name?.trim() ?? '';
  return n === '' || EMAIL_LIKE.test(n) ? SUPPORT_DISPLAY_NAME : n;
}

function shape(r: RawRow): z.infer<typeof SessionRow> {
  const started = new Date(r.started_at);
  const ended = r.ended_at === null ? null : new Date(r.ended_at);
  return {
    startedAt: started.toISOString(),
    endedAt: ended?.toISOString() ?? null,
    platformUserName: r.name,
    reason: r.reason,
    durationMinutes: ended === null ? null : Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60_000)),
    endReason: r.end_reason,
  };
}

function requireAgencyAdmin(ctx: AccessContext): void {
  if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Agency admins only');
}

async function agencyExists(deps: Pick<ToolDeps, 'service'>, id: string): Promise<boolean> {
  return UUID_RE.test(id) && (await deps.service.select({ id: agency.id }).from(agency).where(eq(agency.id, id)).limit(1)).length > 0;
}

export const startSupportSession = defineTool({
  name: 'start_support_session',
  access: 'write',
  description: 'Platform owners/staff: open a 60-minute read-only support session on one agency, with a reason the agency can see.',
  input: z.object({ agencyId: z.string().max(64), reason: z.string().trim().max(1200).refine((s) => [...s].length >= 5 && [...s].length <= 300, 'Reason must be 5 to 300 characters') }),
  output: z.object({ sessionId: z.string(), expiresAt: z.string() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx, 'staff');
    const exists = await agencyExists(deps, input.agencyId);
    // Unknown agency: no target audit_log to write into (FK), so the not_found call lands on the platform log.
    return withPlatformAudit(deps, ctx, { tool: 'start_support_session', input, role, agencyId: exists ? input.agencyId : undefined }, async (note) => {
      if (!exists) throw new ToolError('not_found', 'Agency not found');
      const s = await startSession(deps.service, { platformUserId: ctx.userId, agencyId: input.agencyId, reason: input.reason });
      // 8b M4: the target agency's row names the session it opened.
      note.supportSessionId = s.id;
      return { sessionId: s.id, expiresAt: s.expiresAt.toISOString() };
    });
  },
});

export const endSupportSession = defineTool({
  name: 'end_support_session',
  access: 'write',
  description: 'End your own open support session (idempotent).',
  input: z.object({}),
  output: z.object({ agencyId: z.string().nullable() }),
  permission: 'agency',
  async handler(ctx: AccessContext, _input, deps) {
    return { agencyId: await endOpenSessionFor(deps.service, ctx.userId) };
  },
});

export const listSupportSessions = defineTool({
  name: 'list_support_sessions',
  access: 'read',
  supportHidden: true,
  description: 'Agency admins: platform support sessions opened on this agency, newest first, and whether admins are emailed when one opens.',
  input: z.object({ cursor: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).optional() }),
  output: z.object({ rows: z.array(SessionRow), nextCursor: z.string().nullable(), notifyEnabled: z.boolean() }),
  permission: 'agency',
  async handler(ctx: AccessContext, input, deps, meta) {
    requireAgencyAdmin(ctx);
    const { offset, limit } = pageOf(input, meta, LIST_WEB_DEFAULT);
    const rows = [...(await deps.service.execute<RawRow>(sql`
      select s.started_at, s.ended_at, u.name, s.reason, s.end_reason
      from support_session s join auth."user" u on u.id = s.platform_user_id
      where s.agency_id = ${ctx.agencyId}
      order by s.started_at desc, s.id
      limit ${limit + 1} offset ${offset}`))];
    const page = pageResult(rows, limit, offset);
    const [ag] = await deps.service.select({ notify: agency.notifySupportAccess }).from(agency).where(eq(agency.id, ctx.agencyId));
    return { rows: page.rows.map((r) => ({ ...shape(r), platformUserName: supportDisplayName(r.name) })), nextCursor: page.nextCursor, notifyEnabled: ag?.notify ?? false };
  },
});

export const setSupportAccessNotify = defineTool({
  name: 'set_support_access_notify',
  access: 'write',
  description: 'Agency admins: email the agency admins whenever Rival Monday support opens a read-only session.',
  input: z.object({ enabled: z.boolean() }),
  output: z.object({ enabled: z.boolean() }),
  permission: 'agency',
  async handler(ctx: AccessContext, input, deps) {
    requireAgencyAdmin(ctx);
    await deps.service.update(agency).set({ notifySupportAccess: input.enabled }).where(eq(agency.id, ctx.agencyId));
    return { enabled: input.enabled };
  },
});

export const listAgencySupportSessions = defineTool({
  name: 'list_agency_support_sessions',
  access: 'read',
  description: 'Platform operators: the 20 most recent support sessions on one agency.',
  input: z.object({ agencyId: z.string().max(64) }),
  output: z.object({ rows: z.array(SessionRow.extend({ id: z.string() })) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    const role = await requirePlatformOperator(deps, ctx);
    const exists = await agencyExists(deps, input.agencyId);
    return withPlatformAudit(deps, ctx, { tool: 'list_agency_support_sessions', input, role, agencyId: exists ? input.agencyId : undefined }, async () => {
      if (!exists) throw new ToolError('not_found', 'Agency not found');
      const rows = [...(await deps.service.execute<RawRow & { id: string }>(sql`
        select s.id, s.started_at, s.ended_at, u.name, s.reason, s.end_reason
        from support_session s join auth."user" u on u.id = s.platform_user_id
        where s.agency_id = ${input.agencyId}
        order by s.started_at desc, s.id
        limit ${CONSOLE_LIMIT}`))];
      return { rows: rows.map((r) => ({ id: r.id, ...shape(r) })) };
    });
  },
});

export const supportTools = [startSupportSession, endSupportSession, listSupportSessions, setSupportAccessNotify, listAgencySupportSessions];
