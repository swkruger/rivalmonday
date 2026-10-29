import { type AccessContext, pilotLinkRefusal, toolkit, ToolError } from '@cs/core';
import { brief, type Db, SAMPLE_STATUSES, WAITLIST_KINDS, WAITLIST_STATUSES, waitlistEntry } from '@cs/db';
import { and, count, desc, asc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pageOf, pageResult, prevCursorOf } from '../paging';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { insertInviteLink, operate } from './platform-billing';
import { withPlatformAudit } from '../platform/audit';
import { sampleCostEstimate } from '../waitlist/estimate';
import { sampleBriefMonthlyLimit } from '../waitlist/settings';

/**
 * Phase 17a: the operator's waitlist list. Same pattern as platform-leads.ts: role check first (a refusal never reaches the
 * audit log; non-operators are told the tool does not exist), then the body under one platform audit row.
 */
const { defineTool } = toolkit<ToolDeps>();

/** The "new" rule shared by the nav badge and the tab counts: status new and the email address confirmed. */
export const waitlistNewWhere = and(eq(waitlistEntry.status, 'new'), isNotNull(waitlistEntry.emailConfirmedAt))!;
/** Sample requests waiting for a decision (confirmed email only). */
export const sampleRequestedWhere = and(eq(waitlistEntry.sampleStatus, 'requested'), isNotNull(waitlistEntry.emailConfirmedAt))!;

/** Badge counts, one source for the page's tabs and the nav (`get_platform_nav_counts`). */
export async function waitlistCounts(db: Db): Promise<{ agencyNew: number; businessNew: number; sampleRequested: number }> {
  const [row] = await db
    .select({
      agencyNew: sql<number>`(count(*) filter (where ${waitlistEntry.kind} = 'agency' and ${waitlistNewWhere}))::int`,
      businessNew: sql<number>`(count(*) filter (where ${waitlistEntry.kind} = 'business' and ${waitlistNewWhere}))::int`,
      sampleRequested: sql<number>`(count(*) filter (where ${sampleRequestedWhere}))::int`,
    })
    .from(waitlistEntry);
  return { agencyNew: row?.agencyNew ?? 0, businessNew: row?.businessNew ?? 0, sampleRequested: row?.sampleRequested ?? 0 };
}

const STAGES = ['setup', 'generating', 'review', 'ready_to_send', 'sent'] as const;
type Stage = (typeof STAGES)[number];

const BRIEF_STAGE: Record<string, Stage> = { generating: 'generating', failed: 'generating', ready: 'review', approved: 'ready_to_send', sent: 'sent' };

const n = z.number().int().nonnegative();
const WaitlistEntryView = z.object({
  id: z.string().uuid(),
  kind: z.enum(WAITLIST_KINDS),
  status: z.enum(WAITLIST_STATUSES),
  contactName: z.string(),
  email: z.string(),
  orgName: z.string(),
  website: z.string().nullable(),
  location: z.string().nullable(),
  verticalId: z.string().nullable(),
  verticalOther: z.string().nullable(),
  clientCountBand: z.string().nullable(),
  emailConfirmed: z.boolean(),
  source: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  sample: z
    .object({
      businessName: z.string().nullable(),
      location: z.string().nullable(),
      website: z.string().nullable(),
      status: z.enum(SAMPLE_STATUSES),
      clientId: z.string().uuid().nullable(),
      stage: z.enum(STAGES).nullable(),
      sentAt: z.string().nullable(),
    })
    .nullable(),
});
export type WaitlistEntryView = z.infer<typeof WaitlistEntryView>;

