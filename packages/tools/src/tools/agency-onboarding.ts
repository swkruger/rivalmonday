import { createHash } from 'node:crypto';
import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { agency, agencyOnboarding, agencyProfile, type Tx } from '@cs/db';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { validTimezone } from '../timezone';

const { defineTool } = toolkit<ToolDeps>();

const STEPS = ['profile', 'team', 'plan', 'branding'] as const;
type Step = (typeof STEPS)[number];
const StepState = z.enum(['done', 'skipped', 'open']);
const VERTICALS = ['hvac_plumbing', 'dental'] as const;
const PHONE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const ZIP = /^\d{5}(-\d{4})?$/;

type OnboardingRow = typeof agencyOnboarding.$inferSelect;

/** Account managers and admins read; everything else was already turned away (404) by `permission: 'agency'`. */
function requireAdmin(ctx: AccessContext) {
  if (ctx.role !== 'agency_admin' || ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Only agency admins can change onboarding');
}
function requireReader(ctx: AccessContext) {
  if (ctx.role !== 'agency_admin' && ctx.role !== 'account_manager') throw new ToolError('permission_denied', 'Not allowed');
}

const stepState = (done: Date | null, skipped: Date | null) => (done ? 'done' : skipped ? 'skipped' : 'open') as z.infer<typeof StepState>;

/**
 * Spec rule: `completed_at` is set when all four steps are done/skipped AND (a first client exists OR the checklist is
 * dismissed). Never cleared. Runs on the service connection (app_user may only SELECT agency_onboarding); the row is
 * locked so concurrent marks and `create_client` cannot interleave.
 */
export async function reevaluateOnboardingCompletion(tx: Tx, agencyId: string, now = new Date()): Promise<void> {
  const [r] = await tx.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, agencyId)).for('update');
  if (!r || r.completedAt) return;
  const stepsSettled = stepState(r.profileDoneAt, r.profileSkippedAt) !== 'open' && stepState(r.teamDoneAt, r.teamSkippedAt) !== 'open'
    && stepState(r.planDoneAt, r.planSkippedAt) !== 'open' && stepState(r.brandingDoneAt, r.brandingSkippedAt) !== 'open';
  if (stepsSettled && (r.firstClientAt || r.dismissedAt)) await tx.update(agencyOnboarding).set({ completedAt: now }).where(eq(agencyOnboarding.agencyId, agencyId));
}

/**
 * R25: agencies created before Phase 10 are backfilled as `legacy`; an agency created outside sign-up (admin CLI, seeds)
 * has no row and is treated the same — inserted as a completed, already-redirected legacy row so it never sees the
 * checklist or the first-session redirect.
 */
async function ensureRow(tx: Tx, agencyId: string): Promise<void> {
  const now = new Date();
  await tx.insert(agencyOnboarding).values({ agencyId, source: 'legacy', completedAt: now, redirectedAt: now }).onConflictDoNothing();
}

async function markStep(tx: Tx, agencyId: string, step: Step, action: 'done' | 'skip', now: Date): Promise<void> {
  await ensureRow(tx, agencyId);
  const [r] = await tx.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, agencyId)).for('update');
  const col = { done: `${step}DoneAt`, skipped: `${step}SkippedAt` } as { done: keyof OnboardingRow; skipped: keyof OnboardingRow };
  if (action === 'done') {
    await tx.update(agencyOnboarding).set({ [col.done]: (r![col.done] as Date | null) ?? now, [col.skipped]: null }).where(eq(agencyOnboarding.agencyId, agencyId));
  } else if (!r![col.done]) {
    await tx.update(agencyOnboarding).set({ [col.skipped]: (r![col.skipped] as Date | null) ?? now }).where(eq(agencyOnboarding.agencyId, agencyId));
  }
  await reevaluateOnboardingCompletion(tx, agencyId, now);
}

const OK = z.object({ ok: z.literal(true) });
const ok = { ok: true as const };

