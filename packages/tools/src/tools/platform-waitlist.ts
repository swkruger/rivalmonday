import { pauseClient } from '@cs/billing';
import { type AccessContext, pilotLinkRefusal, toolkit, ToolError } from '@cs/core';
import { brief, type Db, lead, SAMPLE_STATUSES, type SampleStatus, setupLookupSchema, WAITLIST_KINDS, WAITLIST_STATUSES, waitlistEntry } from '@cs/db';
import { BRIEF_MAX_ATTEMPTS } from '@cs/engine';
import { and, count, desc, asc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pageOf, pageResult, prevCursorOf } from '../paging';
import { type PlatformRole, requirePlatformOperator } from '../platform';
import { catalogPacks } from '../catalog/access';
import { intakeLookupSchema } from '../intake/signed';
import { hitRate } from '../intake/rate';
import { collapseSameListing, possibleDuplicates, preselectVertical, toSetupLookup } from '../setup/lookup';
import { sendAfterCommit } from './leads';
import { insertInviteLink, operate } from './platform-billing';
import { assignPoolLeadTx } from './platform-leads';
import { withPlatformAudit } from '../platform/audit';
import { sampleCostEstimate } from '../waitlist/estimate';
import { sampleBriefMonthlyLimit } from '../waitlist/settings';
import { ensureOperatorMembership, ensureSampleAgency } from '../waitlist/sample';
import { SAMPLE_LINK_TTL_MS, signSampleToken } from '../waitlist/sample-token';
import { sendWaitlistEmail } from '../waitlist/emails';
import { platformAgencyCtx } from '../platform/agency-ctx';
import { createClientCore } from './onboarding';

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

const STAGES = ['setup', 'generating', 'stopped', 'review', 'ready_to_send', 'sent'] as const;
type Stage = (typeof STAGES)[number];

const BRIEF_STAGE: Record<string, Stage> = { generating: 'generating', failed: 'generating', ready: 'review', approved: 'ready_to_send', sent: 'sent' };
/** A failed starting point is retried until its attempts run out; then it has stopped and needs the operator. */
const briefStage = (b: { status: string; attempts: number }): Stage | undefined =>
  b.status === 'failed' && b.attempts >= BRIEF_MAX_ATTEMPTS ? 'stopped' : BRIEF_STAGE[b.status];

