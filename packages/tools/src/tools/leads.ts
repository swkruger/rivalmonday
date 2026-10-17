import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { agency, intakeLink, lead, leadPreviewSchema, type LeadRow, type LeadStatus, setupLookupSchema, type Tx, withTenant } from '@cs/db';
import { listVerticalPacks } from '@cs/verticals';
import { and, count, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { inviteClientUser } from '../access/client-invite';
import { packsOf, type ToolDeps } from '../deps';
import { type LeadEmailKind, sendLeadEmail } from '../intake/emails';
import { preselectVertical } from '../setup/lookup';
import { createClientCore } from './onboarding';

// Phase 11c §5: the agency side of the intake. `lead`/`intake_link` are SELECT-only for app_user (reads go through
// withTenant + RLS); every write runs on deps.service, scoped to ctx.agencyId by hand (the service role bypasses RLS).
// Ruling H: `lead_select` admits limited-scope account managers at the DB level; every lead tool refuses them here.

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

/** The statuses an agency ever sees: unverified/expired leads are not leads yet. */
const AGENCY_STATUSES = ['verified', 'accepted', 'declined'] as const satisfies readonly LeadStatus[];

/** Path segments the `/start/*` routes own: a slug equal to one would be shadowed by the static route. */
const RESERVED_SLUGS = new Set(['verify']);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const SLUG_MAX = 40;
const SLUG_TAKEN = 'That link name is taken. Try another.';

const LeadSummary = z.object({
  id: uuid,
  source: z.enum(['agency_link', 'platform']),
  status: z.enum(AGENCY_STATUSES),
  ref: z.string().nullable(),
  businessName: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  contactName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  message: z.string().nullable(),
  preview: leadPreviewSchema,
  createdAt: z.date(),
  verifiedAt: z.date().nullable(),
  decidedAt: z.date().nullable(),
  clientId: uuid.nullable(),
});
type LeadSummaryOut = z.infer<typeof LeadSummary>;
const LeadListItem = LeadSummary.extend({ suggestedVerticalId: z.string().nullable() });
const LeadDetail = LeadListItem.extend({ lookup: setupLookupSchema });

const IntakeLinkOut = z.object({
  slug: z.string().nullable(),
  enabled: z.boolean(),
  url: z.string().nullable(),
  counts: z.object({ newThisMonth: z.number().int(), accepted: z.number().int() }),
});
type IntakeLinkState = z.infer<typeof IntakeLinkOut>;

function requireAllScope(ctx: AccessContext): void {
  if (ctx.clientScope !== 'all') throw new ToolError('permission_denied', 'Only users who cover all clients can see leads');
}

function requireAdmin(ctx: AccessContext): void {
  if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins manage the intake link');
}

const toSummary = (r: LeadRow): LeadSummaryOut => ({
  id: r.id, source: r.source, status: r.status as LeadSummaryOut['status'], ref: r.ref, businessName: r.lookup.title, address: r.lookup.address, city: r.lookup.city,
  contactName: r.contactName, email: r.email, phone: r.phone, message: r.message, preview: r.preview, createdAt: r.createdAt, verifiedAt: r.verifiedAt, decidedAt: r.decidedAt, clientId: r.clientId,
});

const loadPacks = async (deps: ToolDeps) => Promise.all((await listVerticalPacks()).map((id) => packsOf(deps)(id)));
const suggestVertical = (packs: Awaited<ReturnType<typeof loadPacks>>, r: LeadRow): string | null => preselectVertical(packs, r.lookup.category ? [r.lookup.category] : []);

/** Locks the caller's agency's verified lead, or refuses with not_found (another agency's, a pool lead, or already decided). */
async function lockVerifiedLead(tx: Tx, ctx: AccessContext, leadId: string): Promise<LeadRow> {
  const [row] = await tx.select().from(lead).where(and(eq(lead.id, leadId), eq(lead.agencyId, ctx.agencyId), eq(lead.status, 'verified'))).for('update');
  if (!row) throw new ToolError('not_found', 'Lead not found');
  return row;
}

/** Direct lead mail after commit (R1). Never throws: the decision already committed; guarded kinds are retried by leads-cleanup. */
export async function sendAfterCommit(deps: ToolDeps, leadId: string, kind: LeadEmailKind): Promise<void> {
  if (!deps.leadEmail) {
    console.warn(`[leads] lead email is not configured; ${kind} not sent for lead=${leadId}`);
    return;
  }
  try {
    await sendLeadEmail({ service: deps.service, ...deps.leadEmail }, leadId, kind);
  } catch (e) {
    console.error(`[leads] ${kind} send failed lead=${leadId}`, (e as { name?: string } | null)?.name);
  }
}

export const listLeads = defineTool({
  name: 'list_leads',
  access: 'read',
  description: 'List the leads that came in through this agency’s intake link or were assigned to it, newest first (agency users who cover all clients).',
  input: z.object({ status: z.enum(AGENCY_STATUSES).optional() }),
  output: z.object({ leads: z.array(LeadListItem) }),
  permission: 'agency',
  audit: 'skip-web',
  supportMask: ['leads[].email', 'leads[].phone', 'leads[].message'],
  async handler(ctx, { status }, deps) {
    requireAllScope(ctx);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select().from(lead)
        .where(and(eq(lead.agencyId, ctx.agencyId), status ? eq(lead.status, status) : inArray(lead.status, [...AGENCY_STATUSES])))
        .orderBy(desc(lead.createdAt)).limit(200));
    const packs = await loadPacks(deps);
    return { leads: rows.map((r) => ({ ...toSummary(r), suggestedVerticalId: suggestVertical(packs, r) })) };
  },
});

