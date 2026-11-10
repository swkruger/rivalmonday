import { agencyServiceable, citationAuditRun, citationListing, client, clientCompetitor, clientWorkAllowed, competitor, competitorSignal, type Db, observation, type Tx } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { citationCatalogue, isBannedHost, type VerticalPack } from '@cs/verticals';
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { checkRankScanBudget } from '../rankings/budget';
import type { DataForSeoClient } from '../vendors/dataforseo';
import { auditBusiness, type CitationBudget, upsertCitationRows } from './audit';
import { type CitationBiz, cityFromAddress } from './match';
import { CITATION_CALL_USD, CITATION_RUN_CAP_USD } from './search';

export const CITATION_CADENCE_DAYS = 30;
export const CITATION_REUSE_DAYS = 25;
/** A `running` citation run older than this is presumed dead (the job's own expiry is 3 h): the daily sweep fails it. */
export const CITATION_RUN_STALE_HOURS = 3;
const DAY_MS = 86_400_000;
const AUDITED_RIVALS_MAX = 3;

/** Postgres unique violation on the one-running-run-per-client index (drizzle may wrap the driver error in `cause`). */
export function isLiveRunViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && typeof e === 'object' && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    const x = e as { code?: string; constraint_name?: string; constraint?: string };
    if (x.code === '23505' && (x.constraint_name ?? x.constraint) === 'citation_audit_run_one_live') return true;
  }
  return false;
}

/**
 * Clients due a listings audit: serviceable (active, not paused/archived, agency not read-only/suspended), competitors
 * step done (or no setup row), no running run, and no done/capped run within the cadence (failed-only runs are due again).
 */
export async function listCitationDueClients(db: Db, now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - CITATION_CADENCE_DAYS * DAY_MS).toISOString();
  const rows = await db
    .select({ id: client.id })
    .from(client)
    .where(sql`${clientWorkAllowed(client)} AND ${agencyServiceable(client.agencyId)}
      AND (NOT EXISTS (SELECT 1 FROM client_setup cs WHERE cs.client_id = ${client.id})
           OR EXISTS (SELECT 1 FROM client_setup cs WHERE cs.client_id = ${client.id} AND cs.competitors_done_at IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM citation_audit_run r WHERE r.client_id = ${client.id} AND r.status = 'running')
      AND NOT EXISTS (SELECT 1 FROM citation_audit_run r WHERE r.client_id = ${client.id} AND r.status IN ('done','capped') AND r.started_at > ${cutoff}::timestamptz)`)
    .orderBy(client.id);
  return rows.map((r) => r.id);
}

/** Self business plus up to 3 rivals: tier `top` by overlap, else the tracked rivals with the highest overlap (self excluded). */
export async function auditedCompetitors(db: Db | Tx, clientId: string): Promise<{ selfId: string | null; rivalIds: string[] }> {
  const [c] = await db.select({ selfId: client.selfCompetitorId }).from(client).where(eq(client.id, clientId));
  const selfId = c?.selfId ?? null;
  const pick = async (topOnly: boolean): Promise<string[]> => {
    const rows = await db
      .select({ id: clientCompetitor.competitorId })
      .from(clientCompetitor)
      .leftJoin(competitorSignal, and(eq(competitorSignal.clientId, clientCompetitor.clientId), eq(competitorSignal.competitorId, clientCompetitor.competitorId)))
      .where(and(
        eq(clientCompetitor.clientId, clientId),
        selfId ? ne(clientCompetitor.competitorId, selfId) : undefined,
        topOnly ? eq(competitorSignal.tier, 'top') : undefined,
      ))
      .orderBy(sql`${competitorSignal.overlap} DESC NULLS LAST`, clientCompetitor.competitorId)
      .limit(AUDITED_RIVALS_MAX);
    return rows.map((r) => r.id);
  };
  const top = await pick(true);
  return { selfId, rivalIds: top.length > 0 ? top : await pick(false) };
}

