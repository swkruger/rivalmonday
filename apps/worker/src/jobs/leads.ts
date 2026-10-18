import type { Ai } from '@cs/ai';
import { type DataForSeoClient, mapsSearch, redactForModel } from '@cs/collectors';
import { agencyServiceable, type Db, type EnvName, intakeRate, lead, type LeadPreview } from '@cs/db';
import { buildSnapshot, LEAD_SUMMARY_SYSTEM, type LeadEmailDeps, leadSummaryJsonSchema, sendLeadEmail, snapshotFacts, validateSummary } from '@cs/tools';
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

// Phase 11c Task 29 (spec ยง4): builds the free competitive preview for a verified lead, then sends the lead emails.
// Platform cost: Maps and AI calls ledger with agency_id NULL (ruling A) so a public visitor cannot spend an agency's caps.

export type LeadPreviewOutcome = { status: 'ready' | 'failed' } | { skipped: string };

export interface LeadJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST make no paid calls (ruling D: no fixture exception). */
  envName: EnvName;
}

const SCOPE = { agencyId: null, clientId: null } as const;

/** Writes `preview` only while it is still `pending`, so a repeated or concurrent run cannot overwrite a result. */
async function writePreview(db: Db, leadId: string, preview: LeadPreview): Promise<void> {
  await db.update(lead).set({ preview }).where(and(eq(lead.id, leadId), sql`${lead.preview}->>'status' = 'pending'`));
}

/** Marks a still-pending preview failed (the page and email fall back to "we couldn't build your snapshot"). Never throws. */
export async function failPendingPreview(db: Db, leadId: string, reason: string): Promise<void> {
  console.error(`[lead-preview] ${leadId} failed: ${reason}`);
  try {
    await writePreview(db, leadId, { status: 'failed' });
  } catch (err) {
    console.error(`[lead-preview] ${leadId} could not record failure: ${err instanceof Error ? err.name : 'unknown'}`);
  }
}

/** Confirmation to the lead, then the agency notice (agency leads) or the platform pool notice. Guards live in `sendLeadEmail`; never throws. */
async function sendNotices(email: LeadEmailDeps | null, leadId: string, agencyId: string | null): Promise<void> {
  if (!email) {
    console.error(`[lead-preview] ${leadId} emails not configured`);
    return;
  }
  for (const kind of ['confirmation', agencyId ? 'agency_new' : 'pool_new'] as const) {
    try {
      await sendLeadEmail(email, leadId, kind);
    } catch (err) {
      console.error(`[lead-preview] ${leadId} ${kind} email failed: ${err instanceof Error ? err.name : 'unknown'}`);
    }
  }
}

/**
 * Never leaves a run it started in `pending`: every failure path writes `failed`, logs the reason and still sends the confirmation
 * (with fallback copy). A model failure or a rejected summary leaves a `ready` preview with `summary: null`.
 */