export const OnboardingStatus = z.object({
  steps: z.object({ profile: StepState, team: StepState, plan: StepState, branding: StepState, first_client: StepState }),
  dismissed: z.boolean(),
  completed: z.boolean(),
  /** The first-session redirect to the wizard has already happened (a missing row reads as completed legacy: never redirect). */
  redirected: z.boolean(),
  source: z.enum(['open', 'invite', 'legacy']),
});
export type OnboardingStatus = z.infer<typeof OnboardingStatus>;

export const getOnboardingStatus = defineTool({
  name: 'get_onboarding_status',
  access: 'read',
  description: 'The agency’s sign-up wizard / checklist progress (agency admins and account managers).',
  input: z.object({}),
  output: OnboardingStatus,
  permission: 'agency',
  async handler(ctx, _input, deps): Promise<OnboardingStatus> {
    requireReader(ctx);
    const [r] = await deps.service.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, ctx.agencyId));
    // R25: a missing row (admin CLI, seeds) reads as a completed legacy agency — no checklist, no redirect.
    if (!r) return { steps: { profile: 'done', team: 'done', plan: 'done', branding: 'done', first_client: 'done' }, dismissed: false, completed: true, redirected: true, source: 'legacy' as const };
    return {
      steps: {
        profile: stepState(r.profileDoneAt, r.profileSkippedAt), team: stepState(r.teamDoneAt, r.teamSkippedAt),
        plan: stepState(r.planDoneAt, r.planSkippedAt), branding: stepState(r.brandingDoneAt, r.brandingSkippedAt),
        first_client: r.firstClientAt ? 'done' : 'open',
      },
      dismissed: !!r.dismissedAt,
      completed: !!r.completedAt,
      redirected: !!r.redirectedAt,
      source: r.source,
    };
  },
});

export const markOnboardingStep = defineTool({
  name: 'mark_onboarding_step',
  access: 'write',
  description: 'Mark a sign-up wizard step done or skipped (agency admins).',
  input: z.object({ step: z.enum(STEPS), action: z.enum(['done', 'skip']) }),
  output: OK,
  permission: 'agency',
  async handler(ctx, { step, action }, deps) {
    requireAdmin(ctx);
    await deps.service.transaction((tx) => markStep(tx, ctx.agencyId, step, action, new Date()));
    return ok;
  },
});

export const dismissOnboardingChecklist = defineTool({
  name: 'dismiss_onboarding_checklist',
  access: 'write',
  description: 'Hide the getting-started checklist (agency admins).',
  input: z.object({}),
  output: OK,
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    await deps.service.transaction(async (tx) => {
      const now = new Date();
      await ensureRow(tx, ctx.agencyId);
      const [r] = await tx.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, ctx.agencyId)).for('update');
      if (!r!.dismissedAt) await tx.update(agencyOnboarding).set({ dismissedAt: now }).where(eq(agencyOnboarding.agencyId, ctx.agencyId));
      await reevaluateOnboardingCompletion(tx, ctx.agencyId, now);
    });
    return ok;
  },
});

export const markOnboardingRedirected = defineTool({
  name: 'mark_onboarding_redirected',
  access: 'write',
  description: 'Record that the first-session redirect to the sign-up wizard happened (agency admins).',
  input: z.object({}),
  output: OK,
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    await deps.service.transaction(async (tx) => {
      await ensureRow(tx, ctx.agencyId);
      const [r] = await tx.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, ctx.agencyId)).for('update');
      if (!r!.redirectedAt) await tx.update(agencyOnboarding).set({ redirectedAt: new Date() }).where(eq(agencyOnboarding.agencyId, ctx.agencyId));
    });
    return ok;
  },
});

// ---- profile ----

const nstr = z.string().nullable();
const ProfileBase = z.object({
  name: z.string(), legalName: nstr, website: nstr, contactName: z.string(), contactRole: nstr, contactEmail: z.string(), phone: z.string(),
  line1: nstr, line2: nstr, city: nstr, region: nstr, postalCode: nstr, country: z.string(), timezone: z.string(), verticals: z.array(z.string()),
});
const BillingPart = z.object({
  billingEmail: nstr, billingSameAsPostal: z.boolean(), billingLine1: nstr, billingLine2: nstr, billingCity: nstr, billingRegion: nstr,
  billingPostalCode: nstr, billingCountry: nstr, taxId: nstr,
});
/** Account-manager variant omits `billing*` and `taxId` entirely. */
export const AgencyProfile = ProfileBase.extend(BillingPart.partial().shape);
export type AgencyProfile = z.infer<typeof AgencyProfile>;