/** Sample briefs approved since the start of the current UTC month (the session time zone must not matter). */
const approvedThisMonth = sql`${waitlistEntry.sampleApprovedAt} >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

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
        ? await db.select({ clientId: brief.clientId, status: brief.status, attempts: brief.attempts }).from(brief).where(and(inArray(brief.clientId, clientIds), eq(brief.kind, 'starting_point')))
        : [];
      const briefOf = new Map(briefs.map((b) => [b.clientId, b]));
      const stageOf = (r: (typeof rows)[number]): Stage | null => {
        if (r.sampleStatus === 'sent') return 'sent';
        if (r.sampleStatus !== 'approved') return null;
        const b = r.sampleClientId ? briefOf.get(r.sampleClientId) : undefined;
        return (b && briefStage(b)) || 'setup';
      };

      const [counts, limitN, estimate, [used] = [{ n: 0 }]] = await Promise.all([
        waitlistCounts(db),
        sampleBriefMonthlyLimit(db),
        sampleCostEstimate(db),
        db
          .select({ n: count() })
          .from(waitlistEntry)
          .where(approvedThisMonth),
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

/** Operator searches per user per UTC day (the vendor call is paid; the agency-side `find_business` has its own cap). */
const PLATFORM_LOOKUP_DAILY_CAP = 50;
const FoundPlace = setupLookupSchema.extend({ suggestedVerticalId: z.string().nullable(), possibleDuplicate: z.boolean() });

export const platformFindBusinessTool = defineTool({
  name: 'platform_find_business',
  access: 'write', // a paid vendor call, ledgered with no agency
  description: 'Platform staff: look up a business on Google Maps by name and city/ZIP, to pick the listing when assigning a waitlisted business to an agency. Limited to 50 searches per operator per day.',
  input: z.object({ name: z.string().trim().min(1).max(120), location: z.string().trim().min(2).max(120) }),
  output: z.object({ places: z.array(FoundPlace).max(5) }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'platform_find_business', input, undefined, async () => {
      if (ctx.support) throw new ToolError('permission_denied', 'Not available in a support session');
      if (!deps.setupLookup) throw new ToolError('internal', 'Business search is not configured', { userFacing: true });
      if (!(await hitRate(deps.service, `platform-lookup:${ctx.userId}`, 'day', PLATFORM_LOOKUP_DAILY_CAP, new Date()))) {
        throw new ToolError('rate_limited', `You've reached today's limit of ${PLATFORM_LOOKUP_DAILY_CAP} business searches.`, { userFacing: true });
      }
      let found: Awaited<ReturnType<NonNullable<typeof deps.setupLookup>>>;
      try {
        found = await deps.setupLookup({ keyword: `${input.name} ${input.location}`, locationName: 'United States' }, { agencyId: null, clientId: null });
      } catch (e) {
        if (e instanceof ToolError) throw e;
        console.error('[platform_find_business] vendor lookup failed', (e as { name?: string } | null)?.name);
        throw new ToolError('internal', "Business search isn't available right now. Try again in a moment.", { userFacing: true });
      }
      const usable = collapseSameListing(found.filter((p) => !p.closed).flatMap((p) => {
        const l = toSetupLookup(p);
        return l ? [{ ...l, isClaimed: p.isClaimed ?? null, categories: [p.category, ...(p.additionalCategories ?? [])].filter((c): c is string => !!c) }] : [];
      })).slice(0, 5);
      const dup = possibleDuplicates(usable);
      const packs = usable.length ? await catalogPacks(deps) : [];
      return { places: usable.map(({ categories, isClaimed: _claimed, ...rest }, i) => ({ ...rest, suggestedVerticalId: preselectVertical(packs, categories), possibleDuplicate: dup[i]! })) };
    });
  },
});

export const assignWaitlistBusinessTool = defineTool({
  name: 'assign_waitlist_business',
  access: 'write',
  description: 'Platform staff: give a confirmed new waitlist business to an agency with its picked Google listing. Creates (or reuses) a verified pool lead and assigns it in one step; the agency is notified by email.',
  input: z.object({ id: Id, agencyId: Id, lookup: intakeLookupSchema }),
  output: z.object({ leadId: Id }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'assign_waitlist_business', input, undefined, async () => {
      const leadId = await deps.service.transaction(async (tx) => {
        const [entry] = await tx.select().from(waitlistEntry).where(eq(waitlistEntry.id, input.id)).for('update');
        if (!entry || entry.kind !== 'business') throw new ToolError('not_found', 'Waitlist entry not found');
        if (entry.status !== 'new' || !entry.emailConfirmedAt) throw new ToolError('conflict', 'Only confirmed new entries can be assigned.', { userFacing: true });
        // An identical pool lead (same email + place) is reused, so a repeat never trips lead_dedupe_idx.
        const [existing] = await tx
          .select({ id: lead.id, status: lead.status })
          .from(lead)
          .where(and(
            isNull(lead.agencyId), inArray(lead.status, ['unverified', 'verified']),
            sql`lower(${lead.email}) = ${entry.email.toLowerCase()}`, sql`${lead.lookup}->>'placeId' = ${input.lookup.placeId}`,
          ))
          .for('update');
        let id = existing?.id;
        if (existing && existing.status !== 'verified') {
          await tx.update(lead).set({ status: 'verified', verifiedAt: entry.emailConfirmedAt, updatedAt: new Date() }).where(eq(lead.id, existing.id));
        } else if (!existing) {
          const [created] = await tx.insert(lead).values({
            agencyId: null, source: 'platform', status: 'verified', ref: 'waitlist', contactName: entry.contactName, email: entry.email,
            lookup: input.lookup, verifiedAt: entry.emailConfirmedAt, ipHash: entry.ipHash,
          }).returning({ id: lead.id });
          id = created!.id;
        }
        const now = new Date();
        await assignPoolLeadTx(tx, ctx, id!, input.agencyId, now);
        await tx.update(waitlistEntry).set({ status: 'assigned', leadId: id!, decidedAt: now, decidedBy: ctx.userId, updatedAt: now }).where(eq(waitlistEntry.id, entry.id));
        return id!;
      });
      await sendAfterCommit(deps, leadId, 'agency_new');
      return { leadId };
    });
  },
});

const DecideSampleIn = z
  .object({ id: Id, approve: z.boolean(), lookup: intakeLookupSchema.optional(), verticalId: z.string().max(40).optional() })
  .superRefine((v, c) => {
    if (v.approve && (!v.lookup || !v.verticalId)) c.addIssue({ code: 'custom', message: 'Pick the listing and business type.' });
  });

/**
 * Approve: the sample business becomes an active client of the Rival Monday Samples agency (created on first use, the operator
 * joins it as an admin) and the operator continues in its setup. Decline (requested) / Stop (approved; the client is paused).
 */
export const decideSampleBriefTool = defineTool({
  name: 'decide_sample_brief',
  access: 'write',
  description: "Platform staff: approve a confirmed sample-brief request (creates the business in the Rival Monday Samples agency and returns its setup link; counts against this month's sample limit), decline it, or stop a sample in progress (its business is paused). Nobody is emailed.",
  input: DecideSampleIn,
  output: z.object({ status: z.enum(SAMPLE_STATUSES), clientId: Id.nullable(), setupUrl: z.string().nullable() }),
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'decide_sample_brief', input, undefined, async () => {
      const out = await deps.service.transaction(async (tx) => {
        const [entry] = await tx.select().from(waitlistEntry).where(eq(waitlistEntry.id, input.id)).for('update');
        if (!entry || entry.kind !== 'agency' || !entry.sampleStatus) throw new ToolError('not_found', 'Sample request not found');
        const now = new Date();
        const decided = { decidedAt: now, decidedBy: ctx.userId, updatedAt: now };

        if (!input.approve) {
          if (entry.sampleStatus === 'requested') {
            await tx.update(waitlistEntry).set({ sampleStatus: 'declined', ...decided }).where(eq(waitlistEntry.id, entry.id));
            return { status: 'declined' as SampleStatus, clientId: null, afterCommit: null };
          }
          if (entry.sampleStatus === 'approved') {
            if (entry.sampleClientId) await pauseClient(tx, entry.sampleClientId, ctx.userId, 'agency');
            await tx.update(waitlistEntry).set({ sampleStatus: 'failed', ...decided }).where(eq(waitlistEntry.id, entry.id));
            return { status: 'failed' as SampleStatus, clientId: entry.sampleClientId, afterCommit: null };
          }
          throw new ToolError('conflict', 'This sample was already handled.', { userFacing: true });
        }

        if (!entry.emailConfirmedAt || entry.sampleStatus !== 'requested') throw new ToolError('conflict', 'Only confirmed requests can be approved.', { userFacing: true });
        // The setting row lock (held from here to commit) serialises approvals, so the month's count below cannot be raced past.
        const sampleId = await ensureSampleAgency(tx, deps, ctx.userId);
        const limit = await sampleBriefMonthlyLimit(tx);
        const [{ used } = { used: 0 }] = await tx.select({ used: count() }).from(waitlistEntry).where(approvedThisMonth);
        if (used >= limit) {
          throw new ToolError('conflict', `This month's sample limit (${limit}) is used up. Raise it on Billing & plans or wait until next month.`, { userFacing: true });
        }
        await ensureOperatorMembership(tx, sampleId, ctx.userId);
        const lookup = input.lookup!;
        const created = await createClientCore(tx, deps, platformAgencyCtx(ctx, sampleId), {
          name: lookup.title.slice(0, 120), verticalId: input.verticalId!, services: [], keywords: [], serviceArea: null, placeId: null, features: [], status: 'active', lookup,
        });
        await tx.update(waitlistEntry).set({ sampleStatus: 'approved', sampleClientId: created.clientId, sampleApprovedAt: now, ...decided }).where(eq(waitlistEntry.id, entry.id));
        return { status: 'approved' as SampleStatus, clientId: created.clientId, afterCommit: created.afterCommit };
      });
      if (out.afterCommit) await out.afterCommit();
      return { status: out.status, clientId: out.clientId, setupUrl: out.status === 'approved' && out.clientId ? `/c/${out.clientId}/setup` : null };
    });
  },
});

