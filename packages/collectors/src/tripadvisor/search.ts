import { agencyServiceable, client, clientCompetitor, clientWorkAllowed, competitor, competitorSource, type Db, observation, vendorTask } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, asc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { cityFromAddress } from '../citations/match';
import { latestGbp } from '../citations/run';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { collectReadyTasks } from '../reviews/collect';
import type { PackLoader } from '../rivals/run';
import { type DataForSeoClient, type DfsTask, isDfsOk, pairPostedTasks } from '../vendors/dataforseo';
import { VendorError } from '../vendors/errors';
import { matchTripadvisor, parseTripadvisorItem, type TripadvisorItem } from './parse';

/** `vendor_task.kind`, `observation.kind` and `capture.source` of the Tripadvisor rating pull. */
export const TRIPADVISOR_KIND = 'tripadvisor';

const POST_PATH = '/business_data/tripadvisor/search/task_post';
const READY_PATH = '/business_data/tripadvisor/search/tasks_ready';
/** The task_post location (Task 0: `location_name` is accepted); the city is in the keyword and decides the match (`matchTripadvisor`). */
const LOCATION = { location_name: 'United States', language_code: 'en' } as const;

/**
 * P8: `tripadvisor` source rows exist (active) only for competitors an opted-in client (`clientWorkAllowed` and
 * `agencyServiceable`, pack `tripadvisor`) tracks or owns as its self business; every other row is deactivated.
 */
export async function syncTripadvisorSources(db: Db, packs: PackLoader): Promise<{ active: number; inactive: number }> {
  const clients = await db
    .select({ id: client.id, verticalId: client.verticalId, selfId: client.selfCompetitorId })
    .from(client)
    .where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId)));
  const optedVertical = new Map<string, boolean>();
  for (const v of new Set(clients.map((c) => c.verticalId))) optedVertical.set(v, (await packs(v)).tripadvisor === true);
  const opted = clients.filter((c) => optedVertical.get(c.verticalId));
  const wanted = new Set<string>();
  for (const c of opted) if (c.selfId) wanted.add(c.selfId);
  if (opted.length > 0) {
    const rows = await db.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(inArray(clientCompetitor.clientId, opted.map((c) => c.id)));
    for (const r of rows) wanted.add(r.id);
  }
  const ids = [...wanted];
  if (ids.length > 0) {
    await db.insert(competitorSource).values(ids.map((competitorId) => ({ competitorId, source: TRIPADVISOR_KIND })))
      .onConflictDoUpdate({ target: [competitorSource.competitorId, competitorSource.source], set: { active: true } });
  }
  await db.update(competitorSource).set({ active: false })
    .where(and(eq(competitorSource.source, TRIPADVISOR_KIND), ids.length > 0 ? notInArray(competitorSource.competitorId, ids) : undefined));
  const [counts] = await db.select({
    inactive: sql<number>`count(*) FILTER (WHERE NOT ${competitorSource.active})`.mapWith(Number),
  }).from(competitorSource).where(eq(competitorSource.source, TRIPADVISOR_KIND));
  return { active: ids.length, inactive: counts?.inactive ?? 0 };
}

/** City as the citation audit: a self business uses its client's address city, else the GBP address city; a rival the GBP address city, else a tracking client's city. */
async function cityOf(db: Db, competitorId: string): Promise<string | null> {
  const gbpCity = cityFromAddress((await latestGbp(db, competitorId)).address);
  const [own] = await db.select({ address: client.address }).from(client).where(eq(client.selfCompetitorId, competitorId)).orderBy(asc(client.id)).limit(1);
  if (own) return own.address?.city?.trim() || gbpCity;
  if (gbpCity) return gbpCity;
  const tracking = await db.select({ address: client.address }).from(clientCompetitor).innerJoin(client, eq(client.id, clientCompetitor.clientId))
    .where(and(eq(clientCompetitor.competitorId, competitorId), isNotNull(client.address))).orderBy(asc(client.id));
  return tracking.map((t) => t.address?.city?.trim()).find((c): c is string => !!c) ?? null;
}

export async function postTripadvisorTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  competitorIds: string[],
  chunkSize = 100,
): Promise<{ posted: number; postedIds: string[]; failedIds: string[] }> {
  const rows = competitorIds.length > 0 ? await deps.db.select({ id: competitor.id, name: competitor.name }).from(competitor).where(inArray(competitor.id, competitorIds)) : [];
  const eligible: { id: string; keyword: string }[] = [];
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const city = await cityOf(deps.db, r.id);
    eligible.push({ id: r.id, keyword: city ? `${name} ${city}` : name });
  }
  let posted = 0;
  const postedIds: string[] = [];
  const failedIds: string[] = [];
  for (let i = 0; i < eligible.length; i += chunkSize) {
    const batch = eligible.slice(i, i + chunkSize);
    let tasks: DfsTask[];
    try {
      tasks = await deps.dfs.post(POST_PATH, batch.map((c) => ({ keyword: c.keyword, ...LOCATION, tag: c.id })), { agencyId: null, clientId: null, competitorIds: batch.map((c) => c.id) });
    } catch (err) {
      if (!(err instanceof VendorError)) throw err;
      failedIds.push(...batch.map((c) => c.id));
      continue;
    }
    const vt = pairPostedTasks(tasks, batch)
      .filter(({ t }) => isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: TRIPADVISOR_KIND, externalTaskId: t.id, competitorId: c.id }));
    if (vt.length > 0) await deps.db.insert(vendorTask).values(vt).onConflictDoNothing();
    posted += vt.length;
    postedIds.push(...vt.map((r) => r.competitorId));
  }
  return { posted, postedIds, failedIds };
}

export async function collectReadyTripadvisor(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }): Promise<{ collected: number; failed: number; matched: number }> {
  let matched = 0;
  const r = await collectReadyTasks(deps, TRIPADVISOR_KIND, READY_PATH, (id) => `/business_data/tripadvisor/search/task_get/${id}`, async (task, vt) => {
    if (!vt.competitorId) throw new Error(`tripadvisor task ${vt.externalTaskId} has no competitor subject`);
    const [c] = await deps.db.select({ id: competitor.id, name: competitor.name, tripadvisorId: competitor.tripadvisorId }).from(competitor).where(eq(competitor.id, vt.competitorId)).limit(1);
    if (!c) return;
    const { captureId } = await recordVendorCapture(deps, { competitorId: c.id, source: TRIPADVISOR_KIND, collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok', payload: task.result });
    const items = ((task.result[0] as { items?: unknown[] } | undefined)?.items ?? []).map(parseTripadvisorItem).filter((i): i is TripadvisorItem => i !== null);
    let hit: TripadvisorItem | null;
    if (c.tripadvisorId) {
      hit = items.find((i) => i.id === c.tripadvisorId) ?? null; // stored id absent: no observation, the id is kept
    } else {
      hit = matchTripadvisor(items, { name: c.name, city: await cityOf(deps.db, c.id) });
      if (hit) await deps.db.update(competitor).set({ tripadvisorId: hit.id, tripadvisorUrl: hit.url }).where(eq(competitor.id, c.id));
    }
    if (!hit) return;
    await deps.db.insert(observation).values({ competitorId: c.id, captureId, kind: TRIPADVISOR_KIND, key: 'rating', data: { id: hit.id, url: hit.url, title: hit.title, rating: hit.rating, reviews: hit.reviews } }).onConflictDoNothing();
    matched++;
  });
  return { ...r, matched };
}