export const getAgencyProfile = defineTool({
  name: 'get_agency_profile',
  access: 'read',
  description: 'The agency’s business profile; account managers do not see billing or tax fields.',
  input: z.object({}),
  output: AgencyProfile,
  permission: 'agency',
  supportMask: ['contactEmail', 'billingEmail'],
  async handler(ctx, _input, deps) {
    requireReader(ctx);
    const [row] = await deps.service
      .select({ name: agency.name, p: agencyProfile })
      .from(agency)
      .leftJoin(agencyProfile, eq(agencyProfile.agencyId, agency.id))
      .where(eq(agency.id, ctx.agencyId));
    if (!row) throw new ToolError('not_found', 'Agency not found');
    const p = row.p;
    const base = {
      name: row.name, legalName: p?.legalName ?? null, website: p?.website ?? null, contactName: p?.contactName ?? '', contactRole: p?.contactRole ?? null,
      contactEmail: p?.contactEmail ?? '', phone: p?.phone ?? '', line1: p?.line1 ?? null, line2: p?.line2 ?? null, city: p?.city ?? null, region: p?.region ?? null,
      postalCode: p?.postalCode ?? null, country: p?.country ?? 'US', timezone: p?.timezone ?? 'America/New_York', verticals: p?.verticals ?? [],
    };
    if (ctx.role !== 'agency_admin') return base;
    return {
      ...base, billingEmail: p?.billingEmail ?? null, billingSameAsPostal: p?.billingSameAsPostal ?? true, billingLine1: p?.billingLine1 ?? null,
      billingLine2: p?.billingLine2 ?? null, billingCity: p?.billingCity ?? null, billingRegion: p?.billingRegion ?? null,
      billingPostalCode: p?.billingPostalCode ?? null, billingCountry: p?.billingCountry ?? null, taxId: p?.taxId ?? null,
    };
  },
});

/** Optional text: trimmed, blank => null. */
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const req = (max: number, what: string) => z.string().trim().min(1, `${what} is required`).max(max);

