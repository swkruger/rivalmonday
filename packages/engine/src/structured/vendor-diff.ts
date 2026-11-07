import { capture, type ChangeDetails, type Db, detectedChange } from '@cs/db';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { supersedePriorChanges } from '../events/retract';
import { runStage, type StageOutcome } from '../stage';
import { diffAds } from './ads';
import { diffGbp } from './gbp';
import { diffJobs } from './jobs';
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

/** Capture sources with a structured differ. Only these are swept, so a source without one is never marked done. */
const DIFFERS: Record<string, SourceDiffer> = {
  google_ads: diffAds,
  meta_ads: diffAds,
  google_business_profile: diffGbp,
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
