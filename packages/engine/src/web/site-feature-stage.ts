import { SITE_FEATURE_REGISTRY, SITE_FEATURE_REGISTRY_VERSION, siteFeatures } from '@cs/collectors';
import { SITE_FEATURE_CATEGORY_LABEL } from '@cs/core';
import { capture, type ChangeDetails, clientCompetitor, type Db, detectedChange, evidence, observation, stageRun, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { runStage, type StageOutcome } from '../stage';

export const SITE_FEATURE_STAGE = 'site_features';
export const SITE_FEATURE_VERSION = 1;
/** At most one `site_feature` change per (competitor, tool) in this many days. */
export const SITE_FEATURE_COOLDOWN_DAYS = 28;
const DAY_MS = 86_400_000;
const OBSERVATION_KIND = 'site_features';

export interface SiteFeatureResult {
  /** Tools in the confirmed set written to the observation. */
  observed: number;
  changes: string[];
  skipped?: string;
}

interface SiteFeatureObservation {
  features: string[];
  registry: number;
}

const REGISTRY = new Map(SITE_FEATURE_REGISTRY.map((s) => [s.id, s]));

const readObservation = (data: Record<string, unknown> | undefined): SiteFeatureObservation | null => {
  if (!data) return null;
  const features = Array.isArray(data.features) ? data.features.filter((f): f is string => typeof f === 'string') : [];
  return { features, registry: typeof data.registry === 'number' ? data.registry : 0 };
};

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
};

async function featuresOf(deps: { db: Db; store: ObjectStore }, captureId: string): Promise<Set<string>> {
  const [ev] = await deps.db.select({ objectKey: evidence.objectKey }).from(evidence).where(and(eq(evidence.captureId, captureId), eq(evidence.kind, 'html'))).limit(1);
  if (!ev) throw new Error(`capture ${captureId} has no html evidence`);
  const gz = await deps.store.get(ev.objectKey);
  if (!gz) throw new Error(`evidence object ${ev.objectKey} is missing from the store`);
  return new Set(siteFeatures(new TextDecoder().decode(gunzipSync(gz))).map((f) => f.id));
}

/**
 * Spec D4: the website tools of one ok web capture N, confirmed by its successor S (the page's next `ok` or
 * `unchanged` capture). A tool the two disagree on keeps the page's previous state, so a one-off load failure never
 * emits. Writes one `site_features` observation per capture and, against the previous observation, one
 * `site_feature` change per tool added to / removed from the competitor's site (no other active page has it, no
 * change for the tool in 28 days). The change text names the category and path only; the vendor stays in
 * `details.vendor` (ruling J1). Rules only, no model calls.
 */
