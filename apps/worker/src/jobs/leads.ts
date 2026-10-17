import type { Ai } from '@cs/ai';
import { type DataForSeoClient, mapsSearch, redactForModel } from '@cs/collectors';
import { agencyServiceable, type Db, type EnvName, lead, type LeadPreview } from '@cs/db';
import { buildSnapshot, LEAD_SUMMARY_SYSTEM, type LeadEmailDeps, leadSummaryJsonSchema, sendLeadEmail, snapshotFacts, validateSummary } from '@cs/tools';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

// Phase 11c Task 29 (spec §4): builds the free competitive preview for a verified lead, then sends the lead emails.
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

  await d.db.update(lead).set({ preview: { status: 'pending' } }).where(eq(lead.id, leadId));
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
  return { preview };
}