async function latestGbp(db: Db, competitorId: string): Promise<{ phone: string | null; address: string | null }> {
  const [obs] = await db.select({ data: observation.data }).from(observation)
    .where(and(eq(observation.competitorId, competitorId), eq(observation.kind, 'gbp_profile'))).orderBy(desc(observation.observedAt)).limit(1);
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  return { phone: str(obs?.data.phone), address: str(obs?.data.address) };
}

/** Reuse ($0): every catalogue host already has a checked row (not `not_checked`) newer than the reuse window. */
async function recentlyChecked(db: Db, competitorId: string, hosts: string[], now: Date): Promise<boolean> {
  if (hosts.length === 0) return true;
  const since = new Date(now.getTime() - CITATION_REUSE_DAYS * DAY_MS);
  const rows = await db.select({ host: citationListing.host }).from(citationListing).where(and(
    eq(citationListing.competitorId, competitorId), inArray(citationListing.host, hosts),
    ne(citationListing.status, 'not_checked'), gte(citationListing.checkedAt, since),
  ));
  return new Set(rows.map((r) => r.host)).size === hosts.length;
}

/**
 * One guarded run per client (self, then top rivals). `skipped` = work not allowed, empty catalogue, or a live run;
 * `capped` = over the monthly cost guard (0 calls) or the per-run cap; a non-vendor error (rethrown) or a run whose
 * every vendor call failed (returned) ends the run `failed`.
 */