const NOT_APPROVED = "The starting point isn't approved yet. Approve it in Approvals first.";

/**
 * Send (or send again): the requester gets a fresh 30-day read-only link to the approved starting point and its evidence, and the
 * sample business is paused (no more paid work). The link is stateless (`sample-token.ts`); the page re-checks the entry is `sent`,
 * so Stop ends every link. The email is sent after commit; a failure keeps the state and the operator copies the returned link.
 */
export const sendSampleBriefTool = defineTool({
  name: 'send_sample_brief',
  access: 'write',
  description: 'Platform staff: email the requester a 30-day read-only link to the approved sample starting point and its evidence, and pause the sample business. On a sent sample it sends a fresh link.',
  input: z.object({ id: Id }),
  output: z.object({ url: z.string(), expiresAt: z.string(), emailed: z.boolean() }),
  supportMask: ['emailed'], // a boolean (nothing to mask); listed because the key matches /email/i
  permission: 'agency',
  audit: 'skip-web',
  async handler(ctx: AccessContext, input, deps) {
    return operate(deps, ctx, 'staff', 'send_sample_brief', input, undefined, async () => {
      const secret = deps.sampleLinkSecret;
      if (!secret || !deps.appUrl) throw new ToolError('internal', 'Sample links need APP_URL and BETTER_AUTH_SECRET');
      const now = new Date();
      await deps.service.transaction(async (tx) => {
        const [entry] = await tx.select().from(waitlistEntry).where(eq(waitlistEntry.id, input.id)).for('update');
        if (!entry || entry.kind !== 'agency' || !entry.sampleStatus) throw new ToolError('not_found', 'Sample request not found');
        if (entry.sampleStatus === 'declined' || entry.sampleStatus === 'failed') throw new ToolError('conflict', 'This sample was already handled.', { userFacing: true });
        const clientId = entry.sampleStatus === 'requested' ? null : entry.sampleClientId;
        const [sp] = clientId
          ? await tx.select({ id: brief.id }).from(brief).where(and(eq(brief.clientId, clientId), eq(brief.kind, 'starting_point'), inArray(brief.status, ['approved', 'sent'])))
          : [];
        if (!clientId || !sp) throw new ToolError('conflict', NOT_APPROVED, { userFacing: true });
        await tx.update(waitlistEntry).set({ sampleStatus: 'sent', sampleSentAt: now, updatedAt: now }).where(eq(waitlistEntry.id, entry.id));
        await pauseClient(tx, clientId, ctx.userId, 'agency'); // keeps an earlier pause time
      });
      const expMs = now.getTime() + SAMPLE_LINK_TTL_MS;
      const url = `${deps.appUrl.replace(/\/+$/, '')}/sample/${signSampleToken(input.id, expMs, secret)}`;
      const expiresAt = new Date(expMs).toISOString();
      let emailed = false;
      if (!deps.leadEmail) {
        console.warn(`[waitlist] email is not configured; sample link not emailed entry=${input.id}`);
      } else {
        try {
          await sendWaitlistEmail({ service: deps.service, ...deps.leadEmail }, input.id, 'sample_ready', { sampleUrl: url, expiresAt });
          emailed = true;
        } catch {
          // sendWaitlistEmail logged the entry id; the web shows the link to copy.
        }
      }
      return { url, expiresAt, emailed };
    });
  },
});

export const platformWaitlistTools = [listWaitlistTool, inviteWaitlistAgenciesTool, declineWaitlistEntryTool, platformFindBusinessTool, assignWaitlistBusinessTool, decideSampleBriefTool, sendSampleBriefTool];

