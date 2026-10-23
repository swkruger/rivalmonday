import type { Ai } from '@cs/ai';
import { type DataForSeoClient, fetchGbpProfile, redactForModel } from '@cs/collectors';
import { isClientRole, type Role } from '@cs/core';
import { agencyServiceable, client, clientSetup, type Db, type EnvName, notification, review, type SetupSuggestions } from '@cs/db';
import { buildSuggestionSource, detectNewAreas, gbpServiceNames, getSetupState, queueCompetitorReview, setupSuggestionsJsonSchema, validateSuggestions } from '@cs/tools';
import { type DeliveryConfig, loadBranding, notify, type PackLoader } from '@cs/engine';
import { and, desc, eq, inArray, isNotNull, isNull, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

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
  workerLog.error(`[setup-suggestions] ${clientId} failed: ${reason}`);
  try {
    await writeSuggestions(db, clientId, { status: 'failed' });
  } catch (err) {
    workerLog.error(`[setup-suggestions] ${clientId} could not record failure: ${err instanceof Error ? err.name : 'unknown'}`);
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
    .where(and(eq(client.id, clientId), isNull(client.archivedAt), agencyServiceable(client.agencyId)))
    .limit(1);
  if (!row) return { skipped: 'client, setup row or serviceable agency not found' };
  const { c, setup } = row;
  if (setup.suggestions.status !== 'pending') return { skipped: `suggestions ${setup.suggestions.status}` };
  if (c.status !== 'active' && c.status !== 'prospect') return { skipped: `client ${c.status}` };
  if (c.pausedAt) return { skipped: 'client paused' }; // paused clients get no recurring or paid work

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
    const sourceText = redactForModel(source.text, { businessNames: [c.name, gbp.title] }); // staff may have renamed the client
    const packServices = pack.services.map((s) => ({ id: s.id, name: s.name }));
    const system =
      'You suggest services and search keywords for a local business. Use only the text provided. For every item, copy a short exact quote from the text that supports it. ' +
      `Services must be ids from this list: ${packServices.map((s) => `${s.id} — ${s.name}`).join('; ')}. ` +
      "At most 5 keywords, the way customers search (e.g. 'same-day repair').";
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
    // 14a: only for a real (non-generic) business type; deterministic, no extra AI call.
    const newAreas = pack.id === 'generic' ? [] : detectNewAreas(gbpServiceNames(gbp), pack.services, [c.name, ...(gbp.title ? [gbp.title] : [])]);
    await writeSuggestions(d.db, clientId, { status: 'ready', ...valid, newAreas, sources: source.sources, generatedAt: new Date().toISOString() });
    workerLog.info(`[setup-suggestions] ${clientId} ready: ${valid.services.length} services, ${valid.keywords.length} keywords`);
    return { status: 'ready' };
  } catch (err) {
    await failPendingSuggestions(d.db, clientId, err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error');
    return { status: 'failed' };
  }
}

const DAY_MS = 86_400_000;
type ReminderKind = 'setup_suggestions_ready' | 'setup_client_changed' | 'setup_idle';

/** Subjects are binding (spec §10). */
const subjectFor = (kind: ReminderKind, name: string) =>
  kind === 'setup_suggestions_ready' ? `Competitor suggestions are ready for ${name}` : kind === 'setup_client_changed' ? `${name} updated their setup` : `${name}'s setup is waiting on you`;

/** Draft copy (owner sign-off pending): calm, short, plain words. */
const linesFor = (kind: ReminderKind, name: string, idleDays?: number): string[] =>
  kind === 'setup_suggestions_ready'
    ? [`We found competitors that look like a fit for ${name}.`, 'Pick the ones to track so their first brief can start.']
    : kind === 'setup_client_changed'
      ? [`${name}'s owner made changes to their setup.`, 'Take a look and finish what is left.']
      : [`${name}'s setup has been waiting on you for ${idleDays ?? 3} days.`, 'A few quick choices are left before their first brief can start.'];

/**
 * Phase 11a Task 9: daily reminders to agency staff about open setups. At most one notice per kind per dedupe key (the outbox
 * dedupes), so re-runs are no-ops. Idle: 3 days, then 7 days only once the 3-day notice exists. Returns how many outbox rows were queued.
 */
export async function runSetupReminders(d: { db: Db; delivery: DeliveryConfig }, now: Date): Promise<{ queued: number }> {
  const rows = await d.db
    .select({ c: client, setup: clientSetup })
    .from(clientSetup)
    .innerJoin(client, eq(client.id, clientSetup.clientId))
    .where(
      and(
        isNull(clientSetup.completedAt),
        isNull(clientSetup.dismissedAt),
        inArray(client.status, ['active', 'prospect']),
        isNull(client.pausedAt),
        isNull(client.archivedAt), // 7a2 D16
        agencyServiceable(client.agencyId),
      ),
    );
  const today = now.toISOString().slice(0, 10);
  let queued = 0;
  for (const { c, setup } of rows) {
    try {
      const state = await getSetupState(d.db, c.id);
      if (!state.open) continue;
      const due: { kind: ReminderKind; dedupe: string; idleDays?: number }[] = [];
      if (state.steps.profile === 'done' && state.steps.search === 'done' && state.steps.competitors === 'todo' && state.pendingSuggestions) {
        due.push({ kind: 'setup_suggestions_ready', dedupe: `setup-ready:${c.id}` });
      }
      if (setup.lastChangedRole && isClientRole(setup.lastChangedRole as Role) && setup.lastChangedAt && now.getTime() - setup.lastChangedAt.getTime() <= DAY_MS) {
        due.push({ kind: 'setup_client_changed', dedupe: `setup-client:${c.id}:${today}` });
      }
      if (state.waitingOn === 'agency') {
        const age = now.getTime() - (setup.lastChangedAt ?? setup.createdAt).getTime();
        if (age >= 3 * DAY_MS) {
          const [three] = await d.db.select({ id: notification.id }).from(notification).where(like(notification.dedupeKey, `setup-idle:${c.id}:3:%`)).limit(1);
          const days = age >= 7 * DAY_MS && three ? 7 : 3;
          due.push({ kind: 'setup_idle', dedupe: `setup-idle:${c.id}:${days}`, idleDays: days });
        }
      }
      // Competitor-review email to the invited owner (client-facing, Cc the inviter): independent of the staff notices above.
      try {
        if (await queueCompetitorReview(d.db, d.delivery, { agencyId: c.agencyId, clientId: c.id, dedupe: `competitor-review:${c.id}`, now })) queued += 1;
      } catch (err) {
        workerLog.error(`[setup-reminders] ${c.id} competitor review failed: ${err instanceof Error ? err.name : 'unknown'}`); // staff notices below still go out
      }
      if (due.length === 0) continue;
      const branding = await loadBranding(d.db, c.agencyId);
      for (const { kind, dedupe, idleDays } of due) {
        const title = subjectFor(kind, c.name);
        const lines = linesFor(kind, c.name, idleDays);
        queued += await notify(d.db, d.delivery, {
          agencyId: c.agencyId, clientId: c.id, kind, audience: 'agency', subjectType: 'setup', subjectId: c.id, dedupe, link: { t: 'setup', id: c.id }, now,
          build: (r, link) => ({ title, body: lines.join('\n'), email: { template: 'agency_notice', props: { branding, recipientName: r?.name ?? null, clientName: c.name, notice: kind, title, lines, link, actionLabel: 'Open setup' } } }),
        });
      }
    } catch (err) {
      workerLog.error(`[setup-reminders] ${c.id} failed: ${err instanceof Error ? err.name : 'unknown'}`);
    }
  }
  return { queued };
}

/** Phase 11a: `setup-suggestions` (enqueued by `create_client` with a business lookup) and the daily `setup-reminders`. */
export function createSetupJobs(deps: WorkerDeps, opts: SetupJobOptions) {
  const suggestions = defineJob({
    name: 'setup-suggestions', usesAi: true,
    schema: z.object({ clientId: z.uuid() }),
    // retryLimit 0: a failure is recorded as `failed` and the wizard falls back to the pack's seed keywords.
    queue: { policy: 'short', retryLimit: 0 },
    handler: async ({ clientId }) => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        workerLog.info(`[setup-suggestions] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const out = await deps.generateSetupSuggestions(clientId);
      return out;
    },
  });
  const reminders = defineJob({
    name: 'setup-reminders',
    schema: z.looseObject({}),
    cron: '0 14 * * *',
    queue: { expireInSeconds: 3600 },
    handler: async () => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        workerLog.info(`[setup-reminders] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      if (!deps.deliveryConfigured()) return { skipped: 'delivery not configured' };
      return deps.setupReminders(new Date());
    },
  });
  return { suggestions, reminders };
}