export async function runCitationAudit(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; packs: (verticalId: string) => Promise<VerticalPack>; now?: () => Date },
  clientId: string,
  opts: { runId?: string } = {},
): Promise<{ runId: string | null; status: 'done' | 'capped' | 'failed' | 'skipped'; calls: number; usd: number }> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const skipped = { runId: null, status: 'skipped' as const, calls: 0, usd: 0 };
  // 18c-2: a manual run row inserted by `request_citation_audit` (status running) is adopted instead of inserting one; a skip frees it.
  const skip = async () => {
    if (opts.runId) await db.update(citationAuditRun).set({ status: 'failed', finishedAt: now }).where(and(eq(citationAuditRun.id, opts.runId), eq(citationAuditRun.status, 'running')));
    return skipped;
  };
  const [c] = await db.select().from(client).where(and(eq(client.id, clientId), clientWorkAllowed(client), agencyServiceable(client.agencyId)));
  if (!c) return skip();
  const catalogue = citationCatalogue(await deps.packs(c.verticalId));
  if (catalogue.length === 0) return skip();
  const hosts = catalogue.map((d) => d.host).filter((h) => !isBannedHost(h));
  const { selfId, rivalIds } = await auditedCompetitors(db, clientId);
  const ids = [...(selfId ? [selfId] : []), ...rivalIds];
  if (ids.length === 0) return skip();

  let runId: string;
  if (opts.runId) {
    // The job's own competitor list is authoritative (it may differ from the tool's snapshot).
    const [adopted] = await db.update(citationAuditRun).set({ competitorIds: ids })
      .where(and(eq(citationAuditRun.id, opts.runId), eq(citationAuditRun.clientId, clientId), eq(citationAuditRun.status, 'running'), eq(citationAuditRun.trigger, 'manual')))
      .returning({ id: citationAuditRun.id });
    if (!adopted) return skipped;
    runId = adopted.id;
  } else {
    const [prior] = await db.select({ id: citationAuditRun.id }).from(citationAuditRun)
      .where(and(eq(citationAuditRun.clientId, clientId), inArray(citationAuditRun.status, ['done', 'capped']))).limit(1);
    try {
      const [row] = await db.insert(citationAuditRun).values({
        agencyId: c.agencyId, clientId, trigger: prior ? 'monthly' : 'setup', status: 'running', competitorIds: ids, startedAt: now,
      }).returning({ id: citationAuditRun.id });
      runId = row!.id;
    } catch (err) {
      if (!isLiveRunViolation(err)) throw err;
      return skipped;
    }
  }
  const finish = (status: 'done' | 'capped' | 'failed', calls: number, usd: number) =>
    db.update(citationAuditRun).set({ status, calls, estUsd: usd.toFixed(4), finishedAt: now }).where(eq(citationAuditRun.id, runId));

  let calls = 0, okCalls = 0, usd = 0;
  try {
    const toSearch: string[] = [];
    for (const id of ids) if ((opts.runId && id === selfId) || !(await recentlyChecked(db, id, hosts, now))) toSearch.push(id); // manual: self is always re-searched
    if (toSearch.length > 0) {
      const budgetCheck = await checkRankScanBudget(db, clientId, toSearch.length * 2 * CITATION_CALL_USD, now);
      if (!budgetCheck.ok) {
        await finish('capped', 0, 0);
        return { runId, status: 'capped', calls: 0, usd: 0 };
      }
    }
    const clientCity = c.address?.city?.trim() || null;
    const budget: CitationBudget = { spentUsd: 0, capUsd: CITATION_RUN_CAP_USD };
    const scope = { agencyId: c.agencyId, clientId, verticalId: c.verticalId };
    let capped = false;
    for (const id of toSearch) {
      const isSelf = id === selfId;
      const [comp] = await db.select().from(competitor).where(eq(competitor.id, id));
      if (!comp) continue;
      const gbp = await latestGbp(db, id);
      const biz: CitationBiz & { competitorId: string } = {
        competitorId: id, name: comp.name, domain: comp.domain,
        phone: isSelf ? (gbp.phone ?? c.phone) : gbp.phone,
        city: isSelf ? (clientCity ?? cityFromAddress(gbp.address)) : (cityFromAddress(gbp.address) ?? clientCity),
      };
      const r = await auditBusiness({ db, store: deps.store, dfs: deps.dfs, now: deps.now }, biz, catalogue, budget, scope, { isSelf });
      calls += r.calls;
      okCalls += r.okCalls;
      usd += r.usd;
      if (r.rows.length > 0 || r.stage1Ok) await db.transaction((tx) => upsertCitationRows(tx, id, r.rows, now, { stage1Ok: r.stage1Ok, isSelf }));
      if (r.capped) { capped = true; break; }
    }
    // Every vendor call failed (an outage): `failed`, so readers keep the previous good run and the client is due again.
    const status = calls > 0 && okCalls === 0 ? 'failed' : capped ? 'capped' : 'done';
    await finish(status, calls, usd);
    return { runId, status, calls, usd };
  } catch (err) {
    console.warn(`[citation-audit] ${clientId}: run failed (${err instanceof Error ? err.message : String(err)})`);
    try {
      await finish('failed', calls, usd);
    } catch (finishErr) {
      console.warn(`[citation-audit] ${clientId}: could not mark run failed (${finishErr instanceof Error ? finishErr.message : String(finishErr)})`);
    }
    throw err; // reported to Sentry by runJob; the job is single-shot, so no paid retry
  }
}

/** Marks `running` runs older than CITATION_RUN_STALE_HOURS as failed (frees citation_audit_run_one_live); returns how many. */
export async function failStaleCitationRuns(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CITATION_RUN_STALE_HOURS * 3_600_000);
  const rows = await db.update(citationAuditRun).set({ status: 'failed', finishedAt: now })
    .where(and(eq(citationAuditRun.status, 'running'), sql`${citationAuditRun.startedAt} < ${cutoff.toISOString()}::timestamptz`))
    .returning({ id: citationAuditRun.id });
  return rows.length;
}

/** Marks one `running` run failed (frees `citation_audit_run_one_live`); a no-op for any other status. */
export async function failCitationRun(db: Db, runId: string, now: Date = new Date()): Promise<void> {
  await db.update(citationAuditRun).set({ status: 'failed', finishedAt: now }).where(and(eq(citationAuditRun.id, runId), eq(citationAuditRun.status, 'running')));
}
