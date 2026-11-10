import { type ChangeDetails, citationAuditRun, citationListing, client, clientCompetitor, type Db, detectedChange } from '@cs/db';
import { citationCatalogue } from '@cs/verticals';
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import type { PackLoader } from '../tag/tag-stage';

export const CITATION_DIFF_STAGE = 'citation_diff';
export const CITATION_DIFF_VERSION = 1;

/**
 * 18c C7: one global `citation_added` change per tracked rival newly found on a catalogue directory by this audit run.
 * The audit's upsert sets `newly_found_at` only on not_found -> listed, so a first audit is a silent baseline and a rival
 * reused by a later run of another client (older `newly_found_at`) makes no second change. Retry-safe via `runStage`.
 */
export async function diffCitations(deps: { db: Db; packs: PackLoader }, runId: string): Promise<StageOutcome<{ changeIds: string[] }>> {
  const { db } = deps;
  return runStage(
    db,
    { stage: CITATION_DIFF_STAGE, version: CITATION_DIFF_VERSION, subjectId: runId },
    async () => {
      const [run] = await db.select().from(citationAuditRun).where(eq(citationAuditRun.id, runId));
      if (!run) throw new Error(`citation_diff: audit run ${runId} not found`);
      if (run.status !== 'done' && run.status !== 'capped') throw new Error(`citation_diff: audit run ${runId} is ${run.status}, not done|capped`);
      const [cl] = await db.select({ verticalId: client.verticalId, selfCompetitorId: client.selfCompetitorId }).from(client).where(eq(client.id, run.clientId));
      if (!cl) throw new Error(`citation_diff: client ${run.clientId} not found`);
      const catalogue = citationCatalogue(await deps.packs(cl.verticalId));
      const labels = new Map(catalogue.map((d) => [d.host, d.label]));
      if (labels.size === 0 || run.competitorIds.length === 0) return [];
      const rows = await db
        .select()
        .from(citationListing)
        .where(
          and(
            inArray(citationListing.competitorId, run.competitorIds),
            cl.selfCompetitorId ? sql`${citationListing.competitorId} <> ${cl.selfCompetitorId}` : undefined,
            inArray(citationListing.competitorId, db.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, run.clientId))),
            eq(citationListing.inCatalogue, true),
            eq(citationListing.status, 'listed'),
            inArray(citationListing.host, [...labels.keys()]),
            gte(citationListing.newlyFoundAt, run.startedAt),
            isNotNull(citationListing.captureId),
          ),
        )
        .orderBy(citationListing.competitorId, citationListing.host);
      return rows.map((l) => {
        const label = labels.get(l.host) ?? l.host;
        const details: ChangeDetails = { changeType: 'citation_added', directory: l.host, label, url: l.listingUrl };
        return {
          competitorId: l.competitorId, source: 'directories', kind: 'added', afterCaptureId: l.captureId!, blockKey: `citation:${l.host}`,
          beforeText: null, afterText: l.listingTitle ?? label, stageVersion: CITATION_DIFF_VERSION, agencyId: null, clientId: null, details,
        };
      });
    },
    async (tx, values) => {
      if (values.length === 0) return { changeIds: [] as string[] };
      const inserted = await tx.insert(detectedChange).values(values).onConflictDoNothing().returning({ id: detectedChange.id });
      return { changeIds: inserted.map((r) => r.id) };
    },
  );
}