export const UpdateAgencyProfileInput = z.object({
  name: req(120, 'Agency name'),
  legalName: opt(200),
  website: z.string().trim().max(300).regex(/^https?:\/\//i, 'Enter a full website address, like https://example.com').url('Enter a full website address, like https://example.com').nullish().or(z.literal('')).transform((v) => (v ? v : null)),
  contactName: req(120, 'Contact name'),
  contactRole: opt(120),
  contactEmail: z.string().trim().max(254).email('Enter a valid email address'),
  phone: z.string().trim().regex(PHONE, 'Enter a US phone number, like (404) 555-0100'),
  line1: opt(200), line2: opt(200), city: opt(120), region: opt(120), postalCode: opt(20),
  country: z.string().trim().min(2).max(2).default('US').transform((v) => v.toUpperCase()),
  timezone: z.string().refine(validTimezone, 'Unknown time zone'),
  verticals: z.array(z.enum(VERTICALS)).max(10).default([]).transform((v) => [...new Set(v)]),
  billingEmail: z.string().trim().max(254).email('Enter a valid billing email').nullish().or(z.literal('')).transform((v) => (v ? v : null)),
  billingSameAsPostal: z.boolean().default(true),
  billingLine1: opt(200), billingLine2: opt(200), billingCity: opt(120), billingRegion: opt(120), billingPostalCode: opt(20),
  billingCountry: z.string().trim().nullish().transform((v) => (v ? v.toUpperCase() : null)).refine((v) => v === null || v.length === 2, 'Use a 2-letter country code'),
  taxId: opt(60),
}).superRefine((v, c) => {
  if (v.country === 'US' && v.postalCode && !ZIP.test(v.postalCode)) c.addIssue({ code: 'custom', path: ['postalCode'], message: 'Enter a 5-digit ZIP code' });
  if (!v.billingSameAsPostal && (v.billingCountry ?? 'US').toUpperCase() === 'US' && v.billingPostalCode && !ZIP.test(v.billingPostalCode)) {
    c.addIssue({ code: 'custom', path: ['billingPostalCode'], message: 'Enter a 5-digit ZIP code' });
  }
});

export const updateAgencyProfile = defineTool({
  name: 'update_agency_profile',
  access: 'write',
  description: 'Save the agency’s name and business profile; completes the profile step (agency admins).',
  input: UpdateAgencyProfileInput,
  output: OK,
  permission: 'agency',
  async handler(ctx, v, deps) {
    requireAdmin(ctx);
    const same = v.billingSameAsPostal;
    const values = {
      legalName: v.legalName, website: v.website, contactName: v.contactName, contactRole: v.contactRole, contactEmail: v.contactEmail, phone: v.phone,
      line1: v.line1, line2: v.line2, city: v.city, region: v.region, postalCode: v.postalCode, country: v.country, timezone: v.timezone, verticals: v.verticals,
      billingEmail: v.billingEmail, billingSameAsPostal: same, taxId: v.taxId,
      billingLine1: same ? v.line1 : v.billingLine1, billingLine2: same ? v.line2 : v.billingLine2, billingCity: same ? v.city : v.billingCity,
      billingRegion: same ? v.region : v.billingRegion, billingPostalCode: same ? v.postalCode : v.billingPostalCode,
      billingCountry: same ? v.country : (v.billingCountry ?? v.country), updatedAt: new Date(),
    };
    await deps.service.transaction(async (tx) => {
      await tx.update(agency).set({ name: v.name }).where(eq(agency.id, ctx.agencyId));
      await tx.insert(agencyProfile).values({ agencyId: ctx.agencyId, ...values }).onConflictDoUpdate({ target: agencyProfile.agencyId, set: values });
      await markStep(tx, ctx.agencyId, 'profile', 'done', new Date());
    });
    return ok;
  },
});

// ---- logo (spec § Logo pipeline; the web route normalises with sharp, this tool stores + points branding at it) ----

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A normalised logo is ≤ 512×512 PNG; 2 MB of PNG is far above anything the route produces. */
const MAX_LOGO_PNG_BYTES = 2 * 1024 * 1024;

export const uploadAgencyLogo = defineTool({
  name: 'upload_agency_logo',
  access: 'write',
  description: 'Store the agency’s normalised PNG logo and point its branding at it (agency admins).',
  input: z.object({
    png: z.string().min(1).max(Math.ceil(MAX_LOGO_PNG_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'png must be base64'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters'),
  }),
  output: z.object({ logoUrl: z.string() }),
  permission: 'agency',
  async handler(ctx, { png, sha256 }, deps) {
    requireAdmin(ctx);
    const store = deps.evidenceStore;
    if (!store) throw new ToolError('internal', 'Logo storage is not configured');
    if (!deps.appUrl) throw new ToolError('internal', 'APP_URL is not configured');
    const bytes = new Uint8Array(Buffer.from(png, 'base64'));
    if (bytes.byteLength > MAX_LOGO_PNG_BYTES || !PNG_SIGNATURE.every((v, i) => bytes[i] === v)) throw new ToolError('invalid_input', 'Logo must be a PNG');
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new ToolError('invalid_input', 'Logo checksum does not match');
    const key = `logos/${ctx.agencyId}/${sha256}.png`;
    // Store first: a failed branding update leaves an unreferenced object (harmless); the reverse would leave a broken URL.
    await store.put(key, bytes, 'image/png');
    const logoUrl = `${deps.appUrl.replace(/\/+$/, '')}/files/logo/${ctx.agencyId}/${sha256}.png`;
    await deps.service
      .update(agency)
      .set({ branding: sql`coalesce(${agency.branding}, '{}'::jsonb) || jsonb_build_object('logoUrl', ${logoUrl}::text)` })
      .where(eq(agency.id, ctx.agencyId));
    return { logoUrl };
  },
});

export const agencyOnboardingTools = [getOnboardingStatus, markOnboardingStep, dismissOnboardingChecklist, markOnboardingRedirected, getAgencyProfile, updateAgencyProfile, uploadAgencyLogo];
