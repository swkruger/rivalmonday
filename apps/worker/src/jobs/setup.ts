import type { Ai } from '@cs/ai';
import { type DataForSeoClient, fetchGbpProfile, redactForModel } from '@cs/collectors';
import { agencyServiceable, client, clientSetup, type Db, type EnvName, review, type SetupSuggestions } from '@cs/db';
import { buildSuggestionSource, setupSuggestionsJsonSchema, validateSuggestions } from '@cs/tools';
import type { PackLoader } from '@cs/engine';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export type SetupSuggestionsOutcome = { status: 'ready' | 'failed' } | { skipped: string };

export interface SetupJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST make no paid calls. */
  envName: EnvName;
}

/** Writes `suggestions` only while it is still `pending` (a concurrent or repeated run cannot overwrite a result). */
async function writeSuggestions(db: Db, clientId: string, suggestions: SetupSuggestions): Promise<void> {
  await db
    .update(clientSetup)
    .set({ suggestions })
    .where(and(eq(clientSetup.clientId, clientId), sql`${clientSetup.suggestions}->>'status' = 'pending'`));
}

/** Marks a still-pending suggestion run failed (the wizard falls back to the pack's seed keywords). Never throws. */
export async function failPendingSuggestions(db: Db, clientId: string, reason: string): Promise<void> {
  console.error(`[setup-suggestions] ${clientId} failed: ${reason}`);
  try {
    await writeSuggestions(db, clientId, { status: 'failed' });
  } catch (err) {
    console.error(`[setup-suggestions] ${clientId} could not record failure: ${err instanceof Error ? err.name : 'unknown'}`);
  }
}

/**
 * Phase 11a Task 6: fills `client_setup.suggestions` from the client's Google Business Profile (and stored reviews, if any).
 * Never leaves a run it started in `pending`: every failure path writes `failed`, logs the reason and returns (no rethrow).
 */
export async function runSetupSuggestions(
  d: { db: Db; dfs: DataForSeoClient; ai: Ai; packs: PackLoader },
  clientId: string,
): Promise<SetupSuggestionsOutcome> {
  const [row] = await d.db
    .select({ c: client, setup: clientSetup })
    .from(client)
    .innerJoin(clientSetup, eq(clientSetup.clientId, client.id))
    .where(and(eq(client.id, clientId), agencyServiceable(client.agencyId)))
    .limit(1);
  if (!row) return { skipped: 'client, setup row or serviceable agency not found' };
  const { c, setup } = row;
  if (setup.suggestions.status !== 'pending') return { skipped: `suggestions ${setup.suggestions.status}` };
  if (c.status !== 'active' && c.status !== 'prospect') return { skipped: `client ${c.status}` };

  try {
    if (!c.placeId) throw new Error('client has no place id');
    const pack = await d.packs(c.verticalId);
    const scope = { agencyId: c.agencyId, clientId: c.id };
    const gbp = await fetchGbpProfile(d.dfs, { placeId: c.placeId }, scope);
    if (!gbp) throw new Error('no Google Business Profile found');
    const reviews = c.selfCompetitorId
      ? (await d.db
          .select({ text: review.text })
          .from(review)
          .where(and(eq(review.competitorId, c.selfCompetitorId), isNotNull(review.text)))
          .orderBy(desc(review.postedAt))
          .limit(10)).map((r) => r.text ?? '')
      : [];
    const source = buildSuggestionSource(gbp, reviews);
    const sourceText = redactForModel(source.text, { businessNames: [c.name] });
    const packServices = pack.services.map((s) => ({ id: s.id, name: s.name }));
    const system =
      'You suggest services and search keywords for a local business. Use only the text provided. For every item, copy a short exact quote from the text that supports it. ' +
      `Services must be ids from this list: ${packServices.map((s) => `${s.id} — ${s.name}`).join('; ')}. ` +
      "At most 5 keywords, the way customers search (e.g. 'emergency plumber').";
    const res = await d.ai.chat(
      'setup_suggestions',
      { messages: [{ role: 'system', content: system }, { role: 'user', content: sourceText }], jsonSchema: setupSuggestionsJsonSchema },
      scope,
    );
    let raw: unknown = null;
    try {
      raw = JSON.parse(res.text);
    } catch {
      raw = null;
    }
    const valid = validateSuggestions(raw, { packServices, sourceText, city: setup.lookup?.city ?? null });
    if (!valid) throw new Error('model answer failed validation');
    await writeSuggestions(d.db, clientId, { status: 'ready', ...valid, sources: source.sources, generatedAt: new Date().toISOString() });
    console.log(`[setup-suggestions] ${clientId} ready: ${valid.services.length} services, ${valid.keywords.length} keywords`);
    return { status: 'ready' };
  } catch (err) {
    await failPendingSuggestions(d.db, clientId, err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error');
    return { status: 'failed' };
  }
}

/** Phase 11a: `setup-suggestions` (enqueued by `create_client` with a business lookup). */
export function createSetupJobs(deps: WorkerDeps, opts: SetupJobOptions) {
  const suggestions = defineJob({
    name: 'setup-suggestions',
    schema: z.object({ clientId: z.uuid() }),
    // retryLimit 0: a failure is recorded as `failed` and the wizard falls back to the pack's seed keywords.
    queue: { policy: 'short', retryLimit: 0 },
    handler: async ({ clientId }) => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        console.log(`[setup-suggestions] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const out = await deps.generateSetupSuggestions(clientId);
      return out;
    },
  });
  return { suggestions };
}
