import { competitor, type Db, gbpPost, observation, vendorTask } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { sha256Hex } from '../evidence/recorder';
import { collectReadyTasks } from '../reviews/collect';
import { type DataForSeoClient, type DfsTask, DFS_US, isDfsOk, pairPostedTasks } from '../vendors/dataforseo';
import { parseDfsTimestamp } from '../vendors/dfs-time';
import { VendorError } from '../vendors/errors';
import { DFS_COLLECTOR_VERSION } from './collect-gbp';

/** The capture url that marks a Google-posts capture (the profile capture of the same source has none). */
export const GBP_POSTS_URL = 'gbp:posts';

const POST_PATH = '/business_data/google/my_business_updates/task_post';
const READY_PATH = '/business_data/google/my_business_updates/tasks_ready';

export interface GbpPost {
  postId: string;
  text: string | null;
  url: string | null;
  buttonUrl: string | null;
  postedAt: string | null;
}

const postSchema = z.looseObject({
  post_text: z.string().nullish(),
  url: z.string().nullish(),
  timestamp: z.union([z.string(), z.number()]).nullish(),
  links: z.array(z.looseObject({ url: z.string().nullish() })).nullish(),
});

function lpsid(url: string): string | null {
  try {
    return new URL(url).searchParams.get('lpsid') || null;
  } catch {
    return null;
  }
}

/** Pure parsing of one google_business_post item; the vendor gives no id, so it is the `lpsid` of the post url (else a hash). */
export function parseGbpPost(raw: unknown): GbpPost | null {
  const p = postSchema.safeParse(raw);
  if (!p.success) return null;
  const text = p.data.post_text?.trim() ? p.data.post_text : null;
  const url = p.data.url?.trim() ? p.data.url : null;
  const seed = url ?? text;
  if (!seed) return null;
  const postId = (url ? lpsid(url) : null) ?? sha256Hex(seed).slice(0, 32);
  return { postId, text, url, buttonUrl: p.data.links?.[0]?.url || null, postedAt: parseDfsTimestamp(p.data.timestamp)?.toISOString() ?? null };
}

export async function postGbpPostTasks(
  deps: { db: Db; dfs: DataForSeoClient },
  competitors: { id: string; placeId: string | null; cid: string | null }[],
  chunkSize = 100,
): Promise<{ posted: number; postedIds: string[]; failedIds: string[] }> {
  const eligible = competitors.filter((c) => c.placeId || c.cid);
  let posted = 0;
  const postedIds: string[] = [];
  const failedIds: string[] = [];
  for (let i = 0; i < eligible.length; i += chunkSize) {
    const batch = eligible.slice(i, i + chunkSize);
    let tasks: DfsTask[];
    try {
      tasks = await deps.dfs.post(POST_PATH, batch.map((c) => ({ keyword: c.placeId ? `place_id:${c.placeId}` : `cid:${c.cid}`, ...DFS_US, depth: 20, tag: c.id })), { agencyId: null, clientId: null, competitorIds: batch.map((c) => c.id) });
    } catch (err) {
      if (!(err instanceof VendorError)) throw err;
      failedIds.push(...batch.map((c) => c.id));
      continue;
    }
    const rows = pairPostedTasks(tasks, batch)
      .filter(({ t }) => isDfsOk(t.statusCode))
      .map(({ t, c }) => ({ vendor: 'dataforseo', kind: 'google_posts', externalTaskId: t.id, competitorId: c.id }));
    if (rows.length > 0) await deps.db.insert(vendorTask).values(rows).onConflictDoNothing();
    posted += rows.length;
    postedIds.push(...rows.map((r) => r.competitorId));
  }
  return { posted, postedIds, failedIds };
}

export async function collectReadyGbpPosts(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient }): Promise<{ collected: number; failed: number; posts: number }> {
  let posts = 0;
  const r = await collectReadyTasks(deps, 'google_posts', READY_PATH, (id) => `/business_data/google/my_business_updates/task_get/${id}`, async (task, vt) => {
    if (!vt.competitorId) throw new Error(`google_posts task ${vt.externalTaskId} has a suggestion subject, which posts collection does not support`);
    const [c] = await deps.db.select({ id: competitor.id }).from(competitor).where(eq(competitor.id, vt.competitorId)).limit(1);
    if (!c) return;
    const { captureId, capturedAt } = await recordVendorCapture(deps, { competitorId: c.id, source: 'google_business_profile', url: GBP_POSTS_URL, collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok', payload: task.result });
    const items = (task.result[0] as { items?: unknown[] } | undefined)?.items ?? [];
    const byId = new Map<string, GbpPost>();
    for (const it of items) {
      const p = parseGbpPost(it);
      if (p) byId.set(p.postId, p);
    }
    const listed = [...byId.values()];
    if (listed.length === 0) return; // empty capture (40102 or no items): nothing listed, nothing ended
    await deps.db.insert(observation).values(listed.map(({ postId, ...data }) => ({ competitorId: c.id, captureId, kind: 'gbp_post', key: postId, data }))).onConflictDoNothing();
    await deps.db
      .insert(gbpPost)
      .values(listed.map((p) => ({
        competitorId: c.id, externalId: p.postId, text: p.text, url: p.url, buttonUrl: p.buttonUrl, postedAt: p.postedAt ? new Date(p.postedAt) : null,
        firstCaptureId: captureId, lastCaptureId: captureId, firstSeenAt: capturedAt, lastSeenAt: capturedAt,
      })))
      .onConflictDoUpdate({
        target: [gbpPost.competitorId, gbpPost.externalId],
        set: {
          text: sql`excluded.text`, url: sql`excluded.url`, buttonUrl: sql`excluded.button_url`, postedAt: sql`excluded.posted_at`,
          lastCaptureId: captureId, lastSeenAt: capturedAt, endedCaptureId: null, endedAt: null,
        },
      });
    await deps.db
      .update(gbpPost)
      .set({ endedCaptureId: captureId, endedAt: capturedAt })
      .where(and(eq(gbpPost.competitorId, c.id), isNull(gbpPost.endedAt), notInArray(gbpPost.externalId, listed.map((p) => p.postId))));
    posts += listed.length;
  });
  return { ...r, posts };
}
