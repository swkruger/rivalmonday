import { CLIENT_COUNT_BANDS } from '@cs/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { hitRate } from '../intake/rate';
import { hashToken, newToken } from '../intake/tokens';

// Phase 17a: public (unauthenticated) waitlist service functions, called by server actions — not registered tools.
// Privacy: never log emails, org names or IP hashes; refusals log a bare reason word only.

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const req = (max: number) => z.string().trim().min(1).max(max);
const email = z.string().trim().max(254).email().transform((v) => v.toLowerCase());
const common = { contactName: req(120), email, orgName: req(120), source: opt(200), turnstileToken: z.string().min(1).max(2048) };

export const waitlistSubmitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agency'), ...common, website: opt(253), clientCountBand: z.enum(CLIENT_COUNT_BANDS),
    sample: z.object({ businessName: req(120), website: opt(253), location: opt(120) })
      .refine((s) => s.website || s.location, { message: 'website or location' }).optional(),
  }),
  z.object({
    kind: z.literal('business'), ...common, website: opt(253), location: opt(120),
    verticalId: z.string().trim().max(40).optional(), verticalOther: opt(80),
  }).refine((b) => b.website || b.location, { message: 'website or location' }),
]);
export type WaitlistSubmit = z.infer<typeof waitlistSubmitSchema>;

export const WAITLIST_LIMITS = { ipPerHour: 5, perDay: 500 } as const;
export const CONFIRM_TTL_MS = 7 * 86_400_000;

/** Columns a resubmit may replace, and only while the row is still unconfirmed and `new`. */
const keep = (col: string) => sql.raw(`${col} = CASE WHEN w.email_confirmed_at IS NULL AND w.status = 'new' THEN EXCLUDED.${col} ELSE w.${col} END`);

/**
 * Non-overwriting upsert: only a row that is still unconfirmed and `new` takes the new details and a fresh confirm token.
 * Anything else keeps its data (only `updated_at` moves) and no mail is sent, so a stranger cannot rewrite or re-mail a real entry.
 */
export async function submitWaitlistEntry(
  deps: Pick<ToolDeps, 'service'>,
  input: WaitlistSubmit & { ipHash: string },
  now: Date,
): Promise<{ send: { entryId: string; confirmRaw: string } | null }> {
  const { service } = deps;
  if (!(await hitRate(service, `waitlist:ip:${input.ipHash}`, 'hour', WAITLIST_LIMITS.ipPerHour, now))
    || !(await hitRate(service, 'waitlist:all', 'day', WAITLIST_LIMITS.perDay, now))) {
    console.info('[waitlist] refused rate');
    return { send: null };
  }

  const isAgency = input.kind === 'agency';
  const website = input.website;
  const location = isAgency ? null : input.location;
  const band = isAgency ? input.clientCountBand : null;
  const verticalOther = isAgency ? null : input.verticalOther;
  let verticalId: string | null = null;
  if (!isAgency && input.verticalId) {
    const [v] = await service.execute<{ id: string }>(sql`SELECT id FROM vertical WHERE id = ${input.verticalId} AND merged_into IS NULL`);
    verticalId = v?.id ?? null;
  }
  const sample = isAgency ? input.sample : undefined;

  const token = newToken();
  const at = now.toISOString();
  const expires = new Date(now.getTime() + CONFIRM_TTL_MS).toISOString();
  const [row] = await service.execute<{ id: string; fresh: boolean }>(sql`
    INSERT INTO waitlist_entry AS w (kind, contact_name, email, org_name, website, location, vertical_id, vertical_other, client_count_band,
      sample_requested, sample_business_name, sample_location, sample_website, sample_status, source, ip_hash,
      confirm_token_hash, confirm_expires_at, created_at, updated_at)
    VALUES (${input.kind}, ${input.contactName}, ${input.email}, ${input.orgName}, ${website}, ${location}, ${verticalId}, ${verticalOther}, ${band},
      ${!!sample}, ${sample?.businessName ?? null}, ${sample?.location ?? null}, ${sample?.website ?? null}, ${sample ? 'requested' : null},
      ${input.source}, ${input.ipHash}, ${token.hash}, ${expires}::timestamptz, ${at}::timestamptz, ${at}::timestamptz)
    ON CONFLICT (kind, email) DO UPDATE SET
      ${keep('contact_name')}, ${keep('org_name')}, ${keep('website')}, ${keep('location')}, ${keep('vertical_id')}, ${keep('vertical_other')},
      ${keep('client_count_band')}, ${keep('sample_requested')}, ${keep('sample_business_name')}, ${keep('sample_location')},
      ${keep('sample_website')}, ${keep('sample_status')}, ${keep('source')}, ${keep('ip_hash')}, ${keep('confirm_token_hash')},
      ${keep('confirm_expires_at')},
      updated_at = EXCLUDED.updated_at
    RETURNING id, (confirm_token_hash = ${token.hash}) AS fresh`);
  if (!row?.fresh) {
    console.info('[waitlist] refused confirmed');
    return { send: null };
  }
  return { send: { entryId: row.id, confirmRaw: token.raw } };
}

/** Reusable until expiry (mail scanners pre-open links; mirrors `verifyIntake`). */
export async function confirmWaitlistEmail(
  deps: Pick<ToolDeps, 'service'>,
  raw: string,
  now: Date,
): Promise<{ ok: true } | { expired: true }> {
  const at = now.toISOString();
  const rows = await deps.service.execute<{ id: string }>(sql`
    UPDATE waitlist_entry SET email_confirmed_at = coalesce(email_confirmed_at, ${at}::timestamptz), updated_at = ${at}::timestamptz
    WHERE confirm_token_hash = ${hashToken(raw)} AND confirm_expires_at > ${at}::timestamptz
    RETURNING id`);
  return rows.length > 0 ? { ok: true } : { expired: true };
}
