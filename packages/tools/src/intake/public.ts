import { ToolError } from '@cs/core';
import { agency, type Db, intakeLink, type LeadPreview, leadPreviewSchema, type SetupLookup, setupLookupSchema } from '@cs/db';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, type ToolDeps } from '../deps';
import { toSetupLookup } from '../setup/lookup';
import { hitRate, INTAKE_LIMITS } from './rate';
import { hashToken, newToken } from './tokens';

// Phase 11c §3: public (unauthenticated) intake service functions, called by server actions — not registered tools.
// Privacy: never log tokens, raw IPs or emails. Refusal reasons are logged as a bare reason word only.

const VERIFY_TTL_MS = 48 * 3_600_000;
const VIEW_TTL = '30 days';

export type IntakeBranding = 'agency' | 'platform';

/** Slug → enabled `intake_link`; `null` slug = the platform page. Unknown or disabled → null (page 404s). */
export async function resolveIntake(service: Db, slug: string | null): Promise<{ agencyId: string | null; branding: IntakeBranding } | null> {
  if (slug === null) return { agencyId: null, branding: 'platform' };
  const [row] = await service.select({ agencyId: intakeLink.agencyId }).from(intakeLink)
    .where(and(eq(intakeLink.slug, slug), eq(intakeLink.enabled, true))).limit(1);
  return row ? { agencyId: row.agencyId, branding: 'agency' } : null;
}

const linkKey = (agencyId: string | null) => (agencyId ? `link:${agencyId}` : 'platform');
const ipKey = (ipHash: string) => `ip:${ipHash}`;

const LookupInput = z.object({ name: z.string().trim().min(1).max(120), location: z.string().trim().min(2).max(120) });

/**
 * The 11a business lookup for a public visitor. Rate-limited per hashed IP (hourly, shared with `submitIntake`) and per
 * link/platform page (UTC day). Ruling A: always ledgered as platform cost (`agencyId: null`), so a public visitor can
 * never consume an agency's `find_business` daily cap.
 */
export async function intakeLookup(
  deps: ToolDeps,
  input: { slug: string | null; name: string; location: string; ipHash: string },
  now: Date,
): Promise<{ places: SetupLookup[] } | { refused: 'rate' }> {
  const q = LookupInput.safeParse(input);
  if (!q.success) throw new ToolError('invalid_input', 'Enter a business name and a city or ZIP code.', { userFacing: true });
  const target = await resolveIntake(deps.service, input.slug);
  if (!target) throw new ToolError('not_found', 'Not found');
  if (!deps.setupLookup) throw new ToolError('internal', 'Business search is not configured', { userFacing: true });

  if (!(await hitRate(deps.service, ipKey(input.ipHash), 'hour', INTAKE_LIMITS.ipPerHour, now))) return { refused: 'rate' };
  const dayLimit = target.agencyId ? INTAKE_LIMITS.linkPerDay : INTAKE_LIMITS.platformPerDay;
  if (!(await hitRate(deps.service, linkKey(target.agencyId), 'day', dayLimit, now))) return { refused: 'rate' };

  let found: Awaited<ReturnType<NonNullable<ToolDeps['setupLookup']>>>;
  try {
    found = await deps.setupLookup({ keyword: `${q.data.name} ${q.data.location}`, locationName: 'United States' }, { agencyId: null, clientId: null });
  } catch (e) {
    if (e instanceof ToolError) throw e;
    console.error('[intake] vendor lookup failed', (e as { name?: string } | null)?.name);
    throw new ToolError('internal', "Business search isn't available right now. Try again in a minute.", { userFacing: true });
  }
  const places = found.filter((p) => !p.closed).flatMap((p) => {
    const l = toSetupLookup(p);
    return l ? [l] : [];
  }).slice(0, 5);
  return { places };
}

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const SubmitInput = z.object({
  lookup: setupLookupSchema, // ruling F: browser-sent, validated, unsigned (the agency reviews before accepting)
  contactName: z.string().trim().min(1).max(120),
  email: z.string().trim().max(320).email().transform((v) => v.toLowerCase()),
  phone: optionalText(40),
  message: optionalText(500),
  ref: z.string().trim().max(80).regex(/^[\w.-]*$/).optional().transform((v) => (v ? v : null)),
});

const refused = (reason: string): { send: null } => {
  console.warn(`[intake] refused ${reason}`);
  return { send: null };
};

/**
 * Creates (or, for the same open agency/pool + email + place, refreshes) an unverified lead with a fresh single-use
 * verify token (48 h). Returns what the caller needs to send `lead_verify`; `send: null` on any refusal. The caller
 * shows the same page either way (no existence, dedupe or refusal leaks).
 */
