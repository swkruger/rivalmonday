import { ad, client, clientCompetitor, competitor, type Db, observation, prospectReport, rankSnapshot } from '@cs/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { ensureSelfCompetitor } from '../local/self';
import { buildProspectReport, type RankPoint, type ReportInputBusiness } from './report';

export const PROSPECT_GRID = 3;
export const PROSPECT_KEYWORDS = 3;
/** A `running` report older than this is shown as failed ("timed out") and may be re-run. */
export const PROSPECT_STALE_HOURS = 3;

export type SnapshotSource = 'gbp' | 'ads_google' | 'ads_meta';
export interface ProspectSnapshotDeps {
  db: Db;
  runSource(competitorId: string, source: SnapshotSource): Promise<{ status: string }>;
  scanRankings(clientId: string, opts: { gridSize: number; maxKeywords: number }): Promise<{ snapshots: number; failed: number; scanId: string | null }>;
  now?: () => Date;
}

const LABEL: Record<SnapshotSource, string> = { gbp: 'Google profile', ads_google: 'Google ads', ads_meta: 'Meta ads' };

/** Marks a still-running report failed; a report that already finished is left alone. */
export async function failProspectReport(db: Db, reportId: string, message: string, now = new Date()): Promise<void> {
  await db.update(prospectReport).set({ status: 'failed', error: message.slice(0, 500), finishedAt: now }).where(and(eq(prospectReport.id, reportId), eq(prospectReport.status, 'running')));
}

/**
 * 5b-2 decision 10: one GBP + ads pull per business and a 3×3 rank scan, then a deterministic report.
 * Vendor APIs only — never crawls a website or enqueues page discovery. Never throws.
 */
export async function runProspectSnapshot(deps: ProspectSnapshotDeps, clientId: string, reportId: string): Promise<{ status: 'ready' | 'failed' }> {
  const now = deps.now ?? (() => new Date());
  try {
    const [c] = await deps.db.select().from(client).where(eq(client.id, clientId));
    if (!c || c.status !== 'prospect') throw new Error('This business is no longer a prospect');
    const notes: string[] = [];
    const run = async (b: { id: string; name: string }, source: SnapshotSource): Promise<string> => {
      try {
        const { status } = await deps.runSource(b.id, source);
        if (status === 'vendor_error') notes.push(`${b.name}: ${LABEL[source]} unavailable from the data provider`);
        return status;
      } catch (err) {
        notes.push(`${b.name}: ${LABEL[source]} failed (${err instanceof Error ? err.message.slice(0, 120) : 'error'})`);
        return 'error';
      }
    };

    const businesses: Omit<ReportInputBusiness, 'gbp'>[] = [];
    if (c.placeId) {
      const linked = await ensureSelfCompetitor(deps.db, clientId);
      if ('competitorId' in linked) {
        await run({ id: linked.competitorId, name: c.name }, 'gbp');
        businesses.push({ competitorId: linked.competitorId, name: c.name, self: true, placeId: c.placeId, cid: null, ads: { google: null, meta: null } });
      }
    }
    const tracked = await deps.db
      .select({ id: competitor.id, name: competitor.name, placeId: competitor.placeId, cid: competitor.cid })
      .from(clientCompetitor)
      .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
      .where(eq(clientCompetitor.clientId, clientId))
      .orderBy(competitor.name);
    const activeAds = async (competitorId: string, platform: 'google' | 'meta') =>
      (await deps.db.select({ n: count() }).from(ad).where(and(eq(ad.competitorId, competitorId), eq(ad.platform, platform), eq(ad.isActive, true))))[0]?.n ?? 0;
    for (const t of tracked) {
      await run(t, 'gbp');
      const google = await run(t, 'ads_google');
      const meta = await run(t, 'ads_meta');
      // null = not checked (skipped for lack of a domain / Meta page, or failed); a count only after an ok pull.
      businesses.push({
        competitorId: t.id, name: t.name, self: false, placeId: t.placeId, cid: t.cid,
        ads: { google: google === 'ok' ? await activeAds(t.id, 'google') : null, meta: meta === 'ok' ? await activeAds(t.id, 'meta') : null },
      });
    }

    const scan = await deps.scanRankings(clientId, { gridSize: PROSPECT_GRID, maxKeywords: PROSPECT_KEYWORDS });
    if (scan.failed > 0) notes.push(`${scan.failed} of ${scan.snapshots + scan.failed} map searches failed`);
    const rankPoints: RankPoint[] = scan.scanId
      ? await deps.db.select({ keyword: rankSnapshot.keyword, results: rankSnapshot.results }).from(rankSnapshot).where(eq(rankSnapshot.scanId, scan.scanId))
      : [];

    const ids = businesses.map((b) => b.competitorId);
    const profiles = ids.length
      ? await deps.db
          .select({ competitorId: observation.competitorId, data: observation.data })
          .from(observation)
          .where(and(inArray(observation.competitorId, ids), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
          .orderBy(desc(observation.observedAt))
      : [];
    const latest = new Map<string, Record<string, unknown>>();
    for (const p of profiles) if (!latest.has(p.competitorId)) latest.set(p.competitorId, p.data);

    const data = buildProspectReport({
      generatedAt: now(), keywords: c.keywords.slice(0, PROSPECT_KEYWORDS), points: PROSPECT_GRID * PROSPECT_GRID, scanId: scan.scanId,
      businesses: businesses.map((b) => ({ ...b, gbp: latest.get(b.competitorId) ?? null })), rankPoints, notes,
    });
    const done = await deps.db
      .update(prospectReport)
      .set({ status: 'ready', data, finishedAt: now() })
      .where(and(eq(prospectReport.id, reportId), eq(prospectReport.status, 'running')))
      .returning({ id: prospectReport.id });
    return { status: done.length ? 'ready' : 'failed' };
  } catch (err) {
    await failProspectReport(deps.db, reportId, err instanceof Error ? err.message : String(err), now());
    return { status: 'failed' };
  }
}