export const getLead = defineTool({
  name: 'get_lead',
  access: 'read',
  description: 'One lead with its Google listing, preview and a suggested vertical (agency users who cover all clients).',
  input: z.object({ leadId: uuid }),
  output: LeadDetail,
  permission: 'agency',
  audit: 'skip-web',
  supportMask: ['email', 'phone', 'message'],
  async handler(ctx, { leadId }, deps) {
    requireAllScope(ctx);
    const [row] = await withTenant(deps.app, ctx, (tx) =>
      tx.select().from(lead).where(and(eq(lead.id, leadId), eq(lead.agencyId, ctx.agencyId), inArray(lead.status, [...AGENCY_STATUSES]))));
    if (!row) throw new ToolError('not_found', 'Lead not found');
    return { ...toSummary(row), lookup: row.lookup, suggestedVerticalId: suggestVertical(await loadPacks(deps), row) };
  },
});

export const acceptLead = defineTool({
  name: 'accept_lead',
  access: 'write',
  description: 'Accept a verified lead: creates the business as a prospect, starts its setup and invites the contact as the client owner.',
  input: z.object({ leadId: uuid, verticalId: z.string().max(40) }),
  output: z.object({ clientId: uuid }),
  permission: 'agency',
  async handler(ctx, { leadId, verticalId }, deps) {
    requireAllScope(ctx);
    const { clientId, afterCommit } = await deps.service.transaction(async (tx) => {
      const row = await lockVerifiedLead(tx, ctx, leadId);
      const now = new Date();
      const created = await createClientCore(tx, deps, ctx, {
        name: row.lookup.title.slice(0, 120), verticalId, services: [], keywords: [], serviceArea: null, placeId: null, features: [], status: 'prospect',
        lookup: row.lookup, source: row.source === 'platform' ? 'platform_lead' : 'agency_link',
      });
      await tx.update(lead).set({ status: 'accepted', clientId: created.clientId, decidedBy: ctx.userId, decidedAt: now, updatedAt: now }).where(eq(lead.id, row.id));
      // inviteClientUser opens its own transaction: on `tx` it becomes a savepoint, so a refused invite rolls back the whole accept.
      await inviteClientUser(ctx, { ...deps, service: tx as unknown as ToolDeps['service'] }, { clientId: created.clientId, email: row.email, name: row.contactName, role: 'client_owner' }, now);
      return created;
    });
    await afterCommit();
    return { clientId };
  },
});

export const declineLead = defineTool({
  name: 'decline_lead',
  access: 'write',
  description: 'Decline a verified lead. Leads from the platform go back to the platform pool; leads from your link are closed, optionally letting the contact know.',
  input: z.object({ leadId: uuid, notify: z.boolean() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { leadId, notify }, deps) {
    requireAllScope(ctx);
    const outcome = await deps.service.transaction(async (tx) => {
      const row = await lockVerifiedLead(tx, ctx, leadId);
      const now = new Date();
      if (row.source === 'platform') {
        // Fix round 1: the visitor may have re-submitted on /start meanwhile, leaving an open pool twin (same
        // lead_dedupe_idx key). Returning this row would violate the index, and the pool already holds the lead:
        // close this one as declined instead and send no pool notice.
        const [twin] = await tx.select({ id: lead.id }).from(lead).where(and(
          isNull(lead.agencyId), inArray(lead.status, ['unverified', 'verified']), ne(lead.id, row.id),
          sql`lower(${lead.email}) = lower(${row.email})`, sql`${lead.lookup}->>'placeId' = ${row.lookup.placeId}`,
        )).for('update');
        if (twin) {
          await tx.update(lead).set({ status: 'declined', decidedBy: ctx.userId, decidedAt: now, updatedAt: now }).where(eq(lead.id, row.id));
          return 'closed' as const;
        }
        // Spec §5 + ruling E: back to the pool, still verified; the agency and pool notice guards reset so the
        // platform is told again (and a later assignee's agency notice can go out).
        await tx.update(lead).set({ agencyId: null, decidedBy: ctx.userId, decidedAt: now, assignedBy: null, assignedAt: null, agencyNotifiedAt: null, poolNotifiedAt: null, updatedAt: now }).where(eq(lead.id, row.id));
        return 'pooled' as const;
      }
      await tx.update(lead).set({ status: 'declined', decidedBy: ctx.userId, decidedAt: now, updatedAt: now }).where(eq(lead.id, row.id));
      return 'declined' as const;
    });
    // A platform lead never gets the agency-branded "declined" mail: the pool (or its twin there) may still be taken.
    if (outcome === 'pooled') await sendAfterCommit(deps, leadId, 'pool_new');
    else if (outcome === 'declined' && notify) await sendAfterCommit(deps, leadId, 'declined');
    return { ok: true as const };
  },
});

/** Pure: an agency name as an intake slug base (lower-case ASCII, hyphens, ≥ 3 and ≤ 40 characters). */
export function slugBase(name: string): string {
  const s = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX).replace(/-+$/, '');
  if (s.length >= 3) return s;
  return s ? `${s}-agency` : 'agency';
}

