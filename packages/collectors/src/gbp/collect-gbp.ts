import { competitor, type Db, observation } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { type DataForSeoClient, DFS_US, isDfsOk } from '../vendors/dataforseo';
import { VendorError } from '../vendors/errors';

export const DFS_COLLECTOR_VERSION = 'dfs/1';

const gbpSchema = z.looseObject({
  title: z.string().nullish(),
  category: z.string().nullish(),
  additional_categories: z.array(z.string()).nullish(),
  rating: z.looseObject({ value: z.number().nullish(), votes_count: z.number().nullish() }).nullish(),
  phone: z.string().nullish(),
  url: z.string().nullish(),
  domain: z.string().nullish(),
  is_claimed: z.boolean().nullish(),
  current_status: z.string().nullish(),
  cid: z.string().nullish(),
  place_id: z.string().nullish(),
  work_time: z.unknown().optional(),
  services: z.unknown().optional(),
  attributes: z.unknown().optional(),
});

export function extractGbpProfile(item: unknown): Record<string, unknown> | null {
  const p = gbpSchema.safeParse(item);
  if (!p.success) return null;
  const i = p.data;
  return {
    title: i.title ?? null, category: i.category ?? null, additionalCategories: i.additional_categories ?? [],
    rating: i.rating?.value ?? null, votes: i.rating?.votes_count ?? null, phone: i.phone ?? null, url: i.url ?? null,
    domain: i.domain ?? null, isClaimed: i.is_claimed ?? null, currentStatus: i.current_status ?? null, cid: i.cid ?? null,
    placeId: i.place_id ?? null, workHours: i.work_time ?? null, services: i.services ?? null, attributes: i.attributes ?? null,
  };
}

/** True for a Postgres unique-violation (SQLSTATE 23505), including Drizzle 0.44's driver-error wrapper. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null | undefined;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export async function collectGbpProfile(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient },
  c: { id: string; placeId: string | null; cid: string | null },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; captureId?: string }> {
  const keyword = c.placeId ? `place_id:${c.placeId}` : c.cid ? `cid:${c.cid}` : null;
  if (!keyword) return { status: 'skipped' };
  const base = { competitorId: c.id, source: 'google_business_profile', collectorVersion: DFS_COLLECTOR_VERSION };
  let raw: unknown[];
  try {
    const [task] = await deps.dfs.post('/business_data/google/my_business_info/live', [{ keyword, ...DFS_US }], { agencyId: null, clientId: null });
    // DataForSEO can return HTTP 200 with an OK envelope while an individual task still failed
    // (e.g. place not found), or with no task at all — never record an empty 'ok' capture in either case.
    if (!task) {
      const r = await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: 'empty task' });
      return { status: 'vendor_error', captureId: r.captureId };
    }
    if (!isDfsOk(task.statusCode)) {
      const r = await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${task.statusCode} ${task.statusMessage}` });
      return { status: 'vendor_error', captureId: r.captureId };
    }
    raw = task.result ?? [];
  } catch (err) {
    if (!(err instanceof VendorError)) throw err;
    const r = await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${err.code ?? ''} ${err.message}`.trim() });
    return { status: 'vendor_error', captureId: r.captureId };
  }
  const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: raw });
  const profile = extractGbpProfile((raw[0] as { items?: unknown[] } | undefined)?.items?.[0]);
  if (profile) {
    await deps.db.insert(observation).values({ competitorId: c.id, captureId, kind: 'gbp_profile', key: 'profile', data: profile });
    if (!c.cid && typeof profile.cid === 'string') {
      try {
        await deps.db.update(competitor).set({ cid: profile.cid }).where(and(eq(competitor.id, c.id), isNull(competitor.cid)));
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // competitor.cid is unique: another competitor row already claims this cid. That means two
        // competitor rows describe the same business — flag for merge review in Phase 3 rather than fail.
        console.warn(`[gbp] competitor ${c.id} cid ${profile.cid} already claimed by another competitor; flagging for merge review`, err);
      }
    }
  }
  return { status: 'ok', captureId };
}