/** Escapes LIKE wildcards so a search for `100%` matches the text, not everything. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const listWaitlistTool = defineTool({
  name: 'list_waitlist',
  access: 'read',
  description: 'Platform operators: the pilot waitlist (agencies and businesses), newest first, 25 per page on the web (at most 100), with the "new" counts, this month\'s sample-brief usage and an estimated cost per sample.',
  input: z.object({
    kind: z.enum(WAITLIST_KINDS).optional(),
    status: z.enum(WAITLIST_STATUSES).optional(),
    sample: z.boolean().optional(),
    q: z.string().trim().max(120).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  output: z.object({
    entries: z.array(WaitlistEntryView),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: n,
    counts: z.object({ agencyNew: n, businessNew: n, sampleRequested: n }),
    sampleMonth: z.object({ used: n, limit: n }),
    estimate: z.object({ discoveryCapUsd: z.number(), startingPointAvgUsd: z.number().nullable(), basedOn: n }),
  }),
  supportMask: ['entries[].email', 'entries[].emailConfirmed'], // the flag is a boolean (the mask leaves non-strings alone); listed because the access-marks rule matches every /email/ key
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps, meta) {
    let role: PlatformRole;
    try {
      role = await requirePlatformOperator(deps, ctx);
    } catch (e) {
      if (e instanceof ToolError && e.code === 'permission_denied') throw new ToolError('not_found', 'Unknown tool: list_waitlist');
      throw e;
    }
    return withPlatformAudit(deps, ctx, { tool: 'list_waitlist', input, role }, async () => {
      const db = deps.service;
      const { offset, limit } = pageOf(input, meta, 25);
      const pattern = input.q ? likePattern(input.q) : null;
      const where = and(
        input.kind ? eq(waitlistEntry.kind, input.kind) : undefined,
        input.status ? eq(waitlistEntry.status, input.status) : undefined,
        input.sample ? eq(waitlistEntry.sampleRequested, true) : undefined,
        pattern
          ? or(ilike(waitlistEntry.orgName, pattern), ilike(waitlistEntry.contactName, pattern), ilike(waitlistEntry.email, pattern), ilike(waitlistEntry.sampleBusinessName, pattern))
          : undefined,
      );
      const fetched = await db.select().from(waitlistEntry).where(where).orderBy(desc(waitlistEntry.createdAt), asc(waitlistEntry.id)).limit(limit + 1).offset(offset);
      const { rows, nextCursor } = pageResult(fetched, limit, offset);
      const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(waitlistEntry).where(where);

      // Stage of a sample in progress = the state of its client's starting-point brief.
      const clientIds = rows.filter((r) => r.sampleStatus === 'approved' && r.sampleClientId).map((r) => r.sampleClientId!);
      const briefs = clientIds.length
        ? await db.select({ clientId: brief.clientId, status: brief.status }).from(brief).where(and(inArray(brief.clientId, clientIds), eq(brief.kind, 'starting_point')))
        : [];
      const briefStatus = new Map(briefs.map((b) => [b.clientId, b.status]));
      const stageOf = (r: (typeof rows)[number]): Stage | null => {
        if (r.sampleStatus === 'sent') return 'sent';
        if (r.sampleStatus !== 'approved') return null;
        const s = r.sampleClientId ? briefStatus.get(r.sampleClientId) : undefined;
        return (s && BRIEF_STAGE[s]) || 'setup';
      };

      const [counts, limitN, estimate, [used] = [{ n: 0 }]] = await Promise.all([
        waitlistCounts(db),
        sampleBriefMonthlyLimit(db),
        sampleCostEstimate(db),
        db
          .select({ n: count() })
          .from(waitlistEntry)
          // Start of the current UTC month as an instant (the session time zone must not matter).
          .where(sql`${waitlistEntry.sampleApprovedAt} >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`),
      ]);

      return {
        nextCursor, prevCursor: prevCursorOf(offset, limit), total, counts, estimate,
        sampleMonth: { used: used?.n ?? 0, limit: limitN },
        entries: rows.map((r) => ({
          id: r.id, kind: r.kind, status: r.status, contactName: r.contactName, email: r.email, orgName: r.orgName, website: r.website, location: r.location,
          verticalId: r.verticalId, verticalOther: r.verticalOther, clientCountBand: r.clientCountBand, emailConfirmed: r.emailConfirmedAt !== null, source: r.source,
          createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
          sample: r.sampleStatus
            ? { businessName: r.sampleBusinessName, location: r.sampleLocation, website: r.sampleWebsite, status: r.sampleStatus, clientId: r.sampleClientId, stage: stageOf(r), sentAt: r.sampleSentAt?.toISOString() ?? null }
            : null,
        })),
      };
    });
  },
});

const INVITE_EXPIRES_DAYS = 14;
const Id = z.string().uuid();

export const inviteWaitlistAgenciesTool = defineTool({
  name: 'invite_waitlist_agencies',
  access: 'write',
  description: 'Platform staff: invite confirmed waitlist agencies, one email-locked single-use invite link each (14 days). Returns each link once so the web action can email it; rows that cannot be invited are skipped with a reason.',
  input: z.object({ ids: z.array(Id).min(1).max(50), offer: z.enum(['pilot', 'trial']), pilotEndsAt: z.string().datetime().optional() }),
  output: z.object({
    results: z.array(z.object({
      id: Id,
      outcome: z.enum(['invited', 'skipped']),
      reason: z.enum(['not_found', 'not_agency', 'not_new', 'unconfirmed']).optional(),
      email: z.string().optional(),
      url: z.string().optional(),
      expiresAt: z.string().optional(),
    })),
  }),
  supportMask: ['results[].email'],
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'invite_waitlist_agencies', { ids: input.ids, offer: input.offer, pilotEndsAt: input.pilotEndsAt }, undefined, async () => {
      // Validated once, before any row: a bad offer must not leave half the batch invited.
      if (input.offer === 'pilot') {
        if (!input.pilotEndsAt) throw new ToolError('invalid_input', 'A pilot offer needs pilotEndsAt');
        const now = new Date();
        const why = pilotLinkRefusal(new Date(input.pilotEndsAt), new Date(now.getTime() + INVITE_EXPIRES_DAYS * 86_400_000), now);
        if (why) throw new ToolError('invalid_input', why);
      } else if (input.pilotEndsAt) {
        throw new ToolError('invalid_input', 'pilotEndsAt only applies to a pilot offer');
      }
      const results: Array<{ id: string; outcome: 'invited' | 'skipped'; reason?: 'not_found' | 'not_agency' | 'not_new' | 'unconfirmed'; email?: string; url?: string; expiresAt?: string }> = [];
      for (const id of new Set(input.ids)) {
        // One transaction per row: the link insert and the status change commit together or not at all.
        results.push(await deps.service.transaction(async (tx) => {
          const [row] = await tx.select().from(waitlistEntry).where(eq(waitlistEntry.id, id)).for('update');
          if (!row) return { id, outcome: 'skipped' as const, reason: 'not_found' as const };
          if (row.kind !== 'agency') return { id, outcome: 'skipped' as const, reason: 'not_agency' as const };
          if (row.status !== 'new') return { id, outcome: 'skipped' as const, reason: 'not_new' as const };
          if (!row.emailConfirmedAt) return { id, outcome: 'skipped' as const, reason: 'unconfirmed' as const };
          const link = await insertInviteLink({ ...deps, service: tx as unknown as Db }, ctx, {
            offer: input.offer, pilotEndsAt: input.pilotEndsAt, emailLock: row.email, maxUses: 1, expiresInDays: INVITE_EXPIRES_DAYS, note: 'waitlist',
          });
          const now = new Date();
          await tx.update(waitlistEntry).set({ status: 'invited', inviteLinkId: link.id, decidedAt: now, decidedBy: ctx.userId, updatedAt: now }).where(eq(waitlistEntry.id, id));
          return { id, outcome: 'invited' as const, email: row.email, url: link.url, expiresAt: link.expiresAt.toISOString() };
        }));
      }
      return { results };
    });
  },
});

export const declineWaitlistEntryTool = defineTool({
  name: 'decline_waitlist_entry',
  access: 'write',
  description: 'Platform staff: decline a new waitlist entry (agency or business). A pending sample request is declined with it. Nobody is emailed.',
  input: z.object({ id: Id }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'decline_waitlist_entry', input, undefined, async () => {
      const now = new Date();
      const rows = await deps.service
        .update(waitlistEntry)
        .set({
          status: 'declined', decidedAt: now, decidedBy: ctx.userId, updatedAt: now,
          // sample_requested stays true: the check is sample_requested = (sample_status IS NOT NULL).
          sampleStatus: sql`case when ${waitlistEntry.sampleStatus} = 'requested' then 'declined' else ${waitlistEntry.sampleStatus} end`,
        })
        .where(and(eq(waitlistEntry.id, input.id), eq(waitlistEntry.status, 'new')))
        .returning({ id: waitlistEntry.id });
      if (rows.length === 0) {
        const [exists] = await deps.service.select({ id: waitlistEntry.id }).from(waitlistEntry).where(eq(waitlistEntry.id, input.id));
        if (!exists) throw new ToolError('not_found', 'Waitlist entry not found');
        throw new ToolError('conflict', 'This entry was already handled.', { userFacing: true });
      }
      return { ok: true as const };
    });
  },
});

export const platformWaitlistTools = [listWaitlistTool, inviteWaitlistAgenciesTool, declineWaitlistEntryTool];