/** Pure: the n-th candidate (1 = the base itself, then `-2`, `-3`, …), trimmed to fit 40 characters. */
export function slugCandidate(base: string, n: number): string {
  if (n === 1) return base;
  const suffix = `-${n}`;
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
}

function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, i = 0; cur && i < 5; cur = (cur as { cause?: unknown }).cause, i++) {
    if ((cur as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/** Runs `write` in a savepoint; false when it hit a unique violation (slug taken), rethrows anything else. */
async function tryUnique(tx: Tx, write: (sp: Tx) => Promise<unknown>): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => { await write(sp); });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

const slugTaken = () => new ToolError('slug_taken', SLUG_TAKEN, { userFacing: true });

async function intakeLinkState(ctx: AccessContext, deps: ToolDeps): Promise<IntakeLinkState> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  return withTenant(deps.app, ctx, async (tx) => {
    const [link] = await tx.select().from(intakeLink).where(eq(intakeLink.agencyId, ctx.agencyId));
    const fromLink = and(eq(lead.agencyId, ctx.agencyId), eq(lead.source, 'agency_link'));
    const [fresh] = await tx.select({ n: count() }).from(lead).where(and(fromLink, inArray(lead.status, [...AGENCY_STATUSES]), gte(lead.verifiedAt, monthStart)));
    const [accepted] = await tx.select({ n: count() }).from(lead).where(and(fromLink, eq(lead.status, 'accepted')));
    const base = (deps.appUrl ?? '').replace(/\/+$/, '');
    return {
      slug: link?.slug ?? null,
      enabled: link?.enabled ?? false,
      url: link ? `${base}/start/${link.slug}` : null,
      counts: { newThisMonth: fresh?.n ?? 0, accepted: accepted?.n ?? 0 },
    };
  });
}

export const getIntakeLink = defineTool({
  name: 'get_intake_link',
  access: 'read',
  description: 'This agency’s public intake link (slug, on/off, URL) and its lead counts (agency admins).',
  input: z.object({}),
  output: IntakeLinkOut,
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    return intakeLinkState(ctx, deps);
  },
});

export const updateIntakeLink = defineTool({
  name: 'update_intake_link',
  access: 'write',
  description: 'Create or change this agency’s public intake link: its name (slug) and whether it takes new leads (agency admins).',
  input: z.object({ slug: z.string().trim().toLowerCase().regex(SLUG_RE, 'Use 3–40 lower-case letters, digits or hyphens').optional(), enabled: z.boolean().optional() }),
  output: IntakeLinkOut,
  permission: 'agency',
  async handler(ctx, { slug, enabled }, deps) {
    requireAdmin(ctx);
    if (slug !== undefined && RESERVED_SLUGS.has(slug)) throw slugTaken();
    await deps.service.transaction(async (tx) => {
      // The agency row lock serialises two admins creating the link at once (no intake_link row to lock yet).
      const [a] = await tx.select({ name: agency.name }).from(agency).where(eq(agency.id, ctx.agencyId)).for('update');
      if (!a) throw new ToolError('not_found', 'Agency not found');
      const [cur] = await tx.select().from(intakeLink).where(eq(intakeLink.agencyId, ctx.agencyId)).for('update');
      if (cur) {
        const patch = { ...(slug !== undefined && slug !== cur.slug ? { slug } : {}), ...(enabled !== undefined ? { enabled } : {}) };
        if (Object.keys(patch).length === 0) return;
        if (!(await tryUnique(tx, (sp) => sp.update(intakeLink).set(patch).where(eq(intakeLink.agencyId, ctx.agencyId))))) throw slugTaken();
        return;
      }
      const insert = (s: string) => (sp: Tx) => sp.insert(intakeLink).values({ agencyId: ctx.agencyId, slug: s, enabled: enabled ?? true });
      if (slug !== undefined) {
        if (!(await tryUnique(tx, insert(slug)))) throw slugTaken();
        return;
      }
      // First creation without a slug: the slugified agency name, then `-2`, `-3`, … on conflict.
      const base = slugBase(a.name);
      for (let n = 1; n <= 50; n++) {
        const candidate = slugCandidate(base, n);
        if (RESERVED_SLUGS.has(candidate)) continue;
        const [taken] = await tx.select({ one: sql<number>`1` }).from(intakeLink).where(eq(intakeLink.slug, candidate));
        if (!taken && (await tryUnique(tx, insert(candidate)))) return;
      }
      throw slugTaken();
    });
    return intakeLinkState(ctx, deps);
  },
});

export const leadTools = [listLeads, getLead, acceptLead, declineLead, getIntakeLink, updateIntakeLink];