export async function runLeadPreview(
  d: { db: Db; clients: () => Promise<{ dfs: DataForSeoClient; ai: Ai }>; email: LeadEmailDeps | null },
  leadId: string,
): Promise<LeadPreviewOutcome> {
  const [row] = await d.db
    .select()
    .from(lead)
    .where(and(eq(lead.id, leadId), agencyServiceable(lead.agencyId))) // pool leads (agency null) are unaffected
    .limit(1);
  if (!row) return { skipped: 'lead not found or agency not serviceable' };
  if (row.status !== 'verified') return { skipped: `lead ${row.status}` };
  if (row.preview.status === 'ready') return { skipped: `preview ${row.preview.status}` };

  await d.db.update(lead).set({ preview: { status: 'pending' }, updatedAt: new Date() }).where(eq(lead.id, leadId));
  let outcome: 'ready' | 'failed' = 'failed';
  try {
    const { dfs, ai } = await d.clients(); // lazy: an unconfigured vendor takes the normal failure path
    const lookup = row.lookup;
    if (!lookup.category) throw new Error('no category');
    const { places } = await mapsSearch(dfs, { keyword: lookup.category, lat: lookup.lat, lng: lookup.lng, depth: 20 }, SCOPE);
    const snap = buildSnapshot(lookup, places);
    if (!snap) throw new Error('no usable nearby businesses');
    snap.facts = snapshotFacts(snap);
    try {
      const names = [snap.self.name, ...snap.nearby.map((b) => b.name)];
      const input = redactForModel(JSON.stringify({ self: snap.self, nearby: snap.nearby, category: snap.category }), { businessNames: names });
      const res = await ai.chat(
        'lead_preview_summary',
        { messages: [{ role: 'system', content: LEAD_SUMMARY_SYSTEM }, { role: 'user', content: input }], jsonSchema: leadSummaryJsonSchema },
        SCOPE,
      );
      const parsed = z.object({ summary: z.string() }).safeParse(JSON.parse(res.text));
      snap.summary = parsed.success ? validateSummary(parsed.data.summary, snap) : null;
    } catch (err) {
      console.error(`[lead-preview] ${leadId} summary failed: ${err instanceof Error ? err.name : 'unknown'}`);
      snap.summary = null;
    }
    await writePreview(d.db, leadId, snap);
    outcome = 'ready';
    console.log(`[lead-preview] ${leadId} ready: ${snap.nearby.length} nearby, summary ${snap.summary ? 'kept' : 'dropped'}`);
  } catch (err) {
    await failPendingPreview(d.db, leadId, err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error');
  }
  await sendNotices(d.email, leadId, row.agencyId);
  return { status: outcome };
}

const DAY = 86_400_000;
const RETENTION_DAYS = 90;
const RETRY_DAYS = 7;
const PENDING_STALE_MS = 15 * 60_000;
const RETRY_LIMIT = 200;

export type LeadsCleanupResult = {
  expired: number;
  deleted: number;
  scrubbed: number;
  ratePurged: number;
  staleFailed: number;
  retried: { confirmation: number; agency_new: number; pool_new: number };
};

/**
 * Phase 11c spec ง7 + rulings C: daily retention and R1 retry. Unverified leads past `verify_expires_at` expire; declined/expired
 * leads are deleted after 90 days (measured from the decision, else the last update); accepted leads lose `message` and `phone`
 * after 90 days; `intake_rate` rows older than 2 days go. Previews stuck `pending` for 15 minutes become `failed`. Then the
 * guarded confirmation / agency-new / pool-new sends are retried for leads updated in the last 7 days (declined mail never is).
 */
export async function runLeadsCleanup(d: { db: Db; email: LeadEmailDeps | null; now?: Date }): Promise<LeadsCleanupResult> {
  const now = d.now ?? new Date();
  const { db } = d;
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const retention = ago(RETENTION_DAYS * DAY);

  // Each step is isolated: one failing statement must not starve the later steps (notably the stale sweep and the retries).
  const failed: string[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      failed.push(name);
      console.error(`[leads-cleanup] step ${name} failed: ${err instanceof Error ? err.name : 'unknown'}`);
      return empty;
    }
  };
  const olderThanRetention = sql`coalesce(${lead.decidedAt}, ${lead.updatedAt}) < ${retention.toISOString()}::timestamptz`;
  const stale = ago(PENDING_STALE_MS);

  const expired = await step('expire', () => db.update(lead).set({ status: 'expired', updatedAt: now })
    .where(and(eq(lead.status, 'unverified'), lt(lead.verifyExpiresAt, now))).returning({ id: lead.id }), []);
  const deleted = await step('delete', () => db.delete(lead)
    .where(and(inArray(lead.status, ['declined', 'expired']), olderThanRetention)).returning({ id: lead.id }), []);
  const scrubbed = await step('scrub', () => db.update(lead).set({ message: null, phone: null })
    .where(and(eq(lead.status, 'accepted'), olderThanRetention, or(isNotNull(lead.message), isNotNull(lead.phone)))).returning({ id: lead.id }), []);
  const ratePurged = await step('rate', () => db.delete(intakeRate).where(lt(intakeRate.windowStart, ago(2 * DAY))).returning({ key: intakeRate.key }), []);
  // A preview stuck `pending`, or never started (`none` on a verified lead: the enqueue was lost), becomes `failed` so the confirmation goes out.
  const staleFailed = await step('stale', () => db.update(lead).set({ preview: { status: 'failed' } })
    .where(and(lt(lead.updatedAt, stale), or(sql`${lead.preview}->>'status' = 'pending'`, and(eq(lead.status, 'verified'), sql`${lead.preview}->>'status' = 'none'`))))
    .returning({ id: lead.id }), []);

  const retried = { confirmation: 0, agency_new: 0, pool_new: 0 };
  const recent = sql`${lead.updatedAt} >= ${ago(RETRY_DAYS * DAY).toISOString()}::timestamptz`;
  const previewDone = sql`${lead.preview}->>'status' in ('ready', 'failed')`;
  const guardCol = { confirmation: lead.confirmationSentAt, agency_new: lead.agencyNotifiedAt, pool_new: lead.poolNotifiedAt } as const;
  if (!d.email) {
    console.error('[leads-cleanup] emails not configured; retry skipped');
  } else {
    const email = d.email;
    const retry = (kind: keyof typeof retried, where: ReturnType<typeof and>) => step(`retry_${kind}`, async () => {
      const rows = await db.select({ id: lead.id }).from(lead).where(and(eq(lead.status, 'verified'), recent, where)).orderBy(lead.createdAt).limit(RETRY_LIMIT);
      for (const r of rows) {
        try {
          await sendLeadEmail(email, r.id, kind);
          // sendLeadEmail returns void and clears its guard when nothing went out: a set guard means a send happened.
          const [after] = await db.select({ g: guardCol[kind] }).from(lead).where(eq(lead.id, r.id));
          if (after?.g) retried[kind]++;
        } catch (err) {
          console.error(`[leads-cleanup] ${r.id} ${kind} retry failed: ${err instanceof Error ? err.name : 'unknown'}`);
        }
      }
    }, undefined);
    await retry('confirmation', and(isNull(lead.confirmationSentAt), previewDone));
    await retry('agency_new', and(isNotNull(lead.agencyId), isNull(lead.agencyNotifiedAt), or(isNotNull(lead.assignedAt), previewDone), agencyServiceable(lead.agencyId)));
    await retry('pool_new', and(isNull(lead.agencyId), isNull(lead.poolNotifiedAt), previewDone));
  }
  const result = { expired: expired.length, deleted: deleted.length, scrubbed: scrubbed.length, ratePurged: ratePurged.length, staleFailed: staleFailed.length, retried };
  console.log(`[leads-cleanup] ${JSON.stringify(result)}`);
  if (failed.length > 0) throw new Error(`leads-cleanup steps failed: ${failed.join(', ')}`);
  return result;
}

/** Phase 11c: `lead-preview`, enqueued by `verifyIntake` (singleton by lead id). */
export function createLeadJobs(deps: WorkerDeps, opts: LeadJobOptions) {
  const preview = defineJob({
    name: 'lead-preview',
    schema: z.object({ leadId: z.uuid() }),
    // retryLimit 0: a failure is recorded as `failed`; the lead still gets the confirmation with fallback copy.
    queue: { policy: 'short', retryLimit: 0 },
    handler: async ({ leadId }) => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        console.log(`[lead-preview] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      return deps.generateLeadPreview(leadId);
    },
  });
  const cleanup = defineJob({
    name: 'leads-cleanup',
    schema: z.looseObject({}),
    cron: '30 3 * * *',
    queue: { expireInSeconds: 3600 },
    handler: async () => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        console.log(`[leads-cleanup] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      return runLeadsCleanup({ db: deps.serviceDb(), email: deps.leadEmailDeps() });
    },
  });
  return { preview, cleanup };
}
