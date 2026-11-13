import { GBP_EVENTS_URL, GBP_POSTS_URL } from '@cs/collectors';
import { capture, type ChangeDetails, type Db, detectedChange } from '@cs/db';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { supersedePriorChanges } from '../events/retract';
import { runStage, type StageOutcome } from '../stage';
import { diffAds } from './ads';
import { diffGbp } from './gbp';
import { diffGbpPosts } from './gbp-posts';
import { diffJobs } from './jobs';
import { diffAudience } from './meta-page';
import { diffReviews } from './reviews';

export const VENDOR_DIFF_STAGE = 'vendor_diff';
export const VENDOR_DIFF_VERSION = 1;
/**
 * Collectors record the capture row first and write ads/reviews/jobs/GBP rows afterwards, so a vendor
 * capture is diffed only once it is this old — an immediate diff would see nothing and mark it done.
 */
export const VENDOR_SETTLE_MINUTES = 10;

export interface StructuredChange {
  kind: 'added' | 'removed' | 'modified';
  blockKey: string;
  beforeText: string | null;
  afterText: string | null;
  details: ChangeDetails;
  /** Overrides the previous capture as `detected_change.before_capture_id` (the capture the change really starts from). */
  beforeCaptureId?: string;
}

export type CaptureRow = typeof capture.$inferSelect;
export interface DifferResult { changes: StructuredChange[]; implausible: number; held: number }
/** How many earlier ok captures a differ may see (`prev` plus up to two `older`). */
export const VENDOR_DIFF_LOOKBACK = 3;
/** Compares a vendor capture with the previous ok capture of the same competitor, source and url; `older` is newest first. Never calls a model. */
export type SourceDiffer = (db: Db, cap: CaptureRow, prev: CaptureRow, older: CaptureRow[]) => Promise<StructuredChange[] | DifferResult>;

/** Meta captures: ad changes plus page-likes growth. */
const diffMeta: SourceDiffer = async (db, cap, prev, older) => {
  const ads = await diffAds(db, cap, prev, older);
  const audience = await diffAudience(db, cap, prev, older);
  const a: DifferResult = Array.isArray(ads) ? { changes: ads, implausible: 0, held: 0 } : ads;
  const b: DifferResult = Array.isArray(audience) ? { changes: audience, implausible: 0, held: 0 } : audience;
  return { changes: [...a.changes, ...b.changes], implausible: a.implausible + b.implausible, held: a.held + b.held };
};

/** Google Business Profile captures: the posts capture (url `gbp:posts`) has its own differ; the venue-panel capture (`gbp:events`) is read by the listed-events stage only (18d D3). */
const diffGbpCapture: SourceDiffer = async (db, cap, prev, older) => {
  if (cap.url === GBP_EVENTS_URL) return [];
  return cap.url === GBP_POSTS_URL ? diffGbpPosts(db, cap, prev, older) : diffGbp(db, cap, prev, older);
};

/** Capture sources with a structured differ. Only these are swept, so a source without one is never marked done. */
const DIFFERS: Record<string, SourceDiffer> = {
  google_ads: diffAds,
  meta_ads: diffMeta,
  google_business_profile: diffGbpCapture,
  google_jobs: diffJobs,
  google_reviews: diffReviews,
};

export const vendorDiffSources = (): string[] => Object.keys(DIFFERS);

/** Up to `limit` earlier ok captures of the same competitor, source and url (Meta captures are per page), newest first. */
export async function previousVendorCaptures(db: Db, cap: CaptureRow, limit: number): Promise<CaptureRow[]> {
  return db
    .select()
    .from(capture)
    .where(
      and(
        eq(capture.competitorId, cap.competitorId), eq(capture.source, cap.source), eq(capture.status, 'ok'),
        cap.url === null ? isNull(capture.url) : eq(capture.url, cap.url), lt(capture.capturedAt, cap.capturedAt),
      ),
    )
    .orderBy(desc(capture.capturedAt))
    .limit(limit);
}

/** The latest earlier ok capture of the same competitor, source and url. */
export async function previousVendorCapture(db: Db, cap: CaptureRow): Promise<CaptureRow | null> {
  return (await previousVendorCaptures(db, cap, 1))[0] ?? null;
}

/** Spec §6.1 structured sources: set differences between two vendor captures → detected changes. The first capture is a silent baseline. */
export async function diffVendorCapture(
  deps: { db: Db },
  captureId: string,
  opts: { now?: Date } = {},
): Promise<StageOutcome<{ baseline: boolean; changeIds: string[]; implausible: number; held: number }>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  const differ = cap ? DIFFERS[cap.source] : undefined;
  if (!cap || cap.status !== 'ok' || !differ) throw new Error(`capture ${captureId} is not an ok vendor capture with a structured differ`);
  const now = opts.now ?? new Date();
  if (now.getTime() - cap.capturedAt.getTime() < VENDOR_SETTLE_MINUTES * 60_000) return { ran: false };
  return runStage(
    deps.db,
    { stage: VENDOR_DIFF_STAGE, version: VENDOR_DIFF_VERSION, subjectId: captureId },
    async () => {
      const [prev, ...older] = await previousVendorCaptures(deps.db, cap, VENDOR_DIFF_LOOKBACK);
      const res = prev ? await differ(deps.db, cap, prev, older) : [];
      const { changes, implausible, held } = Array.isArray(res) ? { changes: res, implausible: 0, held: 0 } : res;
      return { prev: prev ?? null, changes, implausible, held };
    },
    async (tx, { prev, changes, implausible, held }) => {
      await supersedePriorChanges(tx, { afterCaptureId: cap.id, source: cap.source }, VENDOR_DIFF_VERSION);
      if (!prev || changes.length === 0) return { baseline: prev === null, changeIds: [] as string[], implausible, held };
      const rows = await tx
        .insert(detectedChange)
        .values(
          changes.map((c) => ({
            competitorId: cap.competitorId, source: cap.source, kind: c.kind, beforeCaptureId: c.beforeCaptureId ?? prev.id, afterCaptureId: cap.id,
            blockKey: c.blockKey, beforeText: c.beforeText, afterText: c.afterText, details: c.details, stageVersion: VENDOR_DIFF_VERSION,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: detectedChange.id });
      return { baseline: false, changeIds: rows.map((r) => r.id), implausible, held };
    },
  );
}