export async function detectSiteFeatures(deps: { db: Db; store: ObjectStore }, captureId: string): Promise<StageOutcome<SiteFeatureResult>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!cap || cap.source !== 'web' || cap.status !== 'ok' || !cap.trackedPageId) throw new Error(`capture ${captureId} is not an ok web page capture`);
  const pageId = cap.trackedPageId;
  const [succ] = await deps.db
    .select({ id: capture.id, status: capture.status })
    .from(capture)
    .where(and(eq(capture.trackedPageId, pageId), eq(capture.source, 'web'), inArray(capture.status, ['ok', 'unchanged']), gt(capture.capturedAt, cap.capturedAt)))
    .orderBy(asc(capture.capturedAt))
    .limit(1);
  // Never claim the run without a successor: a done run would never be confirmed later.
  if (!succ) throw new Error(`capture ${captureId} has no later capture to confirm it yet`);

  return runStage(
    deps.db,
    { stage: SITE_FEATURE_STAGE, version: SITE_FEATURE_VERSION, subjectId: captureId },
    async () => {
      const none = { observation: null as SiteFeatureObservation | null, changes: [] as (typeof detectedChange.$inferInsert)[], skipped: undefined as string | undefined };
      const [tracked] = await deps.db.select({ id: clientCompetitor.clientId }).from(clientCompetitor).where(eq(clientCompetitor.competitorId, cap.competitorId)).limit(1);
      // Self businesses are never in client_competitor, so their sites are never read (§6.5).
      if (!tracked) return { ...none, skipped: 'no client tracks this competitor' };
      const [page] = await deps.db.select({ url: trackedPage.url }).from(trackedPage).where(eq(trackedPage.id, pageId)).limit(1);

      const featN = await featuresOf(deps, captureId);
      const featS = succ.status === 'unchanged' ? featN : await featuresOf(deps, succ.id);

      const [prevRow] = await deps.db
        .select({ data: observation.data, captureId: observation.captureId })
        .from(observation)
        .where(and(eq(observation.competitorId, cap.competitorId), eq(observation.kind, OBSERVATION_KIND), eq(observation.key, pageId), lt(observation.observedAt, cap.capturedAt), ne(observation.captureId, captureId)))
        .orderBy(desc(observation.observedAt))
        .limit(1);
      const prev = readObservation(prevRow?.data);
      const prevSet = new Set(prev?.features ?? []);

      // Step 2: present in both → present; absent in both → absent; disagreement → the previous state.
      const confirmed = [...new Set([...featN, ...featS])].filter((id) => (featN.has(id) && featS.has(id)) || prevSet.has(id)).sort();
      const obs: SiteFeatureObservation = { features: confirmed, registry: SITE_FEATURE_REGISTRY_VERSION };

      // Step 3: a later capture of this page already processed → observation only.
      const [later] = await deps.db
        .select({ id: capture.id })
        .from(capture)
        .innerJoin(stageRun, and(eq(stageRun.subjectId, capture.id), eq(stageRun.stage, SITE_FEATURE_STAGE), eq(stageRun.stageVersion, SITE_FEATURE_VERSION), eq(stageRun.status, 'done')))
        .where(and(eq(capture.trackedPageId, pageId), gt(capture.capturedAt, cap.capturedAt)))
        .limit(1);
      if (later) return { ...none, observation: obs, skipped: 'a later capture of this page was already processed' };
      // Step 4: no previous observation → baseline.
      if (!prev || !prevRow) return { ...none, observation: obs };

      // Registry entries newer than the previous observation are a baseline for that tool; unknown ids never emit.
      const known = (id: string) => {
        const sig = REGISTRY.get(id);
        return sig !== undefined && sig.since <= prev.registry;
      };
      const confirmedSet = new Set(confirmed);
      const added = confirmed.filter((id) => !prevSet.has(id) && known(id));
      const removed = [...prevSet].filter((id) => !confirmedSet.has(id) && known(id)).sort();
      if (added.length + removed.length === 0) return { ...none, observation: obs };

      // Step 5: page delta → competitor delta. Other active pages' latest observation at or before N.
      const others = (await deps.db.execute(sql`
        SELECT DISTINCT ON (o.key) o.data FROM observation o
        JOIN tracked_page tp ON tp.id::text = o.key AND tp.active
        WHERE o.competitor_id = ${cap.competitorId}::uuid AND o.kind = ${OBSERVATION_KIND} AND o.key <> ${pageId}
          AND o.observed_at <= ${cap.capturedAt.toISOString()}::timestamptz
        ORDER BY o.key, o.observed_at DESC`)) as unknown as { data: Record<string, unknown> }[];
      const elsewhere = new Set(others.flatMap((o) => readObservation(o.data)?.features ?? []));
      const candidates = [...added.map((id) => ({ id, direction: 'added' as const })), ...removed.map((id) => ({ id, direction: 'removed' as const }))].filter((c) => !elsewhere.has(c.id));
      if (candidates.length === 0) return { ...none, observation: obs };

      // Cooldown: no site_feature change for the same (competitor, tool) whose evidence is within 28 days of N.
      const since = new Date(cap.capturedAt.getTime() - SITE_FEATURE_COOLDOWN_DAYS * DAY_MS);
      const recent = (await deps.db.execute(sql`
        SELECT DISTINCT d.details->>'feature' AS feature FROM detected_change d JOIN capture c ON c.id = d.after_capture_id
        WHERE d.competitor_id = ${cap.competitorId}::uuid AND d.source = 'web' AND d.status <> 'superseded'
          AND d.details->>'changeType' = 'site_feature'
          AND d.details->>'feature' IN (${sql.join(candidates.map((c) => sql`${c.id}`), sql`, `)})
          AND c.captured_at > ${since.toISOString()}::timestamptz`)) as unknown as { feature: string }[];
      const cooling = new Set(recent.map((r) => r.feature));

      const url = page?.url ?? cap.url ?? '';
      const changes = candidates
        .filter((c) => !cooling.has(c.id))
        .map(({ id, direction }) => {
          const sig = REGISTRY.get(id)!;
          const text = `${SITE_FEATURE_CATEGORY_LABEL[sig.category]} (on ${pathOf(url)})`;
          const details: ChangeDetails = { changeType: 'site_feature', feature: id, category: sig.category, vendor: sig.vendor, direction, pageUrl: url };
          return {
            competitorId: cap.competitorId, trackedPageId: pageId, source: 'web', kind: direction, beforeCaptureId: prevRow.captureId, afterCaptureId: captureId,
            blockKey: `feature:${id}`, beforeText: direction === 'removed' ? text : null, afterText: direction === 'added' ? text : null,
            details, stageVersion: SITE_FEATURE_VERSION,
          } satisfies typeof detectedChange.$inferInsert;
        });
      return { ...none, observation: obs, changes };
    },
    async (tx, c) => {
      if (!c.observation) return { observed: 0, changes: [], skipped: c.skipped } satisfies SiteFeatureResult;
      await tx
        .insert(observation)
        .values({ competitorId: cap.competitorId, captureId, kind: OBSERVATION_KIND, key: pageId, data: { ...c.observation }, observedAt: cap.capturedAt })
        .onConflictDoUpdate({ target: [observation.captureId, observation.kind, observation.key], set: { data: { ...c.observation }, observedAt: cap.capturedAt } });
      const rows = c.changes.length > 0 ? await tx.insert(detectedChange).values(c.changes).onConflictDoNothing().returning({ id: detectedChange.id }) : [];
      const out: SiteFeatureResult = { observed: c.observation.features.length, changes: rows.map((r) => r.id) };
      if (c.skipped) out.skipped = c.skipped;
      return out;
    },
  );
}