export async function submitIntake(
  deps: ToolDeps,
  input: { slug: string | null; lookup: SetupLookup; contactName: string; email: string; phone?: string; message?: string; ref?: string; ipHash: string },
  now: Date,
): Promise<{ send: { leadId: string; verifyRaw: string } | null }> {
  const target = await resolveIntake(deps.service, input.slug);
  if (!target) return refused('link');
  const parsed = SubmitInput.safeParse(input);
  if (!parsed.success) return refused('invalid');
  if (!(await hitRate(deps.service, ipKey(input.ipHash), 'hour', INTAKE_LIMITS.ipPerHour, now))) return refused('rate');

  const v = parsed.data;
  const token = newToken();
  const expires = new Date(now.getTime() + VERIFY_TTL_MS).toISOString();
  const at = now.toISOString();
  const source = target.agencyId ? 'agency_link' : 'platform';
  // The conflict target repeats lead_dedupe_idx's expression and predicate exactly.
  const [row] = await deps.service.execute<{ id: string }>(sql`
    INSERT INTO lead (agency_id, source, ref, contact_name, email, phone, message, lookup, verify_token_hash, verify_expires_at, ip_hash, created_at, updated_at)
    VALUES (${target.agencyId}, ${source}, ${v.ref}, ${v.contactName}, ${v.email}, ${v.phone}, ${v.message}, ${JSON.stringify(v.lookup)}::jsonb,
            ${token.hash}, ${expires}::timestamptz, ${input.ipHash}, ${at}::timestamptz, ${at}::timestamptz)
    ON CONFLICT (coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email), (lookup->>'placeId'))
      WHERE status IN ('unverified','verified')
    DO UPDATE SET contact_name = EXCLUDED.contact_name, phone = EXCLUDED.phone, message = EXCLUDED.message, ref = EXCLUDED.ref,
      verify_token_hash = EXCLUDED.verify_token_hash, verify_expires_at = EXCLUDED.verify_expires_at, ip_hash = EXCLUDED.ip_hash,
      updated_at = EXCLUDED.updated_at
    RETURNING id`);
  return { send: { leadId: row!.id, verifyRaw: token.raw } };
}

/** Post-commit and non-fatal (mirrors `enqueueSetupSuggestions`): on failure the preview stays `none`. */
async function enqueueLeadPreview(deps: ToolDeps, leadId: string): Promise<void> {
  try {
    await enqueueOf(deps)('lead-preview', { leadId }, `lead-preview:${leadId}`);
  } catch (err) {
    console.warn(`[intake] lead-preview enqueue for ${leadId} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Consumes a verify token (single use, compared by hash). An unverified lead becomes `verified` and its preview is
 * queued; ruling B: a resubmit of an already-verified open lead keeps `verified_at` and only re-queues a preview that is
 * `none`/`failed`. Either way a new view token is issued. Unknown, used or expired → `{ expired: true }`.
 */
export async function verifyIntake(deps: ToolDeps, raw: string, now: Date): Promise<{ leadId: string; viewRaw: string } | { expired: true }> {
  const view = newToken();
  const at = now.toISOString();
  const [row] = await deps.service.execute<{ id: string; old_status: string; preview_status: string | null }>(sql`
    WITH old AS (
      SELECT id, status FROM lead
      WHERE verify_token_hash = ${hashToken(raw)} AND status IN ('unverified','verified') AND verify_expires_at > ${at}::timestamptz
      FOR UPDATE
    )
    UPDATE lead SET status = 'verified', verified_at = coalesce(lead.verified_at, ${at}::timestamptz),
      verify_token_hash = NULL, verify_expires_at = NULL, view_token_hash = ${view.hash}, updated_at = ${at}::timestamptz
    FROM old WHERE lead.id = old.id
    RETURNING lead.id, old.status AS old_status, lead.preview->>'status' AS preview_status`);
  if (!row) return { expired: true };
  if (row.old_status === 'unverified' || row.preview_status === 'none' || row.preview_status === 'failed') {
    await enqueueLeadPreview(deps, row.id);
  }
  return { leadId: row.id, viewRaw: view.raw };
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The public preview page's read (R4): a bad id, a bad token or a view token older than 30 days all return null. */
export async function getPublicPreview(service: Db, leadId: string, viewRaw: string)
  : Promise<{ businessName: string; preview: LeadPreview; branding: IntakeBranding; agencyName: string | null } | null> {
  if (!uuidRe.test(leadId)) return null;
  const [row] = await service.execute<{ lookup: unknown; preview: unknown; agency_id: string | null; agency_name: string | null }>(sql`
    SELECT l.lookup, l.preview, l.agency_id, a.name AS agency_name
    FROM lead l LEFT JOIN ${agency} a ON a.id = l.agency_id
    WHERE l.id = ${leadId} AND l.view_token_hash = ${hashToken(viewRaw)}
      AND l.verified_at IS NOT NULL AND l.verified_at > now() - ${VIEW_TTL}::interval`);
  if (!row) return null;
  const lookup = setupLookupSchema.safeParse(row.lookup);
  const preview = leadPreviewSchema.safeParse(row.preview);
  return {
    businessName: lookup.success ? lookup.data.title : '',
    preview: preview.success ? preview.data : { status: 'none' },
    branding: row.agency_id ? 'agency' : 'platform',
    agencyName: row.agency_id ? row.agency_name : null,
  };
}
